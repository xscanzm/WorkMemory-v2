//! 知识库（Wiki）模块
//!
//! 6 种知识卡片类型，AI 自动提炼，审核队列，双链关联，健康度标记，Obsidian 导入。

use crate::ai::{chat, AiConfig, ChatMessage};
use crate::db::{generate_id, now_timestamp, Episode, WikiPage};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Wiki 类型
pub const WIKI_TYPES: &[&str] = &["person", "project", "decision", "meeting", "topic", "skill"];

/// AI 提炼的 Wiki 卡片
#[derive(Debug, Clone, Serialize, Deserialize)]
struct AiWikiSuggestion {
    title: String,
    wiki_type: String,
    content: String,
}

/// 从 Episodes 提炼知识卡片
pub async fn extract_wiki_from_episodes(
    config: &AiConfig,
    episodes: &[Episode],
) -> Result<Vec<WikiPage>, String> {
    let episodes_text: Vec<String> = episodes
        .iter()
        .map(|e| {
            format!(
                "- {} ({}): {} | 实体: {} | 待办: {}",
                e.title.as_deref().unwrap_or(""),
                e.episode_type.as_deref().unwrap_or(""),
                e.summary.as_deref().unwrap_or(""),
                e.entities_json.as_deref().unwrap_or("[]"),
                e.todos_json.as_deref().unwrap_or("[]")
            )
        })
        .collect();

    let prompt = format!(
        r#"请从以下工作事件中提炼值得记录的知识卡片。

工作事件：
{}

请返回 JSON 数组（不要 markdown 代码块），每项包含：
{{
  "title": "卡片标题",
  "wiki_type": "person/project/decision/meeting/topic/skill 之一",
  "content": "卡片描述内容"
}}

只提炼真正有价值的知识，避免重复。如果无可提炼内容，返回空数组 []。"#,
        episodes_text.join("\n")
    );

    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    let response = chat(config, messages, Some(0.3)).await?;
    let suggestions: Vec<AiWikiSuggestion> = parse_ai_response(&response)?;

    let now = now_timestamp();
    let pages: Vec<WikiPage> = suggestions
        .into_iter()
        .map(|s| WikiPage {
            id: generate_id(),
            title: s.title,
            wiki_type: s.wiki_type,
            content: Some(s.content),
            backlinks_json: Some("[]".to_string()),
            last_cited_at: Some(now),
            status: Some("pending".to_string()), // 进入审核队列
            created_at: now,
            updated_at: now,
        })
        .collect();

    Ok(pages)
}

/// 解析 AI 响应
fn parse_ai_response<T: for<'de> Deserialize<'de>>(response: &str) -> Result<T, String> {
    let trimmed = response.trim();
    let json_str = if let Some(start) = trimmed.find('[') {
        if let Some(end) = trimmed.rfind(']') {
            &trimmed[start..=end]
        } else {
            trimmed
        }
    } else if let Some(start) = trimmed.find('{') {
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

/// Obsidian 双链解析
///
/// 解析 [[链接]] 语法，返回 (链接文本, 解析后的内容)
pub fn parse_obsidian_links(content: &str) -> (Vec<String>, String) {
    let mut links = Vec::new();
    let re = regex::Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
    let processed = re.replace_all(content, |caps: &regex::Captures| {
        let link = caps[1].to_string();
        links.push(link.clone());
        format!("[{}]", link) // 转为单括号链接
    });
    (links, processed.to_string())
}

/// 导入 Obsidian .md 文件
pub fn import_obsidian_file(content: &str, filename: &str) -> WikiPage {
    let (links, processed) = parse_obsidian_links(content);
    let now = now_timestamp();

    // 提取标题（第一个 # 标题或文件名）
    let title = content
        .lines()
        .find_map(|line| line.strip_prefix("# ").map(|s| s.trim().to_string()))
        .unwrap_or_else(|| filename.trim_end_matches(".md").to_string());

    WikiPage {
        id: generate_id(),
        title,
        wiki_type: "topic".to_string(),
        content: Some(processed),
        backlinks_json: Some(serde_json::to_string(&links).unwrap_or_default()),
        last_cited_at: Some(now),
        status: Some("pending".to_string()), // 进入审核队列
        created_at: now,
        updated_at: now,
    }
}

/// 检查知识卡片健康度
///
/// 超过 30 天未被新 Episode 引用 → 标记「待复核」
pub fn check_wiki_health(page: &WikiPage) -> WikiHealth {
    let now = now_timestamp();
    let last_cited = page.last_cited_at.unwrap_or(page.created_at);
    let days_since_cited = (now - last_cited) / 86400;

    if days_since_cited > 30 {
        WikiHealth::Stale
    } else if days_since_cited < 7 {
        WikiHealth::Active
    } else {
        WikiHealth::Normal
    }
}

#[derive(Debug, Clone, Serialize)]
pub enum WikiHealth {
    Active,
    Normal,
    Stale,
}

impl WikiHealth {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Active => "活跃",
            Self::Normal => "正常",
            Self::Stale => "待复核",
        }
    }
}

/// 构建图谱数据
#[derive(Debug, Clone, Serialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphNode {
    pub id: String,
    pub label: String,
    pub wiki_type: String,
    pub size: f64, // 引用次数
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub weight: u32,
}

