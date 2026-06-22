//! 主动洞察（Insights）模块
//!
//! 洞察卡片流、周目标设定、数据仪表盘。

use crate::db::{Episode, WikiPage};
use chrono::{Datelike, Duration, Local, Timelike};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 洞察卡片
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightCard {
    pub id: String,
    pub insight_type: String, // focus_pattern / time_allocation / fragmented / milestone / anomaly
    pub title: String,
    pub description: String,
    pub detail: Option<String>,
}

/// 生成洞察卡片
pub fn generate_insights(episodes: &[Episode]) -> Vec<InsightCard> {
    let mut insights = Vec::new();

    // 专注规律洞察
    if let Some(card) = analyze_focus_pattern(episodes) {
        insights.push(card);
    }

    // 时间分配洞察
    if let Some(card) = analyze_time_allocation(episodes) {
        insights.push(card);
    }

    // 碎片化预警
    if let Some(card) = detect_fragmentation(episodes) {
        insights.push(card);
    }

    // 进步里程碑
    if let Some(card) = detect_milestone(episodes) {
        insights.push(card);
    }

    insights
}

/// 分析专注规律
fn analyze_focus_pattern(episodes: &[Episode]) -> Option<InsightCard> {
    if episodes.is_empty() {
        return None;
    }

    // 按小时统计专注时长
    let mut hour_durations: HashMap<u32, i64> = HashMap::new();
    for e in episodes {
        let hour = chrono::DateTime::from_timestamp(e.start_time, 0)?
            .with_timezone(&Local)
            .hour();
        let duration = e.end_time - e.start_time;
        *hour_durations.entry(hour).or_insert(0) += duration;
    }

    let best_hour = hour_durations.iter().max_by_key(|(_, &v)| v)?.0;
    let best_duration = *hour_durations.get(best_hour)? as f64 / 3600.0;

    if best_duration > 1.0 {
        Some(InsightCard {
            id: "focus_pattern".to_string(),
            insight_type: "focus_pattern".to_string(),
            title: "⏰ 你的深度工作黄金时段".to_string(),
            description: format!(
                "过去数据显示，你在上午 {} 点的专注质量最高，建议把最重要的任务放在这个时段",
                best_hour
            ),
            detail: Some(format!("该时段累计专注 {:.1} 小时", best_duration)),
        })
    } else {
        None
    }
}

/// 分析时间分配
fn analyze_time_allocation(episodes: &[Episode]) -> Option<InsightCard> {
    if episodes.is_empty() {
        return None;
    }

    let mut project_durations: HashMap<String, i64> = HashMap::new();
    let mut total_duration: i64 = 0;

    for e in episodes {
        let project = e.project.clone().unwrap_or_else(|| "其他".to_string());
        let duration = e.end_time - e.start_time;
        *project_durations.entry(project).or_insert(0) += duration;
        total_duration += duration;
    }

    if total_duration == 0 {
        return None;
    }

    let top_project = project_durations.iter().max_by_key(|(_, &v)| v)?;
    let percentage = (*top_project.1 as f64 / total_duration as f64) * 100.0;

    if percentage > 50.0 {
        Some(InsightCard {
            id: "time_allocation".to_string(),
            insight_type: "time_allocation".to_string(),
            title: "📊 时间分配洞察".to_string(),
            description: format!(
                "项目「{}」占用了你 {:.0}% 的工作时间，注意保持项目平衡",
                top_project.0, percentage
            ),
            detail: None,
        })
    } else {
        None
    }
}

/// 检测碎片化
fn detect_fragmentation(episodes: &[Episode]) -> Option<InsightCard> {
    if episodes.len() < 10 {
        return None;
    }

    // 计算平均 episode 时长
    let total_duration: i64 = episodes.iter().map(|e| e.end_time - e.start_time).sum();
    let avg_duration = total_duration / episodes.len() as i64;

    if avg_duration < 600 {
        // 平均 < 10 分钟
        Some(InsightCard {
            id: "fragmented".to_string(),
            insight_type: "fragmented".to_string(),
            title: "⚠️ 碎片化预警".to_string(),
            description: format!(
                "你的平均工作段时长仅 {} 分钟，建议尝试更长时间的专注",
                avg_duration / 60
            ),
            detail: None,
        })
    } else {
        None
    }
}

