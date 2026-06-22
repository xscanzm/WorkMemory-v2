// 今日记忆主界面
// 顶部状态区 + 快速捕获 + 时间轴/列表双视图 + 右侧详情 + 底部待办汇总

import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/Dropdown";
import { useToast } from "@/components/ui/Toast";
import { useEpisodeStore } from "@/store/useEpisodeStore";
import * as ipc from "@/lib/ipc";
import {
  formatTime,
  formatDuration,
  formatDurationShort,
  parseEntities,
  parseTopics,
  parseTodos,
  cx,
  todayStr,
  nowTimestamp,
} from "@/lib/utils";
import { episodeTypeColors } from "@/styles/theme";
import type { Episode, TodoItem } from "@/types";
import styles from "./Today.module.css";

export function TodayPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    episodes,
    selectedEpisode,
    todayStats,
    captureStatus,
    loading,
    viewMode,
    loadTodayEpisodes,
    loadTodayStats,
    loadCaptureStatus,
    selectEpisode,
    setViewMode,
    updateEpisode,
    removeEpisode,
    toggleImportant,
  } = useEpisodeStore();

  const [quickInput, setQuickInput] = useState("");
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [editingField, setEditingField] = useState<"title" | "summary" | null>(null);
  const [editValue, setEditValue] = useState("");

  // 初始加载
  useEffect(() => {
    void loadTodayEpisodes();
    void loadTodayStats();
    void loadCaptureStatus();
  }, [loadTodayEpisodes, loadTodayStats, loadCaptureStatus]);

  // 加载待办
  const loadTodos = useCallback(async () => {
    try {
      const result = (await ipc.todoList(todayStr())) as TodoItem[];
      setTodos(result);
    } catch (e) {
      console.error("加载待办失败", e);
    }
  }, []);

  useEffect(() => {
    void loadTodos();
  }, [loadTodos, episodes]);

  // 快速捕获
  const handleQuickCapture = async () => {
    const content = quickInput.trim();
    if (!content) return;
    try {
      await ipc.quickCapture(content);
      setQuickInput("");
      toast.success("已记录");
      await loadTodayEpisodes();
      await loadTodayStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  };

  // 切换录制
  const toggleCapture = async () => {
    if (captureStatus?.is_paused) {
      await ipc.captureStart();
      toast.info("已开始记录");
    } else {
      await ipc.captureStop();
      toast.info("已暂停记录");
    }
    await loadCaptureStatus();
  };

  // 内联编辑
  const startEdit = (field: "title" | "summary", value: string) => {
    setEditingField(field);
    setEditValue(value);
  };

  const saveEdit = async () => {
    if (!selectedEpisode || !editingField) return;
    const updated: Episode = {
      ...selectedEpisode,
      [editingField]: editValue,
    };
    try {
      await ipc.episodeUpdate(updated);
      updateEpisode(updated);
      toast.success("已保存");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
    setEditingField(null);
  };

  // 删除事件
  const handleDelete = async (id: string) => {
    try {
      await ipc.episodeDelete(id);
      removeEpisode(id);
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  // 加入报告
  const handleAddToReport = () => {
    navigate("/reports");
    toast.info("已跳转到报告页");
  };

  // 待办切换
  const toggleTodo = async (todo: TodoItem, index: number) => {
    try {
      await ipc.todoToggle(todo.episode_id, index, !todo.done);
      setTodos((prev) =>
        prev.map((t, i) => (i === index ? { ...t, done: !t.done } : t))
      );
    } catch (e) {
      toast.error("更新失败");
    }
  };

  // 全部完成
  const completeAllTodos = async () => {
    for (let i = 0; i < todos.length; i++) {
      const t = todos[i];
      if (!t.done) {
        try {
          await ipc.todoToggle(t.episode_id, i, true);
        } catch {
          /* ignore */
        }
      }
    }
    setTodos((prev) => prev.map((t) => ({ ...t, done: true })));
    toast.success("全部完成");
  };

  // 实体确认/修正/忽略
  const handleEntityAction = async (entityName: string, _action: "confirm" | "correct" | "ignore") => {
    if (!selectedEpisode) return;
    toast.info(`实体「${entityName}」已${_action === "confirm" ? "确认" : _action === "correct" ? "标记修正" : "忽略"}`);
  };

  // 时间轴数据
  const timelineBlocks = useMemo(() => {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayStartTs = Math.floor(dayStart.getTime() / 1000);
    const dayEndTs = dayStartTs + 86400;

    return episodes
      .filter((e) => e.end_time >= dayStartTs && e.start_time < dayEndTs)
      .map((e) => {
        const startOffset = Math.max(0, e.start_time - dayStartTs);
        const endOffset = Math.min(86400, e.end_time - dayStartTs);
        return {
          episode: e,
          left: (startOffset / 86400) * 100,
          width: Math.max(0.5, ((endOffset - startOffset) / 86400) * 100),
        };
      });
  }, [episodes]);

  // 当前时间竖线位置
  const nowLineLeft = useMemo(() => {
    const now = new Date();
    const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    return (seconds / 86400) * 100;
  }, [episodes]);

  const pendingTodoCount = todos.filter((t) => !t.done).length;

  return (
    <div className={styles.container}>
      {/* 顶部状态区 */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div>
            <h1 className={styles.title}>今日记忆</h1>
            <p className={styles.subtitle}>
              {new Date().toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </p>
          </div>
        </div>
        <div className={styles.headerStats}>
          <div className={styles.statItem}>
            <div className={cx(styles.statDot, captureStatus?.is_paused ? styles.dotPaused : styles.dotRecording)} />
            <span className={styles.statLabel}>
              {captureStatus?.is_paused ? "已暂停" : "记录中"}
            </span>
          </div>
          <Stat label="事件" value={todayStats?.episode_count ?? 0} />
          <Stat
            label="专注"
            value={formatDurationShort(todayStats?.focus_seconds ?? 0)}
          />
          <Stat label="切换" value={todayStats?.switch_count ?? 0} />
          <Button size="sm" variant="ghost" onClick={toggleCapture}>
            {captureStatus?.is_paused ? "继续" : "暂停"}
          </Button>
          <Button size="sm" variant="primary" onClick={() => navigate("/reports")}>
            生成报告
          </Button>
        </div>
      </header>

      {/* 快速捕获 */}
      <div className={styles.quickCapture}>
        <Input
          icon={<span>✍️</span>}
          placeholder="快速记一笔…  #标签 @项目  回车保存"
          value={quickInput}
          onChange={(e) => setQuickInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleQuickCapture();
          }}
        />
      </div>

      {/* Tab 切换 */}
      <div className={styles.tabs}>
        <button
          className={cx(styles.tab, viewMode === "timeline" && styles.tabActive)}
          onClick={() => setViewMode("timeline")}
        >
          时间轴
        </button>
        <button
          className={cx(styles.tab, viewMode === "list" && styles.tabActive)}
          onClick={() => setViewMode("list")}
        >
          列表
        </button>
      </div>

      {/* 主体内容 */}
      <div className={styles.body}>
        {/* 加载中 */}
        {loading && episodes.length === 0 && (
          <div className={styles.listContainer}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* 空状态 */}
        {!loading && episodes.length === 0 && (
          <EmptyState
            illustration="🌱"
            title="今天还没有记录"
            description="开始工作后，WorkMemory 会自动记录你的工作事件。也可以在上方输入框快速记一笔。"
            actionText="快速记一笔"
            onAction={() => {
              const input = document.querySelector<HTMLInputElement>(`.${styles.quickCapture} input`);
              input?.focus();
            }}
          />
        )}

        {/* 时间轴视图 */}
        {viewMode === "timeline" && episodes.length > 0 && (
          <TimelineView
            blocks={timelineBlocks}
            nowLineLeft={nowLineLeft}
            onSelect={selectEpisode}
            selectedId={selectedEpisode?.id}
          />
        )}

        {/* 列表视图 */}
        {viewMode === "list" && episodes.length > 0 && (
          <div className={styles.listContainer}>
            <AnimatePresence>
              {episodes.map((episode, idx) => (
                <motion.div
                  key={episode.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, delay: idx * 0.03 }}
                >
                  <EpisodeCard
                    episode={episode}
                    selected={selectedEpisode?.id === episode.id}
                    onClick={() => selectEpisode(episode)}
                    onMenuDelete={() => handleDelete(episode.id)}
                    onMenuImportant={() => toggleImportant(episode.id, !episode.important)}
                    onMenuReport={handleAddToReport}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 底部待办汇总 */}
      {todos.length > 0 && (
        <footer className={styles.todoFooter}>
          <div className={styles.todoHeader}>
            <h3 className={styles.todoTitle}>
              待办汇总
              {pendingTodoCount > 0 && (
                <span className={styles.todoBadge}>{pendingTodoCount}</span>
              )}
            </h3>
            {pendingTodoCount > 0 && (
              <Button size="sm" variant="ghost" onClick={completeAllTodos}>
                全部完成
              </Button>
            )}
          </div>
          <ul className={styles.todoList}>
            {todos.map((todo, idx) => (
              <li key={idx} className={styles.todoItem}>
                <input
                  type="checkbox"
                  checked={todo.done}
                  onChange={() => toggleTodo(todo, idx)}
                  className={styles.todoCheckbox}
                />
                <span className={cx(styles.todoContent, todo.done && styles.todoDone)}>
                  {todo.content}
                </span>
              </li>
            ))}
          </ul>
        </footer>
      )}

      {/* 右侧详情面板（弹出式） */}
      <AnimatePresence>
        {selectedEpisode && (
          <motion.aside
            className={styles.detail}
            initial={{ x: 380, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 380, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <DetailPanel
              episode={selectedEpisode}
              editingField={editingField}
              editValue={editValue}
              onEditStart={startEdit}
              onEditChange={setEditValue}
              onEditSave={saveEdit}
              onEditCancel={() => setEditingField(null)}
              onClose={() => selectEpisode(null)}
              onDelete={() => handleDelete(selectedEpisode.id)}
              onImportant={() => toggleImportant(selectedEpisode.id, !selectedEpisode.important)}
              onAddToReport={handleAddToReport}
              onEntityAction={handleEntityAction}
            />
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==================== 子组件 ====================

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.statItem}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

// 时间轴视图
function TimelineView({
  blocks,
  nowLineLeft,
  onSelect,
  selectedId,
}: {
  blocks: Array<{ episode: Episode; left: number; width: number }>;
  nowLineLeft: number;
  onSelect: (e: Episode) => void;
  selectedId?: string;
}) {
  return (
    <Card padding="md" className={styles.timelineCard}>
      <div className={styles.timelineHours}>
        {Array.from({ length: 25 }).map((_, h) => (
          <div key={h} className={styles.hourTick} style={{ left: `${(h / 24) * 100}%` }}>
            <span>{h.toString().padStart(2, "0")}</span>
          </div>
        ))}
      </div>
      <div className={styles.timelineTrack}>
        {blocks.map(({ episode, left, width }) => {
          const color = episodeTypeColors[episode.episode_type ?? "default"] ?? episodeTypeColors.default;
          const isSelected = selectedId === episode.id;
          return (
            <Tooltip
              key={episode.id}
              content={
                <div>
                  <div style={{ fontWeight: 600 }}>{episode.title ?? "未命名"}</div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>
                    {formatTime(episode.start_time)} - {formatTime(episode.end_time)} ·{" "}
                    {formatDuration(episode.end_time - episode.start_time)}
                  </div>
                </div>
              }
            >
              <motion.button
                className={styles.timelineBlock}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: color,
                  boxShadow: isSelected ? `0 0 0 2px var(--color-primary)` : undefined,
                }}
                onClick={() => onSelect(episode)}
                whileHover={{ scaleY: 1.15 }}
                transition={{ duration: 0.15 }}
              />
            </Tooltip>
          );
        })}
        <div className={styles.nowLine} style={{ left: `${nowLineLeft}%` }}>
          <div className={styles.nowDot} />
        </div>
      </div>
      <div className={styles.timelineLegend}>
        {Object.entries(episodeTypeColors).slice(0, 7).map(([type, color]) => (
          <div key={type} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: color }} />
            <span>{type}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// 事件卡片
function EpisodeCard({
  episode,
  selected,
  onClick,
  onMenuDelete,
  onMenuImportant,
  onMenuReport,
}: {
  episode: Episode;
  selected: boolean;
  onClick: () => void;
  onMenuDelete: () => void;
  onMenuImportant: () => void;
  onMenuReport: () => void;
}) {
  const color = episodeTypeColors[episode.episode_type ?? "default"] ?? episodeTypeColors.default;
  const topics = parseTopics(episode.topics_json);
  const duration = episode.end_time - episode.start_time;

  return (
    <Card hoverable padding="md" className={cx(styles.episodeCard, selected && styles.episodeCardSelected)} onClick={onClick}>
      <div className={styles.cardAccent} style={{ background: color }} />
      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <h4 className={styles.cardTitle}>{episode.title ?? "未命名事件"}</h4>
          <Dropdown
            trigger={
              <button className={styles.menuBtn} onClick={(e) => e.stopPropagation()}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <circle cx="3" cy="7" r="1.2" />
                  <circle cx="7" cy="7" r="1.2" />
                  <circle cx="11" cy="7" r="1.2" />
                </svg>
              </button>
            }
          >
            <DropdownItem onSelect={onMenuImportant} icon={<span>⭐</span>}>
              {episode.important ? "取消重要" : "标记重要"}
            </DropdownItem>
            <DropdownItem onSelect={onMenuReport} icon={<span>📝</span>}>
              加入报告
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem onSelect={onMenuDelete} danger icon={<span>🗑</span>}>
              删除
            </DropdownItem>
          </Dropdown>
        </div>
        {episode.summary && <p className={styles.cardSummary}>{episode.summary}</p>}
        <div className={styles.cardMeta}>
          <span className={styles.cardTime}>
            {formatTime(episode.start_time)} - {formatTime(episode.end_time)}
          </span>
          <span className={styles.cardDuration}>{formatDuration(duration)}</span>
          {episode.important === 1 && <span className={styles.importantMark}>⭐</span>}
          {topics.slice(0, 3).map((t) => (
            <span key={t} className={styles.topicTag}>
              #{t}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

// 详情面板
function DetailPanel({
  episode,
  editingField,
  editValue,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onClose,
  onDelete,
  onImportant,
  onAddToReport,
  onEntityAction,
}: {
  episode: Episode;
  editingField: "title" | "summary" | null;
  editValue: string;
  onEditStart: (field: "title" | "summary", value: string) => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onClose: () => void;
  onDelete: () => void;
  onImportant: () => void;
  onAddToReport: () => void;
  onEntityAction: (name: string, action: "confirm" | "correct" | "ignore") => void;
}) {
  const entities = parseEntities(episode.entities_json);
  const topics = parseTopics(episode.topics_json);
  const todos = parseTodos(episode.todos_json);
  const segmentIds = parseTodos(episode.segment_ids_json);

  return (
    <>
      <div className={styles.detailHeader}>
        <button className={styles.closeBtn} onClick={onClose} aria-label="关闭">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className={styles.detailContent}>
        {/* 标题（可内联编辑） */}
        {editingField === "title" ? (
          <Input
            autoFocus
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onEditSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") onEditSave();
              if (e.key === "Escape") onEditCancel();
            }}
          />
        ) : (
          <h2
            className={styles.detailTitle}
            onClick={() => onEditStart("title", episode.title ?? "")}
            title="点击编辑"
          >
            {episode.title ?? "未命名事件"}
            <span className={styles.editHint}>✏️</span>
          </h2>
        )}

        {/* 时间段 */}
        <div className={styles.detailTime}>
          {formatTime(episode.start_time)} - {formatTime(episode.end_time)} ·{" "}
          {formatDuration(episode.end_time - episode.start_time)}
        </div>

        {/* AI 摘要（可编辑） */}
        <section className={styles.detailSection}>
          <h3 className={styles.sectionTitle}>AI 摘要</h3>
          {editingField === "summary" ? (
            <textarea
              autoFocus
              className={styles.textarea}
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              onBlur={onEditSave}
              onKeyDown={(e) => {
                if (e.key === "Escape") onEditCancel();
              }}
              rows={3}
            />
          ) : (
            <p
              className={styles.detailSummary}
              onClick={() => onEditStart("summary", episode.summary ?? "")}
              title="点击编辑"
            >
              {episode.summary ?? "暂无摘要"}
              <span className={styles.editHint}>✏️</span>
            </p>
          )}
        </section>

        {/* 涉及实体 */}
        {entities.length > 0 && (
          <section className={styles.detailSection}>
            <h3 className={styles.sectionTitle}>涉及实体</h3>
            <div className={styles.entityList}>
              {entities.map((entity, i) => (
                <div key={i} className={styles.entityItem}>
                  <span className={styles.entityIcon}>
                    {entity.entity_type === "person" ? "👤" : entity.entity_type === "project" ? "📦" : "📄"}
                  </span>
                  <span className={styles.entityName}>{entity.name}</span>
                  <div className={styles.entityActions}>
                    <button
                      className={styles.entityBtn}
                      onClick={() => onEntityAction(entity.name, "confirm")}
                      title="确认"
                    >
                      ✅
                    </button>
                    <button
                      className={styles.entityBtn}
                      onClick={() => onEntityAction(entity.name, "correct")}
                      title="修正"
                    >
                      ✏️
                    </button>
                    <button
                      className={styles.entityBtn}
                      onClick={() => onEntityAction(entity.name, "ignore")}
                      title="忽略"
                    >
                      ❌
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 话题标签 */}
        {topics.length > 0 && (
          <section className={styles.detailSection}>
            <h3 className={styles.sectionTitle}>话题标签</h3>
            <div className={styles.topicList}>
              {topics.map((t) => (
                <span key={t} className={styles.topicTagLarge}>
                  #{t}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* 截图缩略图 */}
        {segmentIds.length > 0 && (
          <section className={styles.detailSection}>
            <h3 className={styles.sectionTitle}>截图（{segmentIds.length}）</h3>
            <div className={styles.screenshotGrid}>
              {Array.from({ length: Math.min(4, segmentIds.length) }).map((_, i) => (
                <div key={i} className={styles.screenshotPlaceholder}>
                  🖼️
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 待办列表 */}
        {todos.length > 0 && (
          <section className={styles.detailSection}>
            <h3 className={styles.sectionTitle}>待办（{todos.length}）</h3>
            <ul className={styles.detailTodoList}>
              {todos.map((todo, i) => (
                <li key={i} className={styles.detailTodoItem}>
                  <input type="checkbox" className={styles.todoCheckbox} />
                  <span>{todo}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* 底部操作 */}
      <div className={styles.detailFooter}>
        <Button size="sm" variant="ghost" onClick={onAddToReport}>
          加入报告
        </Button>
        <Button size="sm" variant="ghost" onClick={onImportant}>
          {episode.important ? "取消重要" : "标记重要"}
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete}>
          删除
        </Button>
      </div>
    </>
  );
}
