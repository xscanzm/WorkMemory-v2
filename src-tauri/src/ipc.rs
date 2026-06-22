//! IPC 统一信封模块
//!
//! 定义前后端通信的统一返回类型和响应信封结构。
//! 所有 Tauri command 返回 `ApiResult<T>`，前端通过 `ApiResponse` 信封解析结果。

use serde::Serialize;

/// 泛型返回类型：所有 Tauri command 的返回值统一为 `Result<T, String>`
///
/// 错误类型固定为 String，便于前端统一处理。
/// Tauri 会自动将 Err(String) 序列化为前端可接收的错误。
pub type ApiResult<T> = Result<T, String>;

/// 前端响应信封结构
///
/// 统一封装命令的返回结果：
/// - 成功：`{ ok: true, data: T, error: null }`
/// - 失败：`{ ok: false, data: null, error: string }`
#[derive(Serialize, Clone)]
pub struct ApiResponse<T> {
    /// 是否成功
    pub ok: bool,
    /// 成功时的数据
    pub data: Option<T>,
    /// 失败时的错误信息
    pub error: Option<String>,
}

/// 构造成功响应
///
/// 将任意数据包装为成功的 ApiResponse。
pub fn ok<T>(data: T) -> ApiResponse<T> {
    ApiResponse {
        ok: true,
        data: Some(data),
        error: None,
    }
}

/// 构造错误响应
///
/// 将错误信息包装为失败的 ApiResponse。
/// 返回类型为 `ApiResponse<serde_json::Value>` 以适配任意数据类型的场景。
pub fn err(error: impl Into<String>) -> ApiResponse<serde_json::Value> {
    ApiResponse {
        ok: false,
        data: None,
        error: Some(error.into()),
    }
}

/// 将实现了 Display 的错误转换为 String
///
/// 便于在 `ApiResult` 中使用 `?` 操作符处理各种错误类型：
/// ```ignore
/// let value = some_operation().map_err(to_string_err)?;
/// ```
pub fn to_string_err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
