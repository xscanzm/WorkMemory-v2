//! Episode 理解层模块
//!
//! 将原始截图 + OCR 文字自动归并为工作事件（Episode）。
//! 包含 AI 生成标题/摘要/类型/实体/待办/阻塞，以及跨天连续性关联。

use crate::ai::{chat, AiConfig, ChatMessage};
use crate::db::{generate_id, now_timestamp, Episode, Segment};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// AI 生成的 Episode 结构
#[derive(Debug, Clone, Serialize, Deserialize)]
struct AiEpisode {
    title: String,
    summary: String,
    episode_type: String,
    project: Option<String>,
    entities: Vec<Entity>,
    topics: Vec<String>,
    todos: Vec<String>,
    blockers: Vec<String>,
}

/// 实体
#[derive(Debug, Clone, Serialize, Deserialize, Hash, Eq, PartialEq)]
pub struct Entity {
    pub name: String,
    pub entity_type: String, // person / project / document
}

/// 归并连续 segments 为 Episode
///
/// 规则：相邻 segments 时间间隔 < 5 分钟且同一应用归并为一个 Episode。
pub fn merge_segments_to_episodes(segments: &[Segment]) -> Vec<Vec<Segment>> {
    if segments.is_empty() {
        return vec![];
    }

    let mut groups: Vec<Vec<Segment>> = vec![];
    let mut current_group: Vec<Segment> = vec![segments[0].clone()];

    for seg in &segments[1..] {
        let last = current_group.last().unwrap();
        let gap = seg.timestamp - last.timestamp;
        let same_app = seg.app_name.as_deref() == last.app_name.as_deref();

        if gap < 300 && same_app {
            current_group.push(seg.clone());
        } else {
            groups.push(std::mem::take(&mut current_group));
            current_group.push(seg.clone());
        }
    }
    groups.push(current_group);
    groups
}

/// 为一组 segments 生成 Episode（调用 AI）
pub async fn generate_episode(
    config: &AiConfig,
    segments: &[Segment],
) -> Result<Episode, String> {
    if segments.is_empty() {
        return Err("无 segments 可归并".to_string());
    }

    let start_time = segments.first().unwrap().timestamp;
    let end_time = segments.last().unwrap().timestamp;
    let date = chrono::DateTime::from_timestamp(start_time, 0)
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_default();

    // 收集 OCR 文本
    let ocr_texts: Vec<&str> = segments
        .iter()
        .filter_map(|s| s.ocr_text.as_deref())
        .collect();
    let combined_text = ocr_texts.join("\n---\n");

    let segment_ids: Vec<String> = segments.iter().map(|s| s.id.clone()).collect();

    // 如果没有 OCR 文本，使用窗口标题作为 fallback
    let context = if combined_text.is_empty() {
        segments
            .iter()
            .filter_map(|s| s.window_title.clone())
            .collect::<Vec<_>>()
            .join(", ")
    } else {
        combined_text
    };

    // 调用 AI 生成
    let prompt = format!(
        r#"请分析以下工作记录，生成一个工作事件（Episode）。

工作记录（OCR 文本 + 窗口标题）：
{}

请返回 JSON 格式（不要 markdown 代码块）：
{{
  "title": "5-15字简洁标题",
  "summary": "30-60字一句话摘要",
  "episode_type": "work/meeting/research/coding/planning/reading/communication 之一",
  "project": "项目名（可选）",
  "entities": [{{"name": "实体名", "entity_type": "person/project/document"}}],
  "topics": ["标签1", "标签2"],
  "todos": ["待办事项1"],
  "blockers": ["阻塞项1"]
}}"#,
        if context.len() > 3000 {
            format!("{}...(内容过长已截断)", &context[..3000])
        } else {
            context.clone()
        }
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    let response = chat(config, messages, Some(0.3)).await?;

    // 解析 AI 返回的 JSON
    let ai_episode: AiEpisode = parse_ai_response(&response)?;

    // 提取待办（如果 AI 没提取到，从 OCR 文本再提取一次）
    let mut todos = ai_episode.todos.clone();
    if todos.is_empty() {
        todos = extract_todos(&context);
    }

    let episode = Episode {
        id: generate_id(),
        date,
        start_time,
        end_time,
        title: Some(ai_episode.title),
        summary: Some(ai_episode.summary),
        episode_type: Some(ai_episode.episode_type),
        project: ai_episode.project,
        entities_json: Some(serde_json::to_string(&ai_episode.entities).unwrap_or_default()),
        topics_json: Some(serde_json::to_string(&ai_episode.topics).unwrap_or_default()),
        todos_json: Some(serde_json::to_string(&todos).unwrap_or_default()),
        blockers_json: Some(serde_json::to_string(&ai_episode.blockers).unwrap_or_default()),
        segment_ids_json: Some(serde_json::to_string(&segment_ids).unwrap_or_default()),
        source: Some("auto".to_string()),
        related_episode_ids_json: None,
        important: 0,
        created_at: now_timestamp(),
    };

    Ok(episode)
}

/// 解析 AI 响应（去除可能的 markdown 代码块标记）
fn parse_ai_response<T: for<'de> Deserialize<'de>>(response: &str) -> Result<T, String> {
    let trimmed = response.trim();
    let json_str = if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            &trimmed[start..=end]
        } else {
            trimmed
        }
    } else {
        trimmed
    };

    serde_json::from_str(json_str).map_err(|e| format!("解析 AI 响应失败: {} | 原文: {}", e, response))
}

