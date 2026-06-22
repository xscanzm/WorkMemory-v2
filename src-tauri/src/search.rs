//! 搜索模块
//!
//! 基于 FTS5 全文检索，支持自然语言、过滤语法、实体时间线、自然语言时间搜索。

use crate::db::{Episode, FtsResult};
use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, Weekday};
use regex::Regex;
use serde::{Deserialize, Serialize};

/// 搜索过滤条件
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SearchFilter {
    /// 标签 (#编码)
    pub tags: Vec<String>,
    /// 实体 (@张三)
    pub entities: Vec<String>,
    /// 项目 (project:XX)
    pub project: Option<String>,
    /// 时间范围 (>上周)
    pub time_range: Option<TimeRange>,
    /// 纯文本查询
    pub query: String,
}

/// 时间范围
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRange {
    pub start: i64,
    pub end: i64,
    pub label: String,
}

/// 解析搜索查询字符串
pub fn parse_query(input: &str) -> SearchFilter {
    let mut filter = SearchFilter::default();
    let mut remaining = String::new();

    // 匹配 #标签
    let tag_re = Regex::new(r"#(\S+)").unwrap();
    let input = tag_re.replace_all(input, |caps: &regex::Captures| {
        filter.tags.push(caps[1].to_string());
        ""
    });
    let input = input.trim().to_string();

    // 匹配 @实体
    let entity_re = Regex::new(r"@(\S+)").unwrap();
    let input = entity_re.replace_all(&input, |caps: &regex::Captures| {
        filter.entities.push(caps[1].to_string());
        ""
    });
    let input = input.trim().to_string();

    // 匹配 project:XX
    let project_re = Regex::new(r"project:(\S+)").unwrap();
    let input = project_re.replace_all(&input, |caps: &regex::Captures| {
        filter.project = Some(caps[1].to_string());
        ""
    });
    let input = input.trim().to_string();

    // 匹配 >时间
    let time_re = Regex::new(r">(\S+)").unwrap();
    let input = time_re.replace_all(&input, |caps: &regex::Captures| {
        if let Some(range) = parse_time_keyword(&caps[1]) {
            filter.time_range = Some(range);
        }
        ""
    });

    // 剩余作为纯文本查询
    filter.query = input.trim().to_string();

    // 尝试自然语言时间搜索
    if filter.time_range.is_none() {
        if let Some(range) = parse_natural_language_time(&filter.query) {
            filter.time_range = Some(range);
        }
    }

    filter
}

/// 解析时间关键词
fn parse_time_keyword(keyword: &str) -> Option<TimeRange> {
    let now = Local::now();
    match keyword {
        "今天" | "today" => {
            let start = now.date_naive().and_hms_opt(0, 0, 0)?.and_utc().timestamp();
            let end = now.timestamp();
            Some(TimeRange { start, end, label: "今天".to_string() })
        }
        "昨天" | "yesterday" => {
            let yesterday = now.date_naive() - Duration::days(1);
            let start = yesterday.and_hms_opt(0, 0, 0)?.and_utc().timestamp();
            let end = yesterday.and_hms_opt(23, 59, 59)?.and_utc().timestamp();
            Some(TimeRange { start, end, label: "昨天".to_string() })
        }
        "本周" | "this_week" => {
            let week_start = now.date_naive() - Duration::days(now.weekday().num_days_from_monday() as i64);
            let start = week_start.and_hms_opt(0, 0, 0)?.and_utc().timestamp();
            let end = now.timestamp();
            Some(TimeRange { start, end, label: "本周".to_string() })
        }
        "上周" | "last_week" => {
            let this_week_start = now.date_naive() - Duration::days(now.weekday().num_days_from_monday() as i64);
            let last_week_start = this_week_start - Duration::days(7);
            let last_week_end = this_week_start - Duration::days(1);
            let start = last_week_start.and_hms_opt(0, 0, 0)?.and_utc().timestamp();
            let end = last_week_end.and_hms_opt(23, 59, 59)?.and_utc().timestamp();
            Some(TimeRange { start, end, label: "上周".to_string() })
        }
        "本月" | "this_month" => {
            let month_start = now.date_naive().with_day(1)?.and_hms_opt(0, 0, 0)?.and_utc().timestamp();
            let end = now.timestamp();
            Some(TimeRange { start: month_start, end, label: "本月".to_string() })
        }
        "上个月" | "last_month" => {
            let last_month = now.date_naive().with_day(1)? - Duration::days(1);
            let month_start = last_month.with_day(1)?.and_hms_opt(0, 0, 0)?.and_utc().timestamp();
            let month_end = last_month.and_hms_opt(23, 59, 59)?.and_utc().timestamp();
            Some(TimeRange { start: month_start, end: month_end, label: "上个月".to_string() })
        }
        _ => None,
    }
}

