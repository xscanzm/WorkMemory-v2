// 洞察页：周目标 + 洞察卡片流 + 数据仪表盘

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import * as ipc from "@/lib/ipc";
import { cx } from "@/lib/utils";
import type { InsightCard as InsightCardType, Dashboard } from "@/types";
import styles from "./Insights.module.css";

export function InsightsPage() {
  const toast = useToast();
  const [insights, setInsights] = useState<InsightCardType[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [weeklyGoals, setWeeklyGoals] = useState<string[]>(["", "", ""]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const loadData = async () => {
    setLoading(true);
    try {
      const [insightsList, dash] = await Promise.all([
        ipc.insightsList(),
        ipc.insightsDashboard(),
      ]);
      setInsights(insightsList);
      setDashboard(dash);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // 保存周目标
  const handleSaveGoals = async () => {
    const goals = weeklyGoals.filter((g) => g.trim()).slice(0, 3);
    if (goals.length === 0) {
      toast.warning("请至少填写一个目标");
      return;
    }
    try {
      await ipc.insightsSetWeeklyGoals(goals);
      toast.success("周目标已保存");
    } catch (e) {
      toast.error("保存失败");
    }
  };

  // 关闭洞察卡片
  const dismissCard = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  const visibleInsights = insights.filter((i) => !dismissed.has(i.id));

  // 仪表盘最大值
  const maxWeekHour = useMemo(
    () => Math.max(1, ...(dashboard?.week_hours ?? [0])),
    [dashboard]
  );

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">洞察</h1>
          <p className="page-subtitle">基于你的工作数据，发现规律、识别问题、追踪进步</p>
        </div>
      </header>

      {/* 周目标设定 */}
      <Card padding="lg">
        <h3 className={styles.sectionTitle}>本周目标</h3>
        <p className={styles.sectionDesc}>用一句话描述你本周想完成的事（最多 3 条）</p>
        <div className={styles.goalList}>
          {weeklyGoals.map((goal, i) => (
            <Input
              key={i}
              icon={<span className={styles.goalIndex}>{i + 1}</span>}
              placeholder={`第 ${i + 1} 个目标…`}
              value={goal}
              onChange={(e) => {
                const next = [...weeklyGoals];
                next[i] = e.target.value;
                setWeeklyGoals(next);
              }}
            />
          ))}
        </div>
        <Button variant="primary" size="sm" onClick={handleSaveGoals} className={styles.saveBtn}>
          保存目标
        </Button>
      </Card>

      {/* 洞察卡片流 */}
      <section>
        <h3 className={styles.sectionTitle}>洞察卡片</h3>
        {loading && <p className={styles.loadingHint}>分析中…</p>}
        {!loading && visibleInsights.length === 0 && (
          <EmptyState
            illustration="💡"
            title="暂无洞察"
            description="随着使用时间增长，WorkMemory 会自动发现你的工作规律并提供洞察。"
          />
        )}
        <div className={styles.insightList}>
          {visibleInsights.map((card, idx) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.05 }}
            >
              <Card padding="lg" className={styles.insightCard}>
                <div className={styles.insightHeader}>
                  <h4 className={styles.insightTitle}>{card.title}</h4>
                  <span className={cx(styles.insightTypeBadge, styles[`type_${card.insight_type}`])}>
                    {card.insight_type}
                  </span>
                </div>
                <p className={styles.insightDesc}>{card.description}</p>
                {card.detail && <p className={styles.insightDetail}>{card.detail}</p>}
                <div className={styles.insightActions}>
                  <Button size="sm" variant="ghost">
                    查看详情
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => dismissCard(card.id)}>
                    知道了
                  </Button>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 数据仪表盘 */}
      {dashboard && (
        <section>
          <h3 className={styles.sectionTitle}>数据仪表盘</h3>
          <div className={styles.dashboardGrid}>
            {/* 本周工作时长柱状图 */}
            <Card padding="md" className={styles.chartCard}>
              <h4 className={styles.chartTitle}>本周工作时长</h4>
              <div className={styles.barChart}>
                {["一", "二", "三", "四", "五", "六", "日"].map((day, i) => {
                  const hours = dashboard.week_hours[i] ?? 0;
                  const height = (hours / maxWeekHour) * 100;
                  return (
                    <div key={i} className={styles.barItem}>
                      <div className={styles.barTrack}>
                        <motion.div
                          className={styles.bar}
                          initial={{ height: 0 }}
                          animate={{ height: `${Math.max(2, height)}%` }}
                          transition={{ duration: 0.5, delay: i * 0.05, ease: "easeOut" }}
                        />
                      </div>
                      <span className={styles.barLabel}>{day}</span>
                      <span className={styles.barValue}>{hours.toFixed(1)}h</span>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* 本月项目占比饼图 */}
            <Card padding="md" className={styles.chartCard}>
              <h4 className={styles.chartTitle}>本月项目占比</h4>
              {dashboard.month_projects.length === 0 ? (
                <p className={styles.emptyChart}>暂无数据</p>
              ) : (
                <div className={styles.pieChart}>
                  <PieChart data={dashboard.month_projects.slice(0, 5)} />
                  <div className={styles.pieLegend}>
                    {dashboard.month_projects.slice(0, 5).map((p, i) => (
                      <div key={i} className={styles.legendItem}>
                        <span
                          className={styles.legendDot}
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className={styles.legendLabel}>{p.project}</span>
                        <span className={styles.legendValue}>{p.percentage.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* 知识库成长曲线 */}
            <Card padding="md" className={styles.chartCard}>
              <h4 className={styles.chartTitle}>知识库成长（30 天）</h4>
              <LineChart data={dashboard.wiki_growth} />
            </Card>

            {/* Token 消耗 */}
            <Card padding="md" className={styles.chartCard}>
              <h4 className={styles.chartTitle}>Token 消耗估算</h4>
              <div className={styles.tokenDisplay}>
                <span className={styles.tokenValue}>{dashboard.token_estimate.toLocaleString()}</span>
                <span className={styles.tokenUnit}>tokens</span>
              </div>
              <p className={styles.tokenHint}>基于工作事件数量估算</p>
            </Card>
          </div>
        </section>
      )}
    </div>
  );
}

// 饼图颜色
const PIE_COLORS = ["#5B6AF0", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899"];

// 简易饼图
function PieChart({ data }: { data: Array<{ project: string; percentage: number }> }) {
  const total = data.reduce((sum, d) => sum + d.percentage, 0);
  let cumulative = 0;
  const radius = 50;
  const cx = 60;
  const cy = 60;

  const arcs = data.map((d, i) => {
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    cumulative += d.percentage;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return {
      path: `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: PIE_COLORS[i % PIE_COLORS.length],
    };
  });

  return (
    <svg width="120" height="120" viewBox="0 0 120 120">
      {arcs.map((arc, i) => (
        <path key={i} d={arc.path} fill={arc.color} />
      ))}
    </svg>
  );
}

// 简易折线图
function LineChart({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const width = 280;
  const height = 80;
  const step = width / Math.max(1, data.length - 1);

  const points = data.map((v, i) => `${i * step},${height - (v / max) * height}`).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width="100%" height={height + 20} viewBox={`0 0 ${width} ${height + 20}`}>
      <polygon points={areaPoints} fill="var(--color-primary)" opacity={0.15} />
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {data.length > 0 && (
        <text x={width} y={height + 14} textAnchor="end" fontSize={10} fill="var(--color-text-tertiary)">
          {data[data.length - 1]} 张
        </text>
      )}
    </svg>
  );
}