/// 从 OCR 文本提取待办事项
///
/// 匹配模式：
/// - TODO/todo/待办/待处理/需要/下一步 后内容
/// - Markdown `- [ ] 内容`
/// - 编辑器 TODO 注释
/// - 会议记录 Action Item
pub fn extract_todos(text: &str) -> Vec<String> {
    let mut todos = Vec::new();
    let keywords = ["TODO", "todo", "待办", "待处理", "需要", "下一步", "Action Item", "action item"];

    for line in text.lines() {
        let trimmed = line.trim();

        // Markdown `- [ ] 内容`
        if let Some(content) = trimmed
            .strip_prefix("- [ ]")
            .or_else(|| trimmed.strip_prefix("* [ ]"))
            .or_else(|| trimmed.strip_prefix("+ [ ]"))
        {
            let todo = content.trim().trim_end_matches(';').trim();
            if !todo.is_empty() {
                todos.push(todo.to_string());
            }
            continue;
        }

        // 编辑器 TODO 注释：// TODO: 内容 或 # TODO: 内容
        if let Some(idx) = trimmed.find("// TODO") {
            let content = trimmed[idx + 7..].trim_start_matches(':').trim();
            if !content.is_empty() {
                todos.push(content.to_string());
            }
            continue;
        }
        if let Some(idx) = trimmed.find("# TODO") {
            let content = trimmed[idx + 6..].trim_start_matches(':').trim();
            if !content.is_empty() {
                todos.push(content.to_string());
            }
            continue;
        }

        // 关键词匹配
        for kw in &keywords {
            if let Some(idx) = trimmed.find(kw) {
                let after = trimmed[idx + kw.len()..]
                    .trim_start_matches(':')
                    .trim_start_matches('：')
                    .trim();
                if !after.is_empty() && after.len() < 100 {
                    todos.push(after.to_string());
                    break;
                }
            }
        }
    }

    // 去重
    let seen: HashSet<_> = todos.iter().cloned().collect();
    todos.into_iter().filter(|t| seen.contains(t)).collect()
}

