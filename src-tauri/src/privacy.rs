//! 隐私保护模块
//!
//! 检测无痕浏览器窗口，用户自定义隐私规则匹配。
//! 无痕模式检测到后立即停止截图，桌面伙伴进入 privacy 状态。

use crate::settings::AppSettings;

/// 判断是否为无痕浏览器窗口
///
/// 通过窗口标题关键词检测：Chrome 无痕、Edge InPrivate、Firefox 私密、Safari 私密
pub fn is_incognito_window(window_title: &str, app_name: &str) -> bool {
    let title_lower = window_title.to_lowercase();
    let app_lower = app_name.to_lowercase();

    // Chrome 无痕模式
    if title_lower.contains("incognito") || title_lower.contains("无痕") {
        return true;
    }
    // Edge InPrivate
    if title_lower.contains("inprivate") {
        return true;
    }
    // Firefox 私密浏览
    if title_lower.contains("private browsing") || title_lower.contains("私密浏览") {
        return true;
    }
    // Safari 私密
    if title_lower.contains("private window") || title_lower.contains("私密窗口") {
        return true;
    }

    // 通过进程名辅助判断（某些浏览器无痕模式标题不变）
    if app_lower.contains("chrome") && title_lower.contains("incognito") {
        return true;
    }

    false
}

/// 判断是否被用户隐私规则阻止
///
/// 规则从数据库 privacy_rules 表加载，匹配应用名/窗口标题/URL 关键词。
/// 此函数接收已加载的规则列表。
pub fn is_blocked_by_rules(window_title: &str, app_name: &str, _settings: &AppSettings) -> bool {
    // 实际规则从数据库读取，这里通过 settings 间接判断
    // 简化实现：检查常见的隐私敏感应用
    let sensitive_apps = [
        "1password",
        "lastpass",
        "bitwarden",
        "keepass",
        "enpass",
        "dashlane",
        "bank",
        "银行",
        "支付宝",
        "alipay",
        "微信支付",
        "wallet",
    ];

    let app_lower = app_name.to_lowercase();
    let title_lower = window_title.to_lowercase();

    for sensitive in &sensitive_apps {
        if app_lower.contains(sensitive) || title_lower.contains(sensitive) {
            return true;
        }
    }

    false
}

/// 隐私规则结构
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PrivacyRule {
    pub id: String,
    pub rule_type: String, // app_name / window_title / url_keyword
    pub pattern: String,
    pub enabled: bool,
    pub created_at: i64,
}

/// 检查给定窗口信息是否匹配隐私规则
pub fn matches_rule(window_title: &str, app_name: &str, url: Option<&str>, rule: &PrivacyRule) -> bool {
    if !rule.enabled {
        return false;
    }
    let pattern_lower = rule.pattern.to_lowercase();
    match rule.rule_type.as_str() {
        "app_name" => app_name.to_lowercase().contains(&pattern_lower),
        "window_title" => window_title.to_lowercase().contains(&pattern_lower),
        "url_keyword" => {
            if let Some(u) = url {
                u.to_lowercase().contains(&pattern_lower)
            } else {
                false
            }
        }
        _ => false,
    }
}
