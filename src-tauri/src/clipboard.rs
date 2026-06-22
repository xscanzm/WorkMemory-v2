//! 剪贴板监听模块
//!
//! 监听用户复制操作，经隐私规则过滤后与当前活跃 Segment 关联存储。
//! 超过 5000 字符只取前 500 字符 + 标注「内容过长」。

use crate::db::{generate_id, now_timestamp};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// 启动剪贴板监听
pub fn start_clipboard_listener(app: AppHandle) {
    // 使用定时轮询方式监听剪贴板（Tauri v2 clipboard-manager 插件的监听 API 在不同平台表现不一）
    let app_clone = app.clone();
    tokio::spawn(async move {
        let mut last_content: String = String::new();
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
        interval.tick().await; // 跳过首次

        loop {
            interval.tick().await;
            if let Err(e) = poll_clipboard(&app_clone, &mut last_content).await {
                tracing::debug!("剪贴板轮询失败: {}", e);
            }
        }
    });
}

/// 轮询剪贴板内容
async fn poll_clipboard(app: &AppHandle, last_content: &mut String) -> Result<(), String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;

    let content = app
        .clipboard()
        .read_text()
        .map_err(|e| format!("{}", e))?;

    let text = content;
    if text != *last_content && !text.is_empty() {
        *last_content = text.clone();
        handle_clipboard_change(app, &text)?;
    }

    Ok(())
}

/// 处理剪贴板变化
fn handle_clipboard_change(app: &AppHandle, content: &str) -> Result<(), String> {
    let state = app.state::<crate::AppState>();
    let capture = state.capture.clone();

    // 隐私过滤
    let current_app = capture.current_app_name.lock();
    let current_title = capture.current_window_title.lock();
    let app_name = current_app.as_deref().unwrap_or("");
    let title = current_title.as_deref().unwrap_or("");

    // 密码管理器、银行 app 等跳过
    let settings = state.settings.lock();
    if crate::privacy::is_blocked_by_rules(title, app_name, &settings) {
        tracing::debug!("剪贴板内容被隐私规则过滤");
        return Ok(());
    }
    drop(settings);
    drop(current_app);
    drop(current_title);

    // 内容截断
    let (stored_content, content_type) = if content.len() > 5000 {
        (format!("{}...(内容过长)", &content[..500]), "text_truncated")
    } else {
        (content.to_string(), "text")
    };

    // 关联当前活跃 segment
    let segment_id = capture.current_segment_id.lock().clone();

    // 存入数据库
    let db = state.db.lock();
    db.execute(
        "INSERT INTO clipboard_items (id, segment_id, content, content_type, created_at) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![
            generate_id(),
            segment_id.unwrap_or_default(),
            stored_content,
            content_type,
            now_timestamp(),
        ],
    )?;

    tracing::debug!("剪贴板内容已记录: {} 字符", stored_content.len());
    Ok(())
}