/// 检测跨天任务连续性
///
/// 关联判断：项目名相同、实体重叠 >= 2 个、或 AI 语义相似度 > 0.8
pub fn find_related_episodes(
    current: &Episode,
    past_episodes: &[Episode],
) -> Vec<String> {
    let mut related = Vec::new();

    let current_entities: HashSet<String> = serde_json::from_str::<Vec<Entity>>(
        current.entities_json.as_deref().unwrap_or("[]"),
    )
    .unwrap_or_default()
    .into_iter()
    .map(|e| e.name)
    .collect();

    for past in past_episodes {
        let mut score = 0;

        // 项目名相同
        if let (Some(c_proj), Some(p_proj)) = (&current.project, &past.project) {
            if c_proj == p_proj {
                score += 2;
            }
        }

        // 实体重叠
        let past_entities: HashSet<String> = serde_json::from_str::<Vec<Entity>>(
            past.entities_json.as_deref().unwrap_or("[]"),
        )
        .unwrap_or_default()
        .into_iter()
        .map(|e| e.name)
        .collect();

        let overlap = current_entities.intersection(&past_entities).count();
        if overlap >= 2 {
            score += 2;
        }

        // 标题相似度（简单词重叠）
        if let (Some(c_title), Some(p_title)) = (&current.title, &past.title) {
            let c_words: HashSet<&str> = c_title.split_whitespace().collect();
            let p_words: HashSet<&str> = p_title.split_whitespace().collect();
            let title_overlap = c_words.intersection(&p_words).count();
            if title_overlap >= 2 {
                score += 1;
            }
        }

        if score >= 2 {
            related.push(past.id.clone());
        }
    }

    related
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{generate_id, now_timestamp, Segment};

    fn make_segment(ts: i64, app: &str) -> Segment {
        Segment {
            id: generate_id(),
            timestamp: ts,
            ocr_text: None,
            window_title: None,
            app_name: Some(app.to_string()),
            image_path: None,
            ocr_blocks_json: None,
            perceptual_hash: None,
            capture_source: None,
        }
    }

    #[test]
    fn test_merge_segments_same_app_close_time() {
        let base = now_timestamp();
        let segments = vec![
            make_segment(base, "code"),
            make_segment(base + 60, "code"),
            make_segment(base + 120, "code"),
        ];
        let groups = merge_segments_to_episodes(&segments);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].len(), 3);
    }

    #[test]
    fn test_merge_segments_different_app() {
        let base = now_timestamp();
        let segments = vec![
            make_segment(base, "code"),
            make_segment(base + 60, "browser"),
        ];
        let groups = merge_segments_to_episodes(&segments);
        assert_eq!(groups.len(), 2);
    }

    #[test]
    fn test_merge_segments_large_gap() {
        let base = now_timestamp();
        let segments = vec![
            make_segment(base, "code"),
            make_segment(base + 400, "code"), // > 5 分钟
        ];
        let groups = merge_segments_to_episodes(&segments);
        assert_eq!(groups.len(), 2);
    }

    #[test]
    fn test_merge_segments_empty() {
        let groups = merge_segments_to_episodes(&[]);
        assert!(groups.is_empty());
    }

    #[test]
    fn test_extract_todos_markdown() {
        let text = "- [ ] 完成登录模块\n- [ ] 修复 bug\n正文";
        let todos = extract_todos(text);
        assert_eq!(todos.len(), 2);
        assert!(todos.contains(&"完成登录模块".to_string()));
        assert!(todos.contains(&"修复 bug".to_string()));
    }

    #[test]
    fn test_extract_todos_code_comment() {
        let text = "// TODO: 重构此函数\n# TODO: 添加测试";
        let todos = extract_todos(text);
        assert!(todos.iter().any(|t| t.contains("重构此函数")));
        assert!(todos.iter().any(|t| t.contains("添加测试")));
    }

    #[test]
    fn test_extract_todos_keywords() {
        let text = "待办：准备周会材料\n下一步：联系客户";
        let todos = extract_todos(text);
        assert!(todos.iter().any(|t| t.contains("准备周会材料")));
        assert!(todos.iter().any(|t| t.contains("联系客户")));
    }

    #[test]
    fn test_extract_todos_empty() {
        let todos = extract_todos("这是一段普通文本，没有待办");
        assert!(todos.is_empty());
    }

    #[test]
    fn test_extract_todos_action_item() {
        let text = "Action Item: 跟进设计稿\naction item: 发送邮件";
        let todos = extract_todos(text);
        assert!(todos.iter().any(|t| t.contains("跟进设计稿")));
    }

    #[test]
    fn test_find_related_episodes_same_project() {
        let current = Episode {
            id: generate_id(),
            date: "2026-06-22".to_string(),
            start_time: now_timestamp(),
            end_time: now_timestamp() + 3600,
            title: Some("开发功能".to_string()),
            summary: None,
            episode_type: None,
            project: Some("WM".to_string()),
            entities_json: Some("[]".to_string()),
            topics_json: None,
            todos_json: None,
            blockers_json: None,
            segment_ids_json: None,
            source: None,
            related_episode_ids_json: None,
            important: 0,
            created_at: now_timestamp(),
        };

        let past = Episode {
            id: generate_id(),
            date: "2026-06-21".to_string(),
            start_time: now_timestamp() - 86400,
            end_time: now_timestamp() - 82800,
            title: Some("昨天开发功能".to_string()),
            summary: None,
            episode_type: None,
            project: Some("WM".to_string()),
            entities_json: Some("[]".to_string()),
            topics_json: None,
            todos_json: None,
            blockers_json: None,
            segment_ids_json: None,
            source: None,
            related_episode_ids_json: None,
            important: 0,
            created_at: now_timestamp() - 86400,
        };

        let related = find_related_episodes(&current, &[past.clone()]);
        assert_eq!(related.len(), 1);
        assert_eq!(related[0], past.id);
    }

    #[test]
    fn test_find_related_episodes_no_match() {
        let current = Episode {
            id: generate_id(),
            date: "2026-06-22".to_string(),
            start_time: now_timestamp(),
            end_time: now_timestamp() + 3600,
            title: Some("完全不同的工作".to_string()),
            summary: None,
            episode_type: None,
            project: Some("A".to_string()),
            entities_json: Some("[]".to_string()),
            topics_json: None,
            todos_json: None,
            blockers_json: None,
            segment_ids_json: None,
            source: None,
            related_episode_ids_json: None,
            important: 0,
            created_at: now_timestamp(),
        };

        let past = Episode {
            id: generate_id(),
            date: "2026-06-21".to_string(),
            start_time: now_timestamp() - 86400,
            end_time: now_timestamp() - 82800,
            title: Some("无关的旧任务".to_string()),
            summary: None,
            episode_type: None,
            project: Some("B".to_string()),
            entities_json: Some("[]".to_string()),
            topics_json: None,
            todos_json: None,
            blockers_json: None,
            segment_ids_json: None,
            source: None,
            related_episode_ids_json: None,
            important: 0,
            created_at: now_timestamp() - 86400,
        };

        let related = find_related_episodes(&current, &[past]);
        assert!(related.is_empty());
    }
}