/// 自然语言时间搜索
fn parse_natural_language_time(query: &str) -> Option<TimeRange> {
    let now = Local::now();

    // "上周五下午"
    if query.contains("上周五") {
        let this_week_start = now.date_naive() - Duration::days(now.weekday().num_days_from_monday() as i64);
        let last_friday = this_week_start - Duration::days(7) + Duration::days(4);
        let start = last_friday.and_hms_opt(12, 0, 0)?.and_utc().timestamp();
        let end = last_friday.and_hms_opt(18, 0, 0)?.and_utc().timestamp();
        return Some(TimeRange { start, end, label: "上周五下午".to_string() });
    }

    // "上个月做了什么"
    if query.contains("上个月") {
        return parse_time_keyword("上个月");
    }

    // "最近一次"
    if query.contains("最近") {
        let start = (now - Duration::days(30)).timestamp();
        let end = now.timestamp();
        return Some(TimeRange { start, end, label: "最近30天".to_string() });
    }

    None
}

/// 搜索结果
#[derive(Debug, Clone, Serialize)]
pub struct SearchResult {
    pub episodes: Vec<Episode>,
    pub fts_results: Vec<FtsResult>,
    pub filter: SearchFilter,
    pub total: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_tag() {
        let filter = parse_query("#编码");
        assert_eq!(filter.tags, vec!["编码".to_string()]);
        assert!(filter.query.is_empty());
    }

    #[test]
    fn test_parse_entity() {
        let filter = parse_query("@张三");
        assert_eq!(filter.entities, vec!["张三".to_string()]);
    }

    #[test]
    fn test_parse_project() {
        let filter = parse_query("project:WorkMemory");
        assert_eq!(filter.project.as_deref(), Some("WorkMemory"));
    }

    #[test]
    fn test_parse_time_keyword_today() {
        let filter = parse_query(">今天");
        assert!(filter.time_range.is_some());
        assert_eq!(filter.time_range.unwrap().label, "今天");
    }

    #[test]
    fn test_parse_time_keyword_last_week() {
        let filter = parse_query(">上周");
        assert!(filter.time_range.is_some());
        assert_eq!(filter.time_range.unwrap().label, "上周");
    }

    #[test]
    fn test_parse_combined_query() {
        let filter = parse_query("#编码 @张三 project:WM >今天 修复 bug");
        assert_eq!(filter.tags, vec!["编码".to_string()]);
        assert_eq!(filter.entities, vec!["张三".to_string()]);
        assert_eq!(filter.project.as_deref(), Some("WM"));
        assert!(filter.time_range.is_some());
        assert!(!filter.query.is_empty());
    }

    #[test]
    fn test_parse_plain_text() {
        let filter = parse_query("修复登录 bug");
        assert!(filter.tags.is_empty());
        assert!(filter.entities.is_empty());
        assert!(filter.project.is_none());
        assert_eq!(filter.query, "修复登录 bug");
    }

    #[test]
    fn test_natural_language_time_last_friday() {
        let filter = parse_query("上周五下午做了什么");
        assert!(filter.time_range.is_some());
        assert_eq!(filter.time_range.unwrap().label, "上周五下午");
    }

    #[test]
    fn test_natural_language_time_recent() {
        let filter = parse_query("最近和张三开会");
        assert!(filter.time_range.is_some());
        assert_eq!(filter.time_range.unwrap().label, "最近30天");
    }
}
