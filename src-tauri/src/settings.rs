//! 设置管理模块
//!
//! 提供应用设置的加载、保存和目录管理功能。
//! 设置以 JSON 格式存储在数据库 settings 表中（key = "app_settings"）。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

/// 数据库文件名
const DB_FILENAME: &str = "workmemory.db";

/// 设置在数据库 settings 表中的键名
const SETTINGS_KEY: &str = "app_settings";

/// 应用设置结构体
///
/// 包含 AI 配置、桌面伙伴、记录设置、隐私、OCR、提醒等所有可配置项。
/// 使用 serde 序列化为 JSON 存储在数据库 settings 表中。
/// 各字段的 serde 默认值通过 `#[serde(default = "...")]` 属性指定，
/// 反序列化时缺失的字段将使用对应默认值。
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct AppSettings {
    /// AI API 密钥
    #[serde(default)]
    pub ai_api_key: String,

    /// AI API 基础 URL
    #[serde(default = "default_ai_base_url")]
    pub ai_base_url: String,

    /// AI 模型名称
    #[serde(default = "default_ai_model")]
    pub ai_model: String,

    /// 是否启用桌面伙伴
    #[serde(default = "default_true")]
    pub mascot_enabled: bool,

    /// 桌面伙伴形象（note/film/copilot/cursor/paper）
    #[serde(default = "default_mascot_form")]
    pub mascot_form: String,

    /// 桌面伙伴大小（像素）
    #[serde(default = "default_mascot_size")]
    pub mascot_size: u32,

    /// 截图采集间隔（秒）
    #[serde(default = "default_capture_interval")]
    pub capture_interval_secs: u64,

    /// 是否保存截图文件
    #[serde(default = "default_true")]
    pub save_screenshots: bool,

    /// 截图保留天数
    #[serde(default = "default_retention_days")]
    pub screenshot_retention_days: u32,

    /// 截图存储路径（空则使用 AppData 默认路径）
    #[serde(default)]
    pub screenshot_path: String,

    /// OCR 引擎（windows/paddle）
    #[serde(default = "default_ocr_engine")]
    pub ocr_engine: String,

    /// 是否启用免打扰
    #[serde(default)]
    pub dnd_enabled: bool,

    /// 免打扰开始时间（HH:MM 格式）
    #[serde(default = "default_dnd_start")]
    pub dnd_start: String,

    /// 免打扰结束时间（HH:MM 格式）
    #[serde(default = "default_dnd_end")]
    pub dnd_end: String,

    /// 是否启用每日日报提醒
    #[serde(default = "default_true")]
    pub reminder_daily_report: bool,

    /// 是否启用每周周报提醒
    #[serde(default = "default_true")]
    pub reminder_weekly_report: bool,

    /// 是否启用问候提醒
    #[serde(default = "default_true")]
    pub reminder_greeting: bool,

    /// 是否启用专注 25 分钟提醒
    #[serde(default = "default_true")]
    pub reminder_focus_25min: bool,

    /// 是否启用碎片化工作提醒
    #[serde(default = "default_true")]
    pub reminder_fragmented: bool,

    /// 是否启用长时间工作提醒
    #[serde(default = "default_true")]
    pub reminder_long_work: bool,

    /// 是否启用夜间工作提醒
    #[serde(default = "default_true")]
    pub reminder_night_work: bool,
}

// ==================== serde 默认值函数 ====================

fn default_true() -> bool {
    true
}

fn default_ai_base_url() -> String {
    "https://api.openai.com/v1".to_string()
}

fn default_ai_model() -> String {
    "gpt-4o-mini".to_string()
}

fn default_mascot_form() -> String {
    "note".to_string()
}

fn default_mascot_size() -> u32 {
    80
}

fn default_capture_interval() -> u64 {
    30
}

fn default_retention_days() -> u32 {
    7
}

fn default_ocr_engine() -> String {
    "windows".to_string()
}

fn default_dnd_start() -> String {
    "22:00".to_string()
}

fn default_dnd_end() -> String {
    "08:00".to_string()
}

