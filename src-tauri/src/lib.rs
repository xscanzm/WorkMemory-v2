//! WorkMemory 应用库入口
//!
//! 包含数据库管理、记忆采集、OCR、IPC 命令等后端模块。

pub mod db;
pub mod logging;
pub mod ipc;
pub mod capture;
pub mod ocr;
pub mod ai;
pub mod episode;
pub mod privacy;
pub mod clipboard;
pub mod commands;
pub mod mascot;
pub mod report;
pub mod search;
pub mod wiki;
pub mod insights;
pub mod settings;

use std::sync::Arc;
use tauri::Manager;

/// 应用共享状态
pub struct AppState {
    pub db: Arc<parking_lot::Mutex<db::DbState>>,
    pub capture: Arc<parking_lot::Mutex<capture::CaptureState>>,
    pub settings: Arc<parking_lot::Mutex<settings::AppSettings>>,
}

/// 应用启动入口
pub fn run() {
    // 初始化日志
    logging::init_logging();

    tracing::info!("WorkMemory 启动中...");

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // 初始化数据库
            let db_state = db::init_db(app)?;
            let db = Arc::new(parking_lot::Mutex::new(db_state));

            // 初始化采集状态
            let capture_state = capture::CaptureState::new();
            let capture = Arc::new(parking_lot::Mutex::new(capture_state));

            // 加载设置
            let app_settings = settings::load_settings(app)?;
            let settings = Arc::new(parking_lot::Mutex::new(app_settings));

            let state = AppState {
                db,
                capture,
                settings,
            };
            app.manage(state);

            // 启动后台采集任务
            capture::start_capture_loop(app.handle().clone());

            // 启动剪贴板监听
            clipboard::start_clipboard_listener(app.handle().clone());

            // 启动提醒调度器
            mascot::start_reminder_scheduler(app.handle().clone());

            tracing::info!("WorkMemory 启动完成");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 数据库/Episode 命令
            commands::episode_list,
            commands::episode_get,
            commands::episode_create,
            commands::episode_update,
            commands::episode_delete,
            commands::episode_mark_important,
            commands::segment_list,
            commands::segment_get,
            // 搜索命令
            commands::search_query,
            commands::search_entity_timeline,
            // 报告命令
            commands::report_generate,
            commands::report_list,
            commands::report_get,
            commands::report_delete,
            commands::report_export_markdown,
            commands::report_export_word,
            // Wiki 命令
            commands::wiki_list,
            commands::wiki_get,
            commands::wiki_create,
            commands::wiki_update,
            commands::wiki_delete,
            commands::wiki_approve,
            commands::wiki_import_obsidian,
            // 采集命令
            commands::capture_start,
            commands::capture_stop,
            commands::capture_status,
            commands::capture_get_today_stats,
            // 隐私命令
            commands::privacy_rule_list,
            commands::privacy_rule_add,
            commands::privacy_rule_delete,
            commands::privacy_rule_toggle,
            // OCR 命令
            commands::ocr_status,
            commands::ocr_test,
            // 设置命令
            commands::settings_get,
            commands::settings_set,
            commands::settings_test_ai,
            // 数据管理命令
            commands::data_stats,
            commands::data_clear,
            commands::data_export,
            // 待办命令
            commands::todo_list,
            commands::todo_toggle,
            commands::todo_add,
            commands::todo_delete,
            // 日历命令
            commands::calendar_month_data,
            commands::calendar_day_detail,
            // 洞察命令
            commands::insights_list,
            commands::insights_set_weekly_goals,
            commands::insights_dashboard,
            // 图谱命令
            commands::graph_data,
            // Mascot 命令
            commands::mascot_get_state,
            commands::mascot_set_form,
            commands::mascot_set_position,
            commands::mascot_get_position,
            commands::mascot_hide_temporarily,
            commands::mascot_show_bubble,
            commands::mascot_quick_capture,
            // 日志命令
            commands::log_frontend_error,
            // 快速捕获命令
            commands::quick_capture,
        ])
        .run(tauri::generate_context!())
        .expect("error while running WorkMemory application");
}
