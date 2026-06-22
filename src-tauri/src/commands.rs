//! Tauri commands 模块
//!
//! 所有后端能力通过 #[tauri::command] 暴露给前端。
//! 命名规范：模块_操作。返回 Result<T, String>。

use crate::ai::{test_connection as ai_test, AiConfig};
use crate::capture::CaptureState;
use crate::db::{self, Episode, Report, Segment, WikiPage};
use crate::episode;
use crate::insights;
use crate::mascot::{snap_to_corner, MascotState};
use crate::ocr;
use crate::privacy::PrivacyRule;
use crate::report::{self, ReportTemplate};
use crate::search::{self, SearchFilter};
use crate::settings::AppSettings;
use crate::wiki;
use chrono::{Datelike, Local};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

// ==================== Episode 命令 ====================

#[tauri::command]
pub async fn episode_list(
    state: State<'_, crate::AppState>,
    date: Option<String>,
) -> Result<Vec<Episode>, String> {
    let db = state.db.lock();
    db.query_episodes(date.as_deref())
}

#[tauri::command]
pub async fn episode_get(
    state: State<'_, crate::AppState>,
    id: String,
) -> Result<Option<Episode>, String> {
    let db = state.db.lock();
    db.query_episode_by_id(&id)
}

#[tauri::command]
pub async fn episode_create(
    state: State<'_, crate::AppState>,
    title: String,
    summary: String,
    episode_type: String,
    project: Option<String>,
    start_time: i64,
    end_time: i64,
) -> Result<Episode, String> {
    let now = chrono::Utc::now().timestamp();
    let date = chrono::DateTime::from_timestamp(start_time, 0)
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_default();

    let episode = Episode {
        id: db::generate_id(),
        date,
        start_time,
        end_time,
        title: Some(title),
        summary: Some(summary),
        episode_type: Some(episode_type),
        project,
        entities_json: Some("[]".to_string()),
        topics_json: Some("[]".to_string()),
        todos_json: Some("[]".to_string()),
        blockers_json: Some("[]".to_string()),
        segment_ids_json: Some("[]".to_string()),
        source: Some("manual".to_string()),
        related_episode_ids_json: None,
        important: 0,
        created_at: now,
    };

    let db = state.db.lock();
    db.insert_episode(&episode)?;
    Ok(episode)
}

#[tauri::command]
pub async fn episode_update(
    state: State<'_, crate::AppState>,
    episode: Episode,
) -> Result<(), String> {
    let db = state.db.lock();
    db.update_episode(&episode)
}

#[tauri::command]
pub async fn episode_delete(
    state: State<'_, crate::AppState>,
    id: String,
) -> Result<(), String> {
    let db = state.db.lock();
    db.execute("DELETE FROM episodes WHERE id = ?", rusqlite::params![id])?;
    Ok(())
}

#[tauri::command]
pub async fn episode_mark_important(
    state: State<'_, crate::AppState>,
    id: String,
    important: bool,
) -> Result<(), String> {
    let db = state.db.lock();
    db.execute(
        "UPDATE episodes SET important = ? WHERE id = ?",
        rusqlite::params![if important { 1 } else { 0 }, id],
    )?;
    Ok(())
}

// ==================== Segment 命令 ====================

#[tauri::command]
pub async fn segment_list(
    state: State<'_, crate::AppState>,
    start_time: i64,
    end_time: i64,
) -> Result<Vec<Segment>, String> {
    let db = state.db.lock();
    db.query_segments(start_time, end_time)
}

#[tauri::command]
pub async fn segment_get(
    state: State<'_, crate::AppState>,
    id: String,
) -> Result<Option<Segment>, String> {
    let db = state.db.lock();
    let mut segments = db.query_segments(0, chrono::Utc::now().timestamp() + 86400)?;
    Ok(segments.into_iter().find(|s| s.id == id))
}

// ==================== 搜索命令 ====================

