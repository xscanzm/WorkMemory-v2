// 桌面伙伴组件
// 5 种形象 + 5 种功能状态 + 7 种情绪状态 + 微动画 + 三种气泡模式 + 右键菜单 + 拖拽吸附 + 首次启动引导

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMascotStore } from "@/store/useMascotStore";
import * as ipc from "@/lib/ipc";
import { onMascotStateChange, onMascotReminder, onMascotShowBubble } from "@/lib/events";
import type { MascotForm, MascotFunctionalState, BubbleContent, TodaySummary } from "@/types";
import { cx, formatDuration } from "@/lib/utils";
import styles from "./Mascot.module.css";

// 形象配置
const FORM_CONFIG: Record<MascotForm, { emoji: string; bg: string; label: string }> = {
  note: { emoji: "📝", bg: "#FEF3E2", label: "便签" },
  film: { emoji: "🎬", bg: "#E0E7FF", label: "胶片" },
  copilot: { emoji: "🚀", bg: "#DBEAFE", label: "副驾" },
  cursor: { emoji: "🖱️", bg: "#D1FAE5", label: "指针" },
  paper: { emoji: "🦊", bg: "#FEE2E2", label: "纸狐" },
};

// 引导气泡内容
const GUIDE_BUBBLES: Array<{ message: string; duration: number }> = [
  { message: "嗨！我是你的工作记忆伙伴 👋", duration: 3000 },
  { message: "我会默默记住你做过的事，需要时帮你回忆", duration: 3500 },
  { message: "悬停我可以查看今日摘要，右键有更多功能", duration: 3500 },
  { message: "选一个你喜欢的形象吧！", duration: 3000 },
];

