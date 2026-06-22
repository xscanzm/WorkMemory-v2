//! 桌面伙伴（Mascot）模块
//!
//! 管理桌面伙伴的状态、提醒调度、位置持久化等后端逻辑。
//! 前端 UI 动画在 React 层实现，此模块负责数据和时间/行为驱动提醒。

use crate::settings::AppSettings;
use chrono::{Datelike, Local, NaiveTime, Timelike, Weekday};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

/// Mascot 状态
#[derive(Debug, Clone, serde::Serialize)]
pub struct MascotState {
    pub functional_state: String, // recording / paused / privacy / ocr_scanning / report_ready
    pub emotional_state: String,  // happy / focused / concerned / curious / sleepy / proud / neutral
    pub form: String,             // note / film / copilot / cursor / paper
    pub size: u32,
    pub position: (i32, i32),
    pub visible: bool,
}

impl Default for MascotState {
    fn default() -> Self {
        Self {
            functional_state: "recording".to_string(),
            emotional_state: "neutral".to_string(),
            form: "note".to_string(),
            size: 80,
            position: (1820, 980),
            visible: true,
        }
    }
}

/// 启动提醒调度器
pub fn start_reminder_scheduler(app: AppHandle) {
    let app_clone = app.clone();
    tokio::spawn(async move {
        let mut last_daily_report = false;
        let mut last_weekly_report = false;
        let mut last_greeting = false;
        let mut last_focus_reminder: Option<i64> = None;
        let mut last_fragmented_reminder: Option<i64> = None;
        let mut last_long_work_reminder: Option<i64> = None;
        let mut last_night_reminder: Option<i64> = None;
        let mut today_reminder_count: u32 = 0;
        let mut current_day: u32 = 0;

        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        interval.tick().await;

        loop {
            interval.tick().await;
            let now = Local::now();

            // 重置每日提醒计数
            if now.day() != current_day {
                current_day = now.day();
                today_reminder_count = 0;
                last_daily_report = false;
                last_weekly_report = false;
                last_greeting = false;
                last_focus_reminder = None;
                last_fragmented_reminder = None;
                last_long_work_reminder = None;
                last_night_reminder = None;
            }

            let state = app_clone.state::<crate::AppState>();
            let settings = state.settings.lock().clone();
            let capture = state.capture.clone();

            // 检查免打扰时段
            if is_in_dnd(&settings, now.time()) {
                continue;
            }

            if today_reminder_count >= 8 {
                continue;
            }

            // 时间驱动提醒
            if settings.reminder_greeting && !last_greeting && now.hour() == 9 && now.minute() < 30 {
                send_reminder(&app_clone, "greeting", "新的一天开始！昨天完成了 N 件事 ✨").await;
                last_greeting = true;
            }

            if settings.reminder_daily_report && !last_daily_report && now.hour() == 17 && now.minute() >= 30 {
                send_reminder(&app_clone, "daily_report", "今天工作即将结束，生成今日报告？").await;
                last_daily_report = true;
            }

            if settings.reminder_weekly_report && !last_weekly_report
                && now.weekday() == Weekday::Fri && now.hour() == 17 && now.minute() >= 0 {
                send_reminder(&app_clone, "weekly_report", "本周的工作报告可以整理了 📋").await;
                last_weekly_report = true;
            }

            // 行为驱动提醒
            let switch_count = *capture.today_switch_count.lock();
            let focus_start = *capture.focus_start_time.lock();

            // 碎片化：5 分钟内切换 >= 10 次
            if settings.reminder_fragmented && switch_count >= 10 {
                if let Some(last) = last_fragmented_reminder {
                    if now_timestamp() - last < 1800 {
                        continue;
                    }
                }
                send_reminder(&app_clone, "fragmented", "今天切换比较频繁，要专注一件事吗？").await;
                last_fragmented_reminder = Some(now_timestamp());
            }

            // 连续专注 25 分钟
            if settings.reminder_focus_25min {
                if let Some(start) = focus_start {
                    let elapsed = now_timestamp() - start;
                    if elapsed >= 25 * 60 {
                        if let Some(last) = last_focus_reminder {
                            if now_timestamp() - last < 1800 {
                                continue;
                            }
                        }
                        send_reminder(&app_clone, "focus_25min", "专注了 25 分钟，可以休息一下 ☕").await;
                        last_focus_reminder = Some(now_timestamp());
                    }
                }
            }

            // 连续工作 2 小时
            if settings.reminder_long_work {
                if let Some(start) = focus_start {
                    let elapsed = now_timestamp() - start;
                    if elapsed >= 2 * 3600 {
                        if let Some(last) = last_long_work_reminder {
                            if now_timestamp() - last < 1800 {
                                continue;
                            }
                        }
                        send_reminder(&app_clone, "long_work", "已连续工作 2 小时了，起来活动一下吧 🚶").await;
                        last_long_work_reminder = Some(now_timestamp());
                    }
                }
            }

            // 夜间工作
            if settings.reminder_night_work && now.hour() == 22 {
                if let Some(last) = last_night_reminder {
                    if now_timestamp() - last < 1800 {
                        continue;
                    }
                }
                send_reminder(&app_clone, "night_work", "都 22 点了，注意休息哦 🌙").await;
                last_night_reminder = Some(now_timestamp());
            }
        }
    });
}