#[tauri::command]
pub async fn search_query(
    state: State<'_, crate::AppState>,
    query: String,
    sort_by: Option<String>, // time / relevance
) -> Result<search::SearchResult, String> {
    let filter = search::parse_query(&query);
    let db = state.db.lock();

    // 全文搜索
    let mut all_fts = Vec::new();
    if !filter.query.is_empty() {
        let escaped = db::escape_fts_query(&filter.query);
        if let Ok(results) = db.search_fts(&escaped, "episodes", 50) {
            all_fts.extend(results);
        }
        if let Ok(results) = db.search_fts(&escaped, "segments", 50) {
            all_fts.extend(results);
        }
        if let Ok(results) = db.search_fts(&escaped, "wiki", 50) {
            all_fts.extend(results);
        }
    }

    // 获取所有 episodes 并过滤
    let mut episodes = db.query_episodes(None)?;

    // 时间范围过滤
    if let Some(time_range) = &filter.time_range {
        episodes.retain(|e| e.start_time >= time_range.start && e.end_time <= time_range.end);
    }

    // 项目过滤
    if let Some(project) = &filter.project {
        episodes.retain(|e| e.project.as_deref() == Some(project.as_str()));
    }

    // 实体过滤
    if !filter.entities.is_empty() {
        episodes.retain(|e| {
            let entities: Vec<episode::Entity> = serde_json::from_str(
                e.entities_json.as_deref().unwrap_or("[]"),
            )
            .unwrap_or_default();
            filter
                .entities
                .iter()
                .any(|f| entities.iter().any(|en| en.name.contains(f)))
        });
    }

    // 标签过滤
    if !filter.tags.is_empty() {
        episodes.retain(|e| {
            let topics: Vec<String> = serde_json::from_str(
                e.topics_json.as_deref().unwrap_or("[]"),
            )
            .unwrap_or_default();
            filter.tags.iter().all(|t| topics.iter().any(|tp| tp.contains(t)))
        });
    }

    // 排序
    let sort = sort_by.unwrap_or_else(|| "time".to_string());
    if sort == "time" {
        episodes.sort_by(|a, b| b.start_time.cmp(&a.start_time));
    } else {
        // 相关度：FTS 结果中匹配的排前
        let fts_ids: std::collections::HashSet<String> =
            all_fts.iter().map(|f| f.id.clone()).collect();
        episodes.sort_by(|a, b| {
            let a_match = fts_ids.contains(&a.id);
            let b_match = fts_ids.contains(&b.id);
            b_match.cmp(&a_match).then_with(|| b.start_time.cmp(&a.start_time))
        });
    }

    let total = episodes.len();
    Ok(search::SearchResult {
        episodes,
        fts_results: all_fts,
        filter,
        total,
    })
}

#[tauri::command]
pub async fn search_entity_timeline(
    state: State<'_, crate::AppState>,
    entity: String,
) -> Result<Vec<Episode>, String> {
    let db = state.db.lock();
    let episodes = db.query_episodes(None)?;
    let filtered: Vec<Episode> = episodes
        .into_iter()
        .filter(|e| {
            let entities: Vec<episode::Entity> = serde_json::from_str(
                e.entities_json.as_deref().unwrap_or("[]"),
            )
            .unwrap_or_default();
            entities.iter().any(|en| en.name.contains(&entity))
        })
        .collect();
    Ok(filtered)
}

// ==================== 报告命令 ====================