/// 检测里程碑
fn detect_milestone(episodes: &[Episode]) -> Option<InsightCard> {
    let total_focus: i64 = episodes.iter().map(|e| e.end_time - e.start_time).sum();
    let hours = total_focus / 3600;

    if hours >= 20 {
        Some(InsightCard {
            id: "milestone".to_string(),
            insight_type: "milestone".to_string(),
            title: "🏆 进步里程碑".to_string(),
            description: format!("本周累计专注 {} 小时，保持这个节奏！", hours),
            detail: None,
        })
    } else {
        None
    }
}

/// 周目标
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WeeklyGoal {
    pub id: String,
    pub week_start: String,
    pub goals: Vec<String>,
    pub created_at: i64,
}

/// 仪表盘数据
#[derive(Debug, Clone, Serialize)]
pub struct Dashboard {
    pub week_hours: Vec<f64>,          // 本周每天工作时长
    pub month_projects: Vec<ProjectShare>, // 本月项目占比
    pub wiki_growth: Vec<u32>,         // 知识库成长曲线
    pub token_estimate: u64,           // AI Token 消耗估算
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectShare {
    pub project: String,
    pub percentage: f64,
    pub hours: f64,
}

/// 计算仪表盘数据
pub fn calculate_dashboard(episodes: &[Episode], wiki_pages: &[WikiPage]) -> Dashboard {
    let now = Local::now();
    let week_start = now.date_naive() - Duration::days(now.weekday().num_days_from_monday() as i64);

    // 本周每天工作时长
    let mut week_hours = vec![0.0; 7];
    for e in episodes {
        let dt = chrono::DateTime::from_timestamp(e.start_time, 0)
            .map(|dt| dt.with_timezone(&Local));
        if let Some(dt) = dt {
            let days_diff = (dt.date_naive() - week_start).num_days();
            if days_diff >= 0 && days_diff < 7 {
                week_hours[days_diff as usize] += (e.end_time - e.start_time) as f64 / 3600.0;
            }
        }
    }

    // 本月项目占比
    let mut project_durations: HashMap<String, f64> = HashMap::new();
    let mut total_hours = 0.0;
    for e in episodes {
        let project = e.project.clone().unwrap_or_else(|| "其他".to_string());
        let hours = (e.end_time - e.start_time) as f64 / 3600.0;
        *project_durations.entry(project).or_insert(0.0) += hours;
        total_hours += hours;
    }

    let mut month_projects: Vec<ProjectShare> = project_durations
        .into_iter()
        .map(|(project, hours)| ProjectShare {
            percentage: if total_hours > 0.0 { hours / total_hours * 100.0 } else { 0.0 },
            hours,
            project,
        })
        .collect();
    month_projects.sort_by(|a, b| b.hours.partial_cmp(&a.hours).unwrap());

    // 知识库成长曲线（按天累计）
    let mut wiki_growth: Vec<u32> = vec![0; 30];
    for page in wiki_pages {
        let dt = chrono::DateTime::from_timestamp(page.created_at, 0)
            .map(|dt| dt.with_timezone(&Local));
        if let Some(dt) = dt {
            let days_diff = (now.date_naive() - dt.date_naive()).num_days();
            if days_diff >= 0 && days_diff < 30 {
                for i in (days_diff as usize)..30 {
                    wiki_growth[i] += 1;
                }
            }
        }
    }

    // Token 估算（粗略：每个 episode 约 500 tokens）
    let token_estimate = episodes.len() as u64 * 500;

    Dashboard {
        week_hours,
        month_projects,
        wiki_growth,
        token_estimate,
    }
}