/// 从 Wiki 页面和 Episodes 构建图谱
pub fn build_graph(wiki_pages: &[WikiPage], episodes: &[Episode]) -> GraphData {
    let mut nodes: Vec<GraphNode> = Vec::new();
    let mut edge_map: HashMap<(String, String), u32> = HashMap::new();

    // 节点 = Wiki 卡片，大小 = 引用次数
    for page in wiki_pages {
        let citation_count = episodes
            .iter()
            .filter(|e| {
                e.entities_json
                    .as_deref()
                    .unwrap_or("[]")
                    .contains(&page.title)
            })
            .count();

        nodes.push(GraphNode {
            id: page.id.clone(),
            label: page.title.clone(),
            wiki_type: page.wiki_type.clone(),
            size: 10.0 + citation_count as f64 * 2.0,
        });
    }

    // 边 = 被同一 Episode 提及
    for episode in episodes {
        let entities: Vec<crate::episode::Entity> = serde_json::from_str(
            episode.entities_json.as_deref().unwrap_or("[]"),
        )
        .unwrap_or_default();
        let entity_names: Vec<String> = entities.iter().map(|e| e.name.clone()).collect();

        // 找到该 episode 涉及的所有 wiki 页面
        let related_pages: Vec<&WikiPage> = wiki_pages
            .iter()
            .filter(|p| entity_names.contains(&p.title))
            .collect();

        // 两两建边
        for i in 0..related_pages.len() {
            for j in (i + 1)..related_pages.len() {
                let key = if related_pages[i].id < related_pages[j].id {
                    (related_pages[i].id.clone(), related_pages[j].id.clone())
                } else {
                    (related_pages[j].id.clone(), related_pages[i].id.clone())
                };
                *edge_map.entry(key).or_insert(0) += 1;
            }
        }
    }

    let edges: Vec<GraphEdge> = edge_map
        .into_iter()
        .map(|((source, target), weight)| GraphEdge { source, target, weight })
        .collect();

    GraphData { nodes, edges }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{generate_id, now_timestamp, WikiPage};

    #[test]
    fn test_parse_obsidian_links_single() {
        let content = "这是 [[张三]] 的笔记";
        let (links, processed) = parse_obsidian_links(content);
        assert_eq!(links, vec!["张三".to_string()]);
        assert!(processed.contains("[张三]"));
        assert!(!processed.contains("[[张三]]"));
    }

    #[test]
    fn test_parse_obsidian_links_multiple() {
        let content = "关联 [[项目A]] 和 [[项目B]] 以及 [[张三]]";
        let (links, _) = parse_obsidian_links(content);
        assert_eq!(links.len(), 3);
        assert!(links.contains(&"项目A".to_string()));
        assert!(links.contains(&"项目B".to_string()));
        assert!(links.contains(&"张三".to_string()));
    }

    #[test]
    fn test_parse_obsidian_links_none() {
        let content = "这是一段普通文本，没有双链";
        let (links, processed) = parse_obsidian_links(content);
        assert!(links.is_empty());
        assert_eq!(processed, content);
    }

    #[test]
    fn test_check_wiki_health_active() {
        let now = now_timestamp();
        let page = WikiPage {
            id: generate_id(),
            title: "活跃卡片".to_string(),
            wiki_type: "project".to_string(),
            content: None,
            backlinks_json: None,
            last_cited_at: Some(now - 86400 * 3), // 3 天前
            status: None,
            created_at: now - 86400 * 10,
            updated_at: now,
        };
        assert!(matches!(check_wiki_health(&page), WikiHealth::Active));
    }

    #[test]
    fn test_check_wiki_health_stale() {
        let now = now_timestamp();
        let page = WikiPage {
            id: generate_id(),
            title: "陈旧卡片".to_string(),
            wiki_type: "project".to_string(),
            content: None,
            backlinks_json: None,
            last_cited_at: Some(now - 86400 * 45), // 45 天前
            status: None,
            created_at: now - 86400 * 100,
            updated_at: now - 86400 * 45,
        };
        assert!(matches!(check_wiki_health(&page), WikiHealth::Stale));
    }

    #[test]
    fn test_check_wiki_health_normal() {
        let now = now_timestamp();
        let page = WikiPage {
            id: generate_id(),
            title: "正常卡片".to_string(),
            wiki_type: "topic".to_string(),
            content: None,
            backlinks_json: None,
            last_cited_at: Some(now - 86400 * 15), // 15 天前
            status: None,
            created_at: now - 86400 * 30,
            updated_at: now - 86400 * 15,
        };
        assert!(matches!(check_wiki_health(&page), WikiHealth::Normal));
    }

    #[test]
    fn test_import_obsidian_file_extracts_title() {
        let content = "# 项目设计文档\n\n这是 [[项目A]] 的设计";
        let page = import_obsidian_file(content, "test.md");
        assert_eq!(page.title, "项目设计文档");
        assert_eq!(page.wiki_type, "topic");
        assert_eq!(page.status.as_deref(), Some("pending"));
    }

    #[test]
    fn test_import_obsidian_file_fallback_title() {
        let content = "没有标题的文档";
        let page = import_obsidian_file(content, "笔记.md");
        assert_eq!(page.title, "笔记");
    }
}