#[tauri::command]
pub async fn report_generate(
    state: State<'_, crate::AppState>,
    app: AppHandle,
    template_id: String,
    date: Option<String>,
    supplement: String,
) -> Result<String, String> {
    let template = ReportTemplate::from_id(&template_id)
        .ok_or_else(|| format!("未知模板: {}", template_id))?;

    let target_date = date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());

    let episodes = {
        let db = state.db.lock();
        db.query_episodes(Some(&target_date))?
    };

    let config = {
        let settings = state.settings.lock();
        AiConfig::from(&*settings)
    };

    let app_clone = app.clone();
    let report_id = db::generate_id();
    let report_date = target_date.clone();
    let template_name = template.name().to_string();

    let content = report::generate_report_stream(
        &config,
        &template,
        &episodes,
        &supplement,
        |token| {
            let _ = app_clone.emit("report-token", token);
        },
    )
    .await?;

    // 保存报告
    let report = Report {
        id: report_id,
        date: report_date,
        report_type: template_id.clone(),
        template_id: Some(template_id),
        content: Some(content.clone()),
        word_count: Some(content.chars().count() as i64),
        exported_at: None,
        created_at: chrono::Utc::now().timestamp(),
    };

    {
        let db = state.db.lock();
        db.insert_report(&report)?;
    }

    let _ = app.emit("report-completed", &report);
    Ok(report.id)
}

#[tauri::command]
pub async fn report_list(
    state: State<'_, crate::AppState>,
    date: Option<String>,
) -> Result<Vec<Report>, String> {
    let db = state.db.lock();
    db.query_reports(date.as_deref())
}

#[tauri::command]
pub async fn report_get(
    state: State<'_, crate::AppState>,
    id: String,
) -> Result<Option<Report>, String> {
    let db = state.db.lock();
    let reports = db.query_reports(None)?;
    Ok(reports.into_iter().find(|r| r.id == id))
}

#[tauri::command]
pub async fn report_delete(
    state: State<'_, crate::AppState>,
    id: String,
) -> Result<(), String> {
    let db = state.db.lock();
    db.execute("DELETE FROM reports WHERE id = ?", rusqlite::params![id])?;
    Ok(())
}

#[tauri::command]
pub async fn report_export_markdown(
    state: State<'_, crate::AppState>,
    id: String,
) -> Result<String, String> {
    let db = state.db.lock();
    let reports = db.query_reports(None)?;
    let report = reports
        .into_iter()
        .find(|r| r.id == id)
        .ok_or("报告不存在")?;
    let template_name = ReportTemplate::from_id(&report.report_type)
        .map(|t| t.name().to_string())
        .unwrap_or_else(|| report.report_type.clone());
    Ok(report::export_markdown(
        report.content.as_deref().unwrap_or(""),
        &report.date,
        &template_name,
    ))
}

#[tauri::command]
pub async fn report_export_word(
    state: State<'_, crate::AppState>,
    id: String,
) -> Result<Vec<u8>, String> {
    let db = state.db.lock();
    let reports = db.query_reports(None)?;
    let report = reports
        .into_iter()
        .find(|r| r.id == id)
        .ok_or("报告不存在")?;
    let template_name = ReportTemplate::from_id(&report.report_type)
        .map(|t| t.name().to_string())
        .unwrap_or_else(|| report.report_type.clone());
    Ok(report::export_word(
        report.content.as_deref().unwrap_or(""),
        &report.date,
        &template_name,
    ))
}

// ==================== Wiki 命令 ====================

#[tauri::command]
pub async fn wiki_list(
    state: State<'_, crate::AppState>,
    wiki_type: Option<String>,
) -> Result<Vec<WikiPage>, String> {
    let db = state.db.lock();
    db.query_wiki_pages(wiki_type.as_deref())
}

#[tauri::command]
pub async fn wiki_get(
    state: State<'_, crate::AppState>,
    id: String,
) -> Result<Option<WikiPage>, String> {
    let db = state.db.lock();
    let pages = db.query_wiki_pages(None)?;
    Ok(pages.into_iter().find(|p| p.id == id))
}

#[tauri::command]
pub async fn wiki_create(
    state: State<'_, crate::AppState>,
    title: String,
    wiki_type: String,
    content: String,
) -> Result<WikiPage, String> {
    let now = chrono::Utc::now().timestamp();
    let page = WikiPage {
        id: db::generate_id(),
        title,
        wiki_type,
        content: Some(content),
        backlinks_json: Some("[]".to_string()),
        last_cited_at: Some(now),
        status: Some("confirmed".to_string()),
        created_at: now,
        updated_at: now,
    };
    let db = state.db.lock();
    db.insert_wiki_page(&page)?;
    Ok(page)
}

