//! 日志模块
//!
//! 使用 tracing + tracing-appender + tracing-subscriber 实现按天滚动的日志系统。
//! 日志文件写入 {AppData}/WorkMemory/logs/app.log，同时输出到控制台（stderr）。
//! 支持前端错误通过 log_frontend 函数转发到 Rust 日志系统。

use std::path::PathBuf;
use tracing_appender::rolling;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

/// 初始化日志系统
///
/// 配置 tracing-subscriber：
/// - 使用 tracing-appender 按天滚动写入日志文件到 {AppData}/WorkMemory/logs/app.log
/// - 使用 env-filter 控制日志级别（默认 info，可通过 RUST_LOG 环境变量覆盖）
/// - 日志格式包含时间戳、级别、目标、消息
/// - 同时输出到文件和控制台（stderr）
///
/// 注意：此函数在 Tauri 应用创建之前调用，因此使用 dirs crate 获取 AppData 目录。
/// 日志文件的后台写入线程通过 forget guard 保持运行，程序退出时可能有少量日志丢失。
pub fn init_logging() {
    // 获取日志目录
    let logs_dir = get_logs_dir();

    // 创建按天滚动的日志文件 app.log
    let file_appender = rolling::daily(&logs_dir, "app.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
    // 忘记 guard 以保持后台写入线程运行（程序退出时可能有少量日志丢失）
    std::mem::forget(guard);

    // 环境过滤器：默认 info 级别，可通过 RUST_LOG 覆盖
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    // 文件日志层：包含时间戳、级别、目标、消息，不使用 ANSI 颜色
    let file_layer = fmt::layer()
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_target(true)
        .with_level(true);

    // 控制台日志层：输出到 stderr，使用 ANSI 颜色
    let console_layer = fmt::layer()
        .with_writer(std::io::stderr)
        .with_target(true)
        .with_level(true);

    // 注册全局订阅者
    tracing_subscriber::registry()
        .with(env_filter)
        .with(file_layer)
        .with(console_layer)
        .init();

    tracing::info!("日志系统已初始化，日志目录: {:?}", logs_dir);
}

/// 获取日志目录路径 {AppData}/WorkMemory/logs
///
/// 使用 dirs crate 获取系统 AppData 目录，确保目录存在。
/// 此函数在 Tauri 应用创建之前调用，因此不依赖 app handle。
fn get_logs_dir() -> PathBuf {
    let base = dirs::data_dir()
        .or_else(|| dirs::config_dir())
        .unwrap_or_else(|| std::env::temp_dir());

    let logs_dir = base.join("WorkMemory").join("logs");

    // 确保目录存在，创建失败则回退到临时目录
    if !logs_dir.exists() {
        if std::fs::create_dir_all(&logs_dir).is_err() {
            let fallback = std::env::temp_dir().join("WorkMemory").join("logs");
            let _ = std::fs::create_dir_all(&fallback);
            return fallback;
        }
    }

    logs_dir
}

/// 前端错误转发到 Rust 日志系统
///
/// 供前端通过 Tauri command 调用，将前端的错误/警告/信息日志转发到 Rust 日志系统，
/// 统一写入日志文件，便于问题排查。
///
/// # 参数
/// - `message`: 日志消息内容
/// - `level`: 日志级别字符串（"error" / "warn" / "info" / "debug" / "trace"）
pub fn log_frontend(message: String, level: String) {
    match level.to_lowercase().as_str() {
        "error" => tracing::error!(target: "frontend", "{}", message),
        "warn" => tracing::warn!(target: "frontend", "{}", message),
        "info" => tracing::info!(target: "frontend", "{}", message),
        "debug" => tracing::debug!(target: "frontend", "{}", message),
        "trace" => tracing::trace!(target: "frontend", "{}", message),
        // 未知级别按 info 处理，并在消息前标注原始级别
        _ => tracing::info!(target: "frontend", "[{}] {}", level, message),
    }
}