fn now_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

/// 检查是否在免打扰时段
fn is_in_dnd(settings: &AppSettings, now: NaiveTime) -> bool {
    if !settings.dnd_enabled {
        return false;
    }
    let start = parse_time(&settings.dnd_start);
    let end = parse_time(&settings.dnd_end);
    let now_secs = now.num_seconds_from_midnight() as i64;
    let start_secs = start.num_seconds_from_midnight() as i64;
    let end_secs = end.num_seconds_from_midnight() as i64;

    if start_secs <= end_secs {
        now_secs >= start_secs && now_secs < end_secs
    } else {
        // 跨天（如 22:00 - 08:00）
        now_secs >= start_secs || now_secs < end_secs
    }
}

fn parse_time(s: &str) -> NaiveTime {
    NaiveTime::parse_from_str(s, "%H:%M").unwrap_or_else(|_| NaiveTime::from_hms_opt(22, 0, 0).unwrap())
}

/// 发送提醒
async fn send_reminder(app: &AppHandle, reminder_type: &str, message: &str) {
    let _ = app.emit("mascot-reminder", serde_json::json!({
        "type": reminder_type,
        "message": message,
        "timestamp": now_timestamp(),
    }));
    tracing::info!("提醒已发送: {} - {}", reminder_type, message);
}

/// 计算吸附位置（就近原则）
pub fn snap_to_corner(x: i32, y: i32, screen_w: i32, screen_h: i32, size: i32) -> (i32, i32) {
    let margin = 20;
    let center_x = x + size / 2;
    let center_y = y + size / 2;
    let screen_center_x = screen_w / 2;
    let screen_center_y = screen_h / 2;

    let snap_x = if center_x < screen_center_x {
        margin
    } else {
        screen_w - size - margin
    };
    let snap_y = if center_y < screen_center_y {
        margin
    } else {
        screen_h - size - margin
    };

    (snap_x, snap_y)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snap_to_top_left() {
        // 中心点在左上象限
        let (x, y) = snap_to_corner(100, 100, 1920, 1080, 80);
        assert_eq!(x, 20);
        assert_eq!(y, 20);
    }

    #[test]
    fn test_snap_to_bottom_right() {
        // 中心点在右下象限
        let (x, y) = snap_to_corner(1800, 980, 1920, 1080, 80);
        assert_eq!(x, 1920 - 80 - 20);
        assert_eq!(y, 1080 - 80 - 20);
    }

    #[test]
    fn test_snap_to_top_right() {
        // 中心点在右上象限
        let (x, y) = snap_to_corner(1800, 100, 1920, 1080, 80);
        assert_eq!(x, 1920 - 80 - 20);
        assert_eq!(y, 20);
    }

    #[test]
    fn test_snap_to_bottom_left() {
        // 中心点在左下象限
        let (x, y) = snap_to_corner(100, 980, 1920, 1080, 80);
        assert_eq!(x, 20);
        assert_eq!(y, 1080 - 80 - 20);
    }
}