#[tauri::command]
pub async fn wiki_update(
    state: State<'_, crate::AppState>,
    page: WikiPage,
) -> Result<(), String> {
    let db = state.db.lock();
    db.update_wiki_page(&page)
}

#[tauri::command]
pub async fn wiki_delete(
    state: State<'_, crate::AppState>,
    id: String,
) -> Result<(), String> {
    let db = state.db.lock();
    db.execute("DELETE FROM wiki_pages WHERE id = ?", rusqlite::params![id])?;
    Ok(())
}

#[tauri::command]
pub async fn wiki_approve(
    state: State<'_, crate::AppState>,
    id: String,
    action: String, // confirm / ignore
) -> Result<(), String> {
    let db = state.db.lock();
    let status = match action.as_str() {
        "confirm" => "confirmed",
        "ignore" => "ignored",
        _ => return Err(format!("未知操作: {}", action)),
    };
    db.execute(
        "UPDATE wiki_pages SET status = ?, updated_at = ? WHERE id = ?",
        rusqlite::params![status, chrono::Utc::now().timestamp(), id],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn wiki_import_obsidian(
    state: State<'_, crate::AppState>,
    files: Vec<(String, String)>, // (filename, content)
) -> Result<u32, String> {
    let db = state.db.lock();
    let mut count = 0;
    for (filename, content) in files {
        let page = wiki::import_obsidian_file(&content, &filename);
        db.insert_wiki_page(&page)?;
        count += 1;
    }
    Ok(count)
}

// ==================== 采集命令 ====================

#[tauri::command]
pub async fn capture_start(state: State<'_, crate::AppState>) -> Result<(), String> {
    *state.capture.is_paused.lock() = false;
    Ok(())
}

#[tauri::command]
pub async fn capture_stop(state: State<'_, crate::AppState>) -> Result<(), String> {
    *state.capture.is_paused.lock() = true;
    Ok(())
}

#[tauri::command]
pub async fn capture_status(state: State<'_, crate::AppState>) -> Result<serde_json::Value, String> {
    let is_paused = *state.capture.is_paused.lock();
    let in_privacy = *state.capture.in_privacy_mode.lock();
    let switch_count = *state.capture.today_switch_count.lock();
    Ok(serde_json::json!({
        "is_paused": is_paused,
        "in_privacy_mode": in_privacy,
        "functional_state": if is_paused { "paused" } else if in_privacy { "privacy" } else { "recording" },
        "today_switch_count": switch_count,
    }))
}

#[tauri::command]
pub async fn capture_get_today_stats(
    state: State<'_, crate::AppState>,
) -> Result<serde_json::Value, String> {
    let today = Local::now().format("%Y-%m-%d").to_string();
    let db = state.db.lock();
    let episodes = db.query_episodes(Some(&today))?;
    let total_focus: i64 = episodes.iter().map(|e| e.end_time - e.start_time).sum();
    let switch_count = *state.capture.today_switch_count.lock();

    // 统计待办
    let mut todo_count = 0;
    let mut todo_done = 0;
    for e in &episodes {
        let todos: Vec<serde_json::Value> = serde_json::from_str(
            e.todos_json.as_deref().unwrap_or("[]"),
        )
        .unwrap_or_default();
        todo_count += todos.len();
    }

    Ok(serde_json::json!({
        "episode_count": episodes.len(),
        "focus_seconds": total_focus,
        "focus_hours": total_focus as f64 / 3600.0,
        "switch_count": switch_count,
        "todo_count": todo_count,
        "todo_done": todo_done,
    }))
}

// ==================== 隐私规则命令 ====================

#[tauri::command]
pub async fn privacy_rule_list(
    state: State<'_, crate::AppState>,
) -> Result<Vec<PrivacyRule>, String> {
    let db = state.db.lock();
    let rules = db.prepare(
        "SELECT id, rule_type, pattern, enabled, created_at FROM privacy_rules ORDER BY created_at DESC",
        |stmt| {
            let rows = stmt.query_map([], |row| {
                Ok(PrivacyRule {
                    id: row.get(0)?,
                    rule_type: row.get(1)?,
                    pattern: row.get(2)?,
                    enabled: row.get::<_, i64>(3)? != 0,
                    created_at: row.get(4)?,
                })
            })?;
            rows.collect::<Result<Vec<_>, _>>()
        },
    )?;
    Ok(rules)
}

#[tauri::command]
pub async fn privacy_rule_add(
    state: State<'_, crate::AppState>,
    rule_type: String,
    pattern: String,
) -> Result<String, String> {
    let id = db::generate_id();
    let db = state.db.lock();
    db.execute(
        "INSERT INTO privacy_rules (id, rule_type, pattern, enabled, created_at) VALUES (?, ?, ?, 1, ?)",
        rusqlite::params![id, rule_type, pattern, chrono::Utc::now().timestamp()],
    )?;
    Ok(id)
}

#[tauri::command]
pub async fn privacy_rule_delete(
    state: State<'_, crate::AppState>,
    id: String,
) -> Result<(), String> {
    let db = state.db.lock();
    db.execute("DELETE FROM privacy_rules WHERE id = ?", rusqlite::params![id])?;
    Ok(())
}

#[tauri::command]
pub async fn privacy_rule_toggle(
    state: State<'_, crate::AppState>,
    id: String,
    enabled: bool,
) -> Result<(), String> {
    let db = state.db.lock();
    db.execute(
        "UPDATE privacy_rules SET enabled = ? WHERE id = ?",
        rusqlite::params![if enabled { 1 } else { 0 }, id],
    )?;
    Ok(())
}

// ==================== OCR 命令 ====================

#[tauri::command]
pub async fn ocr_status() -> Result<ocr::OcrStatus, String> {
    Ok(ocr::get_status())
}

#[tauri::command]
pub async fn ocr_test() -> Result<String, String> {
    ocr::test_ocr().await
}

// ==================== 设置命令 ====================

#[tauri::command]
pub async fn settings_get(
    state: State<'_, crate::AppState>,
) -> Result<AppSettings, String> {
    Ok(state.settings.lock().clone())
}

#[tauri::command]
pub async fn settings_set(
    state: State<'_, crate::AppState>,
    app: AppHandle,
    settings: AppSettings,
) -> Result<(), String> {
    *state.settings.lock() = settings.clone();
    crate::settings::save_settings(&app, &settings).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn settings_test_ai(
    state: State<'_, crate::AppState>,
) -> Result<String, String> {
    let config = {
        let settings = state.settings.lock();
        AiConfig::from(&*settings)
    };
    ai_test(&config).await
}

// ==================== 数据管理命令 ====================

#[tauri::command]
pub async fn data_stats(
    state: State<'_, crate::AppState>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock();
    let episode_count: i64 = db
        .query_one("SELECT COUNT(*) FROM episodes")
        .map_err(|e| e.to_string())?;
    let segment_count: i64 = db
        .query_one("SELECT COUNT(*) FROM segments")
        .map_err(|e| e.to_string())?;
    let wiki_count: i64 = db
        .query_one("SELECT COUNT(*) FROM wiki_pages")
        .map_err(|e| e.to_string())?;
    let report_count: i64 = db
        .query_one("SELECT COUNT(*) FROM reports")
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "episodes": episode_count,
        "segments": segment_count,
        "wiki_pages": wiki_count,
        "reports": report_count,
    }))
}