export function Mascot() {
  const {
    state,
    bubble,
    dragging,
    firstLaunch,
    guideStep,
    loadState,
    setForm,
    setPosition,
    showBubble,
    hideBubble,
    setDragging,
    setFirstLaunch,
    setGuideStep,
    hideTemporarily,
  } = useMascotStore();

  const [position, setPositionLocal] = useState<{ x: number; y: number }>({ x: 1820, y: 980 });
  const [hovering, setHovering] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showFormPicker, setShowFormPicker] = useState(false);
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; mouseX: number; mouseY: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 初始化加载状态
  useEffect(() => {
    void loadState();
    // 检查首次启动
    const launched = localStorage.getItem("wm-launched");
    if (!launched) {
      setFirstLaunch(true);
      setGuideStep(0);
      localStorage.setItem("wm-launched", "1");
    }
  }, [loadState, setFirstLaunch, setGuideStep]);

  // 监听事件
  useEffect(() => {
    const unlistenState = onMascotStateChange((s) => {
      useMascotStore.setState({ state: s });
    });
    const unlistenReminder = onMascotReminder((r) => {
      showBubble({ message: r.message, mode: 1 });
    });
    const unlistenBubble = onMascotShowBubble((b) => {
      showBubble({ message: b.message, mode: b.mode });
    });

    return () => {
      void unlistenState.then((fn) => fn());
      void unlistenReminder.then((fn) => fn());
      void unlistenBubble.then((fn) => fn());
    };
  }, [showBubble]);

  // 首次启动引导
  useEffect(() => {
    if (!firstLaunch || guideStep >= GUIDE_BUBBLES.length) return;

    const bubble = GUIDE_BUBBLES[guideStep];
    showBubble({ message: bubble.message, mode: 1 });
    const timer = setTimeout(() => {
      hideBubble();
      const nextStep = guideStep + 1;
      setGuideStep(nextStep);
      if (nextStep === GUIDE_BUBBLES.length) {
        setShowFormPicker(true);
      }
    }, bubble.duration);

    return () => clearTimeout(timer);
  }, [firstLaunch, guideStep, showBubble, hideBubble, setGuideStep]);

  // 自动消失气泡（模式 1）
  useEffect(() => {
    if (bubble?.mode === 1) {
      bubbleTimerRef.current = setTimeout(() => {
        hideBubble();
      }, 6000);
    }
    return () => {
      if (bubbleTimerRef.current) clearTimeout(bubbleTimerRef.current);
    };
  }, [bubble, hideBubble]);

  // 加载今日摘要
  const loadTodaySummary = useCallback(async () => {
    try {
      const stats = await ipc.captureGetTodayStats();
      const episodes = await ipc.episodeList(new Date().toISOString().slice(0, 10));
      setTodaySummary({
        episodes: episodes.slice(0, 5).map((e) => ({
          id: e.id,
          title: e.title ?? "未命名",
          start_time: e.start_time,
        })),
        focus_seconds: stats.focus_seconds,
        episode_count: stats.episode_count,
      });
    } catch {
      /* ignore */
    }
  }, []);

  // 悬停 250ms 后显示摘要
  const handleMouseEnter = () => {
    setHovering(true);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      if (!dragging && !firstLaunch) {
        void loadTodaySummary();
        showBubble({
          message: "",
          mode: 3,
          summary: todaySummary ?? undefined,
        });
      }
    }, 250);
  };

  const handleMouseLeave = () => {
    setHovering(false);
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  };

  // 左键单击
  const handleClick = async () => {
    if (dragging) return;
    if (firstLaunch) return;

    // 检查未读报告 / 未完成待办
    try {
      const stats = await ipc.captureGetTodayStats();
      if (stats.todo_count > stats.todo_done) {
        showBubble({
          message: `还有 ${stats.todo_count - stats.todo_done} 个待办未完成`,
          mode: 2,
          actions: [{ label: "查看", action: "todos" }],
        });
        return;
      }
    } catch {
      /* ignore */
    }

    // 默认跳转到 Today 页（通过事件通知主窗口）
    showBubble({ message: "打开今日记忆 📋", mode: 1 });
  };

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // 拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // 仅左键
    dragStartRef.current = {
      x: position.x,
      y: position.y,
      mouseX: e.screenX,
      mouseY: e.screenY,
    };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.screenX - dragStartRef.current.mouseX;
      const dy = e.screenY - dragStartRef.current.mouseY;
      setPositionLocal({
        x: dragStartRef.current.x + dx,
        y: dragStartRef.current.y + dy,
      });
    };
    const handleUp = () => {
      setDragging(false);
      // 吸附到最近角
      const screenW = window.screen.width;
      const screenH = window.screen.height;
      const size = state?.size ?? 80;
      const margin = 20;
      const center = position.x + size / 2;
      const snapX = center < screenW / 2 ? margin : screenW - size - margin;
      const snapY = position.y + size / 2 < screenH / 2 ? margin : screenH - size - margin;
      // 300ms 动画吸附
      setPositionLocal({ x: snapX, y: snapY });
      void setPosition(snapX, snapY);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, position, state, setDragging, setPosition]);

  // 关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  if (!state || !state.visible) return null;

  const form = (state.form as MascotForm) ?? "note";
  const formConfig = FORM_CONFIG[form] ?? FORM_CONFIG.note;
  const functionalState = state.functional_state as MascotFunctionalState;
  const size = state.size;

  // 状态指示器
  const stateIndicator = (() => {
    switch (functionalState) {
      case "recording":
        return <span className={cx(styles.indicator, styles.indRecording)} />;
      case "paused":
        return null;
      case "privacy":
        return <span className={styles.privacyMask}>🙈</span>;
      case "ocr_scanning":
        return <span className={styles.scanLine} />;
      case "report_ready":
        return <span className={cx(styles.indicator, styles.indReport)}>1</span>;
      default:
        return null;
    }
  })();

  // 动画变体
  const mascotVariants = {
    idle: {
      scale: 1,
      y: 0,
      rotate: 0,
    },
    breathing: {
      scale: [1, 1.04, 1],
      transition: {
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
    floating: {
      y: [0, -5, 0],
      transition: {
        duration: 4,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
    dragging: {
      scale: 0.92,
      rotate: dragging ? (position.x > window.screen.width / 2 ? 5 : -5) : 0,
    },
    hover: {
      scale: 1.08,
    },
  };

  return (
    <div
      className={styles.container}
      style={{
        left: position.x,
        top: position.y,
        width: size,
        height: size,
      }}
    >
      <motion.div
        className={styles.mascot}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        animate={
          dragging
            ? "dragging"
            : hovering
            ? "hover"
            : functionalState === "recording"
            ? "breathing"
            : "floating"
        }
        variants={mamscotVariants(mascotVariants)}
        whileTap={{ scale: 0.92 }}
        transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
        style={{
          background: formConfig.bg,
          width: size,
          height: size,
        }}
      >
        <span className={styles.emoji} style={{ fontSize: size * 0.5 }}>
          {formConfig.emoji}
        </span>
        {stateIndicator}
      </motion.div>

      {/* 气泡 */}
      <AnimatePresence>
        {bubble && (
          <motion.div
            className={styles.bubble}
            initial={{ opacity: 0, scale: 0.85, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 10 }}
            transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
            style={{ left: size + 12 }}
          >
            {bubble.mode === 1 && <p className={styles.bubbleText}>{bubble.message}</p>}
            {bubble.mode === 2 && (
              <>
                <p className={styles.bubbleText}>{bubble.message}</p>
                {bubble.actions && (
                  <div className={styles.bubbleActions}>
                    {bubble.actions.map((a, i) => (
                      <button
                        key={i}
                        className={styles.bubbleBtn}
                        onClick={() => {
                          if (a.action === "todos") {
                            void ipc.captureGetTodayStats();
                          }
                          hideBubble();
                        }}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {bubble.mode === 3 && bubble.summary && (
              <div className={styles.summaryCard}>
                <div className={styles.summaryHeader}>今日摘要</div>
                <div className={styles.summaryStats}>
                  <div className={styles.summaryStat}>
                    <span className={styles.summaryStatValue}>{bubble.summary.episode_count}</span>
                    <span className={styles.summaryStatLabel}>事件</span>
                  </div>
                  <div className={styles.summaryStat}>
                    <span className={styles.summaryStatValue}>
                      {formatDuration(bubble.summary.focus_seconds)}
                    </span>
                    <span className={styles.summaryStatLabel}>专注</span>
                  </div>
                </div>
                <ul className={styles.summaryList}>
                  {bubble.summary.episodes.map((e) => (
                    <li key={e.id} className={styles.summaryItem}>
                      <span className={styles.summaryTime}>
                        {new Date(e.start_time * 1000).toLocaleTimeString("zh-CN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className={styles.summaryTitle}>{e.title}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className={styles.summaryBtn}
                  onClick={() => {
                    hideBubble();
                  }}
                >
                  打开完整记忆 →
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x - position.x, top: contextMenu.y - position.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className={styles.menuItem} onClick={() => { setContextMenu(null); showBubble({ message: "打开今日记忆", mode: 1 }); }}>
            📋 打开今日
          </button>
          <button className={styles.menuItem} onClick={() => { setContextMenu(null); showBubble({ message: "快速记一笔", mode: 2, actions: [{ label: "输入", action: "capture" }] }); }}>
            ✍️ 快速记一笔
          </button>
          <button className={styles.menuItem} onClick={async () => { setContextMenu(null); const status = await ipc.captureStatus(); if (status.is_paused) { await ipc.captureStart(); showBubble({ message: "继续记录", mode: 1 }); } else { await ipc.captureStop(); showBubble({ message: "已暂停", mode: 1 }); } }}>
            {state.functional_state === "paused" ? "▶️ 继续" : "⏸️ 暂停"}
          </button>
          <button className={styles.menuItem} onClick={() => { setContextMenu(null); showBubble({ message: "生成报告中…", mode: 1 }); }}>
            📝 生成报告
          </button>
          <button className={styles.menuItem} onClick={() => { setContextMenu(null); showBubble({ message: "打开设置", mode: 1 }); }}>
            ⚙️ 设置
          </button>
          <div className={styles.menuDivider} />
          <button className={styles.menuItem} onClick={() => { setContextMenu(null); void hideTemporarily(10); }}>
            🙈 隐藏 10 分钟
          </button>
        </div>
      )}

      {/* 形象选择器（首次启动） */}
      <AnimatePresence>
        {showFormPicker && (
          <motion.div
            className={styles.formPicker}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{ left: size + 12 }}
          >
            <p className={styles.pickerTitle}>选择你的伙伴形象</p>
            <div className={styles.pickerGrid}>
              {Object.entries(FORM_CONFIG).map(([id, config]) => (
                <button
                  key={id}
                  className={cx(styles.pickerItem, form === id && styles.pickerItemActive)}
                  onClick={async () => {
                    await setForm(id as MascotForm);
                    setShowFormPicker(false);
                    setFirstLaunch(false);
                    showBubble({ message: "很高兴成为你的伙伴！", mode: 1 });
                  }}
                >
                  <span className={styles.pickerEmoji}>{config.emoji}</span>
                  <span className={styles.pickerLabel}>{config.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// 辅助：处理 variants 类型
function mamscotVariants(v: Record<string, unknown>) {
  return v as never;
}