// ==================== 设置加载/保存 ====================

/// 从数据库 settings 表加载应用设置
///
/// 从数据库 settings 表中读取 key = "app_settings" 的 JSON 字符串并反序列化为 AppSettings。
/// 如果数据库中不存在该键，则返回默认值（通过反序列化空 JSON 触发所有 serde 默认值）。
///
/// # 参数
/// - `app`: Tauri 应用句柄，用于获取 AppData 目录路径
///
/// # 返回
/// - `Ok(AppSettings)`: 成功加载的设置
/// - `Err(Box<dyn std::error::Error>)`: 数据库或反序列化错误
pub fn load_settings(app: &tauri::AppHandle) -> Result<AppSettings, Box<dyn std::error::Error>> {
    let db_path = get_app_data_dir(app).join(DB_FILENAME);
    let conn = rusqlite::Connection::open(&db_path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;

    match conn.query_row(
        "SELECT value FROM settings WHERE key = ?",
        rusqlite::params![SETTINGS_KEY],
        |row| row.get::<_, String>(0),
    ) {
        Ok(json) => {
            let settings: AppSettings = serde_json::from_str(&json)?;
            Ok(settings)
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // 不存在则返回默认值（通过反序列化空 JSON 触发 serde 默认值）
            let settings: AppSettings = serde_json::from_str("{}")?;
            Ok(settings)
        }
        Err(e) => Err(Box::new(e)),
    }
}

/// 保存应用设置到数据库 settings 表
///
/// 将 AppSettings 序列化为 JSON 字符串，以 key = "app_settings" 存入数据库 settings 表。
/// 如果该键已存在，则更新其值（ON CONFLICT 语义）。
///
/// # 参数
/// - `app`: Tauri 应用句柄，用于获取 AppData 目录路径
/// - `settings`: 要保存的应用设置
///
/// # 返回
/// - `Ok(())`: 保存成功
/// - `Err(Box<dyn std::error::Error>)`: 数据库或序列化错误
pub fn save_settings(
    app: &tauri::AppHandle,
    settings: &AppSettings,
) -> Result<(), Box<dyn std::error::Error>> {
    let db_path = get_app_data_dir(app).join(DB_FILENAME);
    let conn = rusqlite::Connection::open(&db_path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;

    let json = serde_json::to_string(settings)?;

    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![SETTINGS_KEY, json],
    )?;

    Ok(())
}

// ==================== 目录管理 ====================

/// 获取应用数据目录 {AppData}/WorkMemory
///
/// 使用 Tauri 的 PathResolver 获取系统 AppData 目录，拼接 "WorkMemory" 子目录。
/// 如果目录不存在则创建。
///
/// # 参数
/// - `app`: Tauri 应用句柄
///
/// # 返回
/// 返回 {AppData}/WorkMemory 目录路径。如果获取 AppData 目录失败，
/// 则回退到 dirs crate 或临时目录。
pub fn get_app_data_dir(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| {
            dirs::data_dir()
                .or_else(|| dirs::config_dir())
                .unwrap_or_else(|| std::env::temp_dir())
        });

    let path = base.join("WorkMemory");

    // 确保目录存在
    if !path.exists() {
        std::fs::create_dir_all(&path).expect("无法创建应用数据目录");
    }

    path
}

/// 获取日志目录 {AppData}/WorkMemory/logs
///
/// 如果目录不存在则创建。
pub fn get_logs_dir(app: &tauri::AppHandle) -> PathBuf {
    let path = get_app_data_dir(app).join("logs");

    // 确保目录存在
    if !path.exists() {
        std::fs::create_dir_all(&path).expect("无法创建日志目录");
    }

    path
}

/// 获取截图目录 {AppData}/WorkMemory/screenshots
///
/// 如果目录不存在则创建。
pub fn get_screenshots_dir(app: &tauri::AppHandle) -> PathBuf {
    let path = get_app_data_dir(app).join("screenshots");

    // 确保目录存在
    if !path.exists() {
        std::fs::create_dir_all(&path).expect("无法创建截图目录");
    }

    path
}