#[tauri::command]
pub async fn data_clear(
    state: State<'_, crate::AppState>,
    before_date: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock();
    if let Some(date) = before_date {
        db.execute("DELETE FROM segments WHERE datetime(timestamp, 'unixepoch') < datetime(?)", rusqlite::params![date])?;
        db.execute("DELETE FROM episodes WHERE date < ?", rusqlite::params![date])?;
    } else {
        db.execute("DELETE FROM segments", [])?;
        db.execute("DELETE FROM episodes", [])?;
        db.execute("DELETE FROM clipboard_items", [])?;
    }
    Ok(())
}

#[tauri::command]
pub async fn data_export(
    state: State<'_, crate::AppState>,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock();
    let episodes = db.query_episodes(None)?;
    let wiki_pages = db.query_wiki_pages(None)?;
    let reports = db.query_reports(None)?;

    Ok(serde_json::json!({
        "episodes": episodes,
        "wiki_pages": wiki_pages,
        "reports": reports,
        "exported_at": chrono::Utc::now().timestamp(),
    }))
}

// ==================== 待办命令 ====================

#[tauri::command]
pub async fn todo_list(
    state: State<'_, crate::AppState>,
    date: Option<String>,
) -> Result<serde_json::Value, String> {
    let target_date = date.unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());
    let db = state.db.lock();
    let episodes = db.query_episodes(Some(&target_date))?;

    let mut todos: Vec<serde_json::Value> = Vec::new();
    for e in &episodes {
        let episode_todos: Vec<String> = serde_json::from_str(
            e.todos_json.as_deref().unwrap_or("[]"),
        )
        .unwrap_or_default();
        for todo in episode_todos {
            todos.push(serde_json::json!({
                "id": db::generate_id(),
                "episode_id": e.id,
                "content": todo,
                "done": false,
            }));
        }
    }
    Ok(serde_json::json!(todos))
}

