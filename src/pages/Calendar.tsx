// 日历页：月视图网格 + 工作摘要 + 热力图 + 当天详情

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import * as ipc from "@/lib/ipc";
import { formatDuration, heatColor, cx, todayStr } from "@/lib/utils";
import type { CalendarDayData, Episode } from "@/types";
import styles from "./Calendar.module.css";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function CalendarPage() {
  const toast = useToast();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-12
  const [days, setDays] = useState<CalendarDayData[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(todayStr());
  const [dayEpisodes, setDayEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);

  // 加载月数据
  const loadMonth = async (y: number, m: number) => {
    setLoading(true);
    try {
      const data = await ipc.calendarMonthData(y, m);
      setDays(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMonth(year, month);
  }, [year, month]);

  // 加载选中日期详情
  useEffect(() => {
    if (!selectedDate) {
      setDayEpisodes([]);
      return;
    }
    ipc.calendarDayDetail(selectedDate)
      .then((eps) => setDayEpisodes(eps))
      .catch(() => setDayEpisodes([]));
  }, [selectedDate]);

  // 计算最大工作时长（用于热力图归一化）
  const maxWorkSeconds = useMemo(
    () => Math.max(1, ...days.map((d) => d.work_seconds)),
    [days]
  );

  // 生成日历网格
  const calendarGrid = useMemo(() => {
    // 该月第一天是星期几（0=周日，调整为周一开始）
    const firstDay = new Date(year, month - 1, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const prevMonthDays = new Date(year, month - 1, 0).getDate();

    const cells: Array<{ day: number; current: boolean; date?: string; data?: CalendarDayData }> = [];

    // 上月填充
    for (let i = offset - 1; i >= 0; i--) {
      cells.push({ day: prevMonthDays - i, current: false });
    }

    // 当月
    days.forEach((d) => {
      cells.push({ day: d.day, current: true, date: d.date, data: d });
    });

    // 下月填充
    const totalCells = Math.ceil(cells.length / 7) * 7;
    let nextDay = 1;
    while (cells.length < totalCells) {
      cells.push({ day: nextDay++, current: false });
    }

    return cells;
  }, [days, year, month]);

  // 导航
  const prevMonth = () => {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  };

  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setSelectedDate(todayStr());
  };

  const goThisWeek = () => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    setSelectedDate(monday.toISOString().slice(0, 10));
  };

  const goLastWeek = () => {
    const now = new Date();
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - 7 - ((now.getDay() + 6) % 7));
    setSelectedDate(lastMonday.toISOString().slice(0, 10));
  };

  const goThisMonth = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">日历</h1>
          <p className="page-subtitle">回顾每日工作量，颜色深浅代表工作强度</p>
        </div>
        <div className={styles.navActions}>
          <Button size="sm" variant="ghost" onClick={goToday}>今日</Button>
          <Button size="sm" variant="ghost" onClick={goThisWeek}>本周</Button>
          <Button size="sm" variant="ghost" onClick={goLastWeek}>上周</Button>
          <Button size="sm" variant="ghost" onClick={goThisMonth}>本月</Button>
        </div>
      </header>

      <div className={styles.body}>
        {/* 月视图 */}
        <Card padding="md" className={styles.calendarCard}>
          <div className={styles.monthHeader}>
            <Button size="sm" variant="ghost" onClick={prevMonth}>‹</Button>
            <h2 className={styles.monthTitle}>{year} 年 {month} 月</h2>
            <Button size="sm" variant="ghost" onClick={nextMonth}>›</Button>
          </div>

          <div className={styles.weekdayRow}>
            {WEEKDAYS.map((d) => (
              <div key={d} className={styles.weekdayCell}>{d}</div>
            ))}
          </div>

          <div className={styles.dayGrid}>
            {calendarGrid.map((cell, i) => {
              if (!cell.current) {
                return <div key={i} className={cx(styles.dayCell, styles.dayCellOther)}>{cell.day}</div>;
              }
              const intensity = cell.data ? cell.data.work_seconds / maxWorkSeconds : 0;
              const isToday = cell.date === todayStr();
              const isSelected = cell.date === selectedDate;
              return (
                <motion.button
                  key={i}
                  className={cx(
                    styles.dayCell,
                    styles.dayCellCurrent,
                    isToday && styles.dayCellToday,
                    isSelected && styles.dayCellSelected
                  )}
                  style={{ background: cell.data && cell.data.work_seconds > 0 ? heatColor(intensity) : undefined }}
                  onClick={() => setSelectedDate(cell.date!)}
                  whileHover={{ scale: 1.03 }}
                  transition={{ duration: 0.15 }}
                >
                  <span className={styles.dayNumber}>{cell.day}</span>
                  {cell.data && cell.data.work_seconds > 0 && (
                    <span className={styles.daySummary}>
                      {cell.data.summary || `${cell.data.episode_count} 个事件`}
                    </span>
                  )}
                  {cell.data && cell.data.episode_count > 0 && (
                    <span className={styles.dayBadge}>{cell.data.episode_count}</span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </Card>

        {/* 右侧当天详情 */}
        <Card padding="md" className={styles.detailCard}>
          <h3 className={styles.detailTitle}>
            {selectedDate ?? "选择日期"}
          </h3>
          {dayEpisodes.length === 0 ? (
            <EmptyState
              illustration="📅"
              title="当天没有记录"
              description="这一天没有工作事件被记录。"
              size="sm"
            />
          ) : (
            <>
              <div className={styles.detailStats}>
                <div className={styles.detailStat}>
                  <span className={styles.detailStatValue}>{dayEpisodes.length}</span>
                  <span className={styles.detailStatLabel}>事件</span>
                </div>
                <div className={styles.detailStat}>
                  <span className={styles.detailStatValue}>
                    {formatDuration(dayEpisodes.reduce((s, e) => s + (e.end_time - e.start_time), 0))}
                  </span>
                  <span className={styles.detailStatLabel}>总时长</span>
                </div>
              </div>
              <div className={styles.episodeList}>
                <AnimatePresence>
                  {dayEpisodes.map((ep, idx) => (
                    <motion.div
                      key={ep.id}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: idx * 0.03 }}
                      className={styles.episodeItem}
                    >
                      <div className={styles.episodeTime}>
                        {new Date(ep.start_time * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div className={styles.episodeInfo}>
                        <div className={styles.episodeTitle}>{ep.title ?? "未命名"}</div>
                        {ep.summary && <div className={styles.episodeSummary}>{ep.summary}</div>}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
