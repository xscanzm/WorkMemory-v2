//! AI 调用模块
//!
//! 通过 reqwest 调用 OpenAI 兼容 API（支持流式输出）。
//! API Key 从设置中读取。支持连接测试。

use crate::settings::AppSettings;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// AI 请求配置
#[derive(Debug, Clone)]
pub struct AiConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

impl From<&AppSettings> for AiConfig {
    fn from(s: &AppSettings) -> Self {
        Self {
            api_key: s.ai_api_key.clone(),
            base_url: s.ai_base_url.clone(),
            model: s.ai_model.clone(),
        }
    }
}

/// 聊天消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// 聊天请求
#[derive(Debug, Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    stream: bool,
}

/// 流式响应的 chunk
#[derive(Debug, Deserialize)]
struct StreamChunk {
    choices: Vec<StreamChoice>,
}

#[derive(Debug, Deserialize)]
struct StreamChoice {
    delta: Delta,
}

#[derive(Debug, Deserialize)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
}

/// 非流式响应
#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    message: ChatMessage,
}

/// 测试 AI 连接
pub async fn test_connection(config: &AiConfig) -> Result<String, String> {
    if config.api_key.is_empty() {
        return Err("API Key 未配置".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
    let body = ChatRequest {
        model: config.model.clone(),
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "Hi".to_string(),
        }],
        temperature: Some(0.0),
        max_tokens: Some(5),
        stream: false,
    };

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, text));
    }

    let _chat_resp: ChatResponse = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    Ok(format!("连接成功，模型: {}", config.model))
}

/// 非流式聊天
pub async fn chat(
    config: &AiConfig,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
) -> Result<String, String> {
    if config.api_key.is_empty() {
        return Err("API Key 未配置".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
    let body = ChatRequest {
        model: config.model.clone(),
        messages,
        temperature,
        max_tokens: None,
        stream: false,
    };

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, text));
    }

    let chat_resp: ChatResponse = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    chat_resp
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .ok_or_else(|| "AI 返回空响应".to_string())
}

/// 流式聊天，通过回调推送每个 token
pub async fn chat_stream<F>(
    config: &AiConfig,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    mut on_token: F,
) -> Result<String, String>
where
    F: FnMut(&str),
{
    if config.api_key.is_empty() {
        return Err("API Key 未配置".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));
    let body = ChatRequest {
        model: config.model.clone(),
        messages,
        temperature,
        max_tokens: None,
        stream: true,
    };

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, text));
    }

    let mut full_text = String::new();
    let mut stream = resp.bytes_stream();

    while let Some(item) = stream.next().await {
        let bytes = item.map_err(|e| format!("读取流失败: {}", e))?;
        let text = String::from_utf8_lossy(&bytes);

        // 解析 SSE 格式
        for line in text.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    continue;
                }
                if let Ok(chunk) = serde_json::from_str::<StreamChunk>(data) {
                    if let Some(choice) = chunk.choices.first() {
                        if let Some(content) = &choice.delta.content {
                            on_token(content);
                            full_text.push_str(content);
                        }
                    }
                }
            }
        }
    }

    Ok(full_text)
}