#[tauri::command]
pub async fn todo_toggle(
    state: State<'_, crate::AppState>,
    episode_id: String,
    todo_index: usize,
    done: bool,
) -> Result<(), String> {
    let db = state.db.lock();
    let episode = db
        .query_episode_by_id(&episode_id)?
        .ok_or("Episode 不存在")?;
    let mut todos: Vec<String> = serde_json::from_str(
        episode.todos_json.as_deref().unwrap_or("[]"),
    )
    .unwrap_or_default();

    if todo_index < todos.len() {
        let prefix = if done { "☑ " } else { "" };
        let content = todos[todo_index].trim_start_matches("☑ ").trim_start_matches("☐ ").to_string();
        todos[todo_index] = format!("{}{}", prefix, content);
    }

    let json = serde_json::to_string(&todos).unwrap_or_default();
    db.execute(
        "UPDATE episodes SET todos_json = ? WHERE id = ?",
        rusqlite::params![json, episode_id],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn todo_add(
    state: State<'_, crate::AppState>,
    episode_id: Option<String>,
    content: String,
) -> Result<(), String> {
    let db = state.db.lock();
    if let Some(eid) = episode_id {
        let episode = db
            .query_episode_by_id(&eid)?
            .ok_or("Episode 不存在")?;
        let mut todos: Vec<String> = serde_json::from_str(
            episode.todos_json.as_deref().unwrap_or("[]"),
        )
        .unwrap_or_default();
        todos.push(content);
        let json = serde_json::to_string(&todos).unwrap_or_default();
        db.execute(
            "UPDATE episodes SET todos_json = ? WHERE id = ?",
            rusqlite::params![json, eid],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub async fn todo_delete(
    state: State<'_, crate::AppState>,
    episode_id: String,
    todo_index: usize,
) -> Result<(), String> {
    let db = state.db.lock();
    let episode = db
        .query_episode_by_id(&episode_id)?
        .ok_or("Episode 不存在")?;
    let mut todos: Vec<String> = serde_json::from_str(
        episode.todos_json.as_deref().unwrap_or("[]"),
    )
    .unwrap_or_default();
    if todo_index < todos.len() {
        todos.remove(todo_index);
    }
    let json = serde_json::to_string(&todos).unwrap_or_default();
    db.execute(
        "UPDATE episodes SET todos_json = ? WHERE id = ?",
        rusqlite::params![json, episode_id],
    )?;
    Ok(())
}

// ==================== 日历命令 ====================

#[tauri::command]
pub async fn calendar_month_data(
    state: State<'_, crate::AppState>,
    year: i32,
    month: u32,
) -> Result<serde_json::Value, String> {
    let db = state.db.lock();
    let episodes = db.query_episodes(None)?;

    let mut days: Vec<serde_json::Value> = Vec::new();
    let days_in_month = chrono::NaiveDate::from_ymd_opt(
        if month == 12 { year + 1 } else { year },
        if month == 12 { 1 } else { month + 1 },
        1,
    )
    .unwrap()
    .pred_opt()
    .unwrap()
    .day();

    for day in 1..=days_in_month {
        let date_str = format!("{:04}-{:02}-{:02}", year, month, day);
        let day_episodes: Vec<&Episode> = episodes
            .iter()
            .filter(|e| e.date == date_str)
            .collect();
        let total_seconds: i64 = day_episodes
            .iter()
            .map(|e| e.end_time - e.start_time)
            .sum();
        let titles: Vec<String> = day_episodes
            .iter()
            .map(|e| e.title.clone().unwrap_or_default())
            .collect();

        days.push(serde_json::json!({
            "date": date_str,
            "day": day,
            "work_seconds": total_seconds,
            "work_hours": total_seconds as f64 / 3600.0,
            "episode_count": day_episodes.len(),
            "summary": titles.first().cloned().unwrap_or_default(),
        }));
    }

    Ok(serde_json::json!(days))
}

#[tauri::command]
pub async fn calendar_day_detail(
    state: State<'_, crate::AppState>,
    date: String,
) -> Result<Vec<Episode>, String> {
    let db = state.db.lock();
    db.query_episodes(Some(&date))
}

// ==================== 洞察命令 ====================

#[tauri::command]
pub async fn insights_list(
    state: State<'_, crate::AppState>,
) -> Result<Vec<insights::InsightCard>, String> {
    let db = state.db.lock();
    let episodes = db.query_episodes(None)?;
    Ok(insights::generate_insights(&episodes))
}

#[tauri::command]
pub async fn insights_set_weekly_goals(
    state: State<'_, crate::AppState>,
    goals: Vec<String>,
) -> Result<(), String> {
    let now = Local::now();
    let week_start = now.date_naive() - chrono::Duration::days(now.weekday().num_days_from_monday() as i64);
    let db = state.db.lock();
    db.execute(
        "INSERT INTO user_goals (id, week_start, goals_json, created_at) VALUES (?, ?, ?, ?)",
        rusqlite::params![
            db::generate_id(),
            week_start.to_string(),
            serde_json::to_string(&goals).unwrap_or_default(),
            chrono::Utc::now().timestamp(),
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn insights_dashboard(
    state: State<'_, crate::AppState>,
) -> Result<insights::Dashboard, String> {
    let db = state.db.lock();
    let episodes = db.query_episodes(None)?;
    let wiki_pages = db.query_wiki_pages(None)?;
    Ok(insights::calculate_dashboard(&episodes, &wiki_pages))
}

// ==================== 图谱命令 ====================

#[tauri::command]
pub async fn graph_data(
    state: State<'_, crate::AppState>,
) -> Result<wiki::GraphData, String> {
    let db = state.db.lock();
    let wiki_pages = db.query_wiki_pages(None)?;
    let episodes = db.query_episodes(None)?;
    Ok(wiki::build_graph(&wiki_pages, &episodes))
}

// ==================== Mascot 命令 ====================

#[tauri::command]
pub async fn mascot_get_state(
    state: State<'_, crate::AppState>,
) -> Result<MascotState, String> {
    let settings = state.settings.lock();
    let capture = state.capture.clone();
    let is_paused = *capture.is_paused.lock();
    let in_privacy = *capture.in_privacy_mode.lock();

    let functional_state = if is_paused {
        "paused"
    } else if in_privacy {
        "privacy"
    } else {
        "recording"
    };

    Ok(MascotState {
        functional_state: functional_state.to_string(),
        emotional_state: "neutral".to_string(),
        form: settings.mascot_form.clone(),
        size: settings.mascot_size,
        position: (1820, 980),
        visible: settings.mascot_enabled,
    })
}

#[tauri::command]
pub async fn mascot_set_form(
    state: State<'_, crate::AppState>,
    app: AppHandle,
    form: String,
) -> Result<(), String> {
    let mut settings = state.settings.lock().clone();
    settings.mascot_form = form;
    *state.settings.lock() = settings.clone();
    crate::settings::save_settings(&app, &settings).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn mascot_set_position(
    state: State<'_, crate::AppState>,
    app: AppHandle,
    x: i32,
    y: i32,
) -> Result<(i32, i32), String> {
    // 持久化位置（存入 settings 的自定义字段，这里简化用 store）
    let _ = app;
    Ok((x, y))
}

#[tauri::command]
pub async fn mascot_get_position() -> Result<(i32, i32), String> {
    Ok((1820, 980))
}

#[tauri::command]
pub async fn mascot_hide_temporarily(
    app: AppHandle,
    minutes: u32,
) -> Result<(), String> {
    // 通过 event 通知前端隐藏
    let _ = app.emit("mascot-hide", serde_json::json!({ "minutes": minutes }));
    tracing::info!("Mascot 隐藏 {} 分钟", minutes);
    Ok(())
}

#[tauri::command]
pub async fn mascot_show_bubble(
    app: AppHandle,
    message: String,
    mode: u8, // 1=纯文字 2=带按钮 3=摘要卡片
) -> Result<(), String> {
    let _ = app.emit("mascot-show-bubble", serde_json::json!({
        "message": message,
        "mode": mode,
    }));
    Ok(())
}

#[tauri::command]
pub async fn mascot_quick_capture(
    state: State<'_, crate::AppState>,
    content: String,
) -> Result<Episode, String> {
    // 快速捕获：保存为手动 Episode
    let now = chrono::Utc::now().timestamp();
    let date = Local::now().format("%Y-%m-%d").to_string();

    // 解析 #标签 @项目
    let mut topics: Vec<String> = Vec::new();
    let mut project: Option<String> = None;
    let mut clean_content = content.clone();

    let tag_re = regex::Regex::new(r"#(\S+)").unwrap();
    clean_content = tag_re.replace_all(&clean_content, "").to_string();
    for caps in tag_re.captures_iter(&content) {
        topics.push(caps[1].to_string());
    }

    let proj_re = regex::Regex::new(r"@(\S+)").unwrap();
    clean_content = proj_re.replace_all(&clean_content, "").to_string();
    if let Some(caps) = proj_re.captures(&content) {
        project = Some(caps[1].to_string());
    }

    let episode = Episode {
        id: db::generate_id(),
        date,
        start_time: now,
        end_time: now,
        title: Some(clean_content.trim().chars().take(15).collect()),
        summary: Some(clean_content.trim().to_string()),
        episode_type: Some("work".to_string()),
        project,
        entities_json: Some("[]".to_string()),
        topics_json: Some(serde_json::to_string(&topics).unwrap_or_default()),
        todos_json: Some("[]".to_string()),
        blockers_json: Some("[]".to_string()),
        segment_ids_json: Some("[]".to_string()),
        source: Some("manual".to_string()),
        related_episode_ids_json: None,
        important: 0,
        created_at: now,
    };

    let db = state.db.lock();
    db.insert_episode(&episode)?;
    Ok(episode)
}

// ==================== 日志命令 ====================

#[tauri::command]
pub async fn log_frontend_error(message: String, level: Option<String>) -> Result<(), String> {
    crate::logging::log_frontend(message, level.unwrap_or_else(|| "error".to_string()));
    Ok(())
}

// ==================== 快速捕获命令 ====================

#[tauri::command]
pub async fn quick_capture(
    state: State<'_, crate::AppState>,
    content: String,
) -> Result<Episode, String> {
    mascot_quick_capture(state, content).await
}
