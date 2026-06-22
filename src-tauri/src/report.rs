//! 报告生成模块
//!
//! 5 种报告模板（enhanced/concise/standup/okr/structured），
//! 流式输出，富文本编辑，复制/导出 Markdown/Word。

use crate::ai::{chat_stream, AiConfig, ChatMessage};
use crate::db::{generate_id, now_timestamp, Episode, Report};
use serde::{Deserialize, Serialize};

/// 报告模板 ID
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ReportTemplate {
    Enhanced,
    Concise,
    Standup,
    Okr,
    Structured,
}

impl ReportTemplate {
    pub fn from_id(id: &str) -> Option<Self> {
        match id {
            "enhanced" => Some(Self::Enhanced),
            "concise" => Some(Self::Concise),
            "standup" => Some(Self::Standup),
            "okr" => Some(Self::Okr),
            "structured" => Some(Self::Structured),
            _ => None,
        }
    }

    pub fn id(&self) -> &'static str {
        match self {
            Self::Enhanced => "enhanced",
            Self::Concise => "concise",
            Self::Standup => "standup",
            Self::Okr => "okr",
            Self::Structured => "structured",
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Self::Enhanced => "详细日报",
            Self::Concise => "精简日报",
            Self::Standup => "站会报告",
            Self::Okr => "OKR 进展",
            Self::Structured => "周报",
        }
    }

    pub fn description(&self) -> &'static str {
        match self {
            Self::Enhanced => "需要详细记录的场景",
            Self::Concise => "快速发送，三句话总结今天",
            Self::Standup => "每日晨会（昨日/今日/阻塞）",
            Self::Okr => "周期性目标回顾",
            Self::Structured => "周报提交，含下周计划",
        }
    }
}

/// 构建报告生成 prompt
pub fn build_prompt(template: &ReportTemplate, episodes: &[Episode], supplement: &str) -> String {
    let episodes_summary: Vec<String> = episodes
        .iter()
        .map(|e| {
            format!(
                "- {} ({}): {}",
                e.title.as_deref().unwrap_or("未命名"),
                e.episode_type.as_deref().unwrap_or("work"),
                e.summary.as_deref().unwrap_or("")
            )
        })
        .collect();

    let episodes_text = episodes_summary.join("\n");

    let template_instruction = match template {
        ReportTemplate::Enhanced => {
            "请生成一份详细日报，包含：今日工作概览、详细工作内容（按时间顺序）、遇到的问题、明日计划。使用 Markdown 格式。"
        }
        ReportTemplate::Concise => {
            "请用三句话总结今天的工作：1. 主要完成的事 2. 进行中的事 3. 需要关注的事。简洁明了。"
        }
        ReportTemplate::Standup => {
            "请生成站会报告，格式：\n【昨日完成】\n· ...\n\n【今日计划】\n· ...\n\n【阻塞问题】\n· ..."
        }
        ReportTemplate::Okr => {
            "请生成 OKR 进展报告，包含：目标回顾、关键结果进展、本周完成项、风险与调整。"
        }
        ReportTemplate::Structured => {
            "请生成周报，包含：本周工作总结、主要成果、遇到的问题、下周计划。使用 Markdown 格式，结构清晰。"
        }
    };

    let supplement_section = if supplement.is_empty() {
        String::new()
    } else {
        format!("\n\n用户补充说明：{}", supplement)
    };

    format!(
        r#"你是工作记忆助手 WorkMemory，请根据以下今日工作事件生成报告。

今日工作事件：
{}

{}{}"#,
        episodes_text, template_instruction, supplement_section
    )
}

/// 流式生成报告
pub async fn generate_report_stream<F>(
    config: &AiConfig,
    template: &ReportTemplate,
    episodes: &[Episode],
    supplement: &str,
    mut on_token: F,
) -> Result<String, String>
where
    F: FnMut(&str),
{
    let prompt = build_prompt(template, episodes, supplement);
    let messages = vec![ChatMessage {
        role: "user".to_string(),
        content: prompt,
    }];

    chat_stream(config, messages, Some(0.7), &mut on_token).await
}

/// 导出为 Markdown
pub fn export_markdown(content: &str, date: &str, template_name: &str) -> String {
    format!(
        "# {} - {}\n\n生成时间：{}\n\n---\n\n{}",
        template_name,
        date,
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
        content
    )
}

/// 导出为 Word（简化实现：导出为 .doc 兼容的 HTML）
pub fn export_word(content: &str, date: &str, template_name: &str) -> Vec<u8> {
    let html = format!(
        r#"<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>{} - {}</title></head>
<body><h1>{} - {}</h1><p>生成时间：{}</p><hr>{}</body></html>"#,
        template_name, date, template_name, date,
        chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
        markdown_to_html(content)
    );
    html.into_bytes()
}

/// 简单的 Markdown 转 HTML
fn markdown_to_html(md: &str) -> String {
    let mut html = String::new();
    let mut in_list = false;

    for line in md.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            if in_list {
                html.push_str("</ul>");
                in_list = false;
            }
            html.push_str(&format!("<h1>{}</h1>", &trimmed[2..]));
        } else if trimmed.starts_with("## ") {
            if in_list {
                html.push_str("</ul>");
                in_list = false;
            }
            html.push_str(&format!("<h2>{}</h2>", &trimmed[3..]));
        } else if trimmed.starts_with("### ") {
            if in_list {
                html.push_str("</ul>");
                in_list = false;
            }
            html.push_str(&format!("<h3>{}</h3>", &trimmed[4..]));
        } else if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
            if !in_list {
                html.push_str("<ul>");
                in_list = true;
            }
            html.push_str(&format!("<li>{}</li>", &trimmed[2..]));
        } else if trimmed.is_empty() {
            if in_list {
                html.push_str("</ul>");
                in_list = false;
            }
            html.push_str("<br>");
        } else {
            if in_list {
                html.push_str("</ul>");
                in_list = false;
            }
            html.push_str(&format!("<p>{}</p>", trimmed));
        }
    }
    if in_list {
        html.push_str("</ul>");
    }
    html
}
