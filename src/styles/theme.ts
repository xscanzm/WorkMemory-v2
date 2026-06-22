// 设计系统 Token 定义
// 对标 Linear/Raycast/Arc 的视觉精致度

// ==================== 颜色 ====================

export const colors = {
  // 品牌色
  primary: "#5B6AF0", // 蓝紫色主色
  primaryHover: "#4A59D6",
  primaryActive: "#3F4CC0",
  primarySoft: "#EEF0FE",

  // 辅助色
  success: "#10B981", // 绿色
  successSoft: "#E7F8F1",
  warning: "#F59E0B", // 警示橙
  warningSoft: "#FEF3E2",
  danger: "#EF4444", // 危险红
  dangerSoft: "#FEEBEC",

  // 中性色（浅色模式）
  bg: "#F5F7FA",
  surface: "#FFFFFF",
  surfaceHover: "#F9FAFB",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  textPrimary: "#111827",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",

  // 深色模式
  darkBg: "#0F172A",
  darkSurface: "#1E293B",
  darkSurfaceHover: "#273449",
  darkBorder: "#334155",
  darkBorderStrong: "#475569",
  darkTextPrimary: "#F1F5F9",
  darkTextSecondary: "#94A3B8",
  darkTextTertiary: "#64748B",
} as const;

// ==================== Episode 类型颜色 ====================

export const episodeTypeColors: Record<string, string> = {
  work: "#5B6AF0",
  coding: "#10B981",
  meeting: "#F59E0B",
  research: "#8B5CF6",
  planning: "#EC4899",
  reading: "#06B6D4",
  communication: "#F97316",
  default: "#9CA3AF",
};

// ==================== 间距（4px 基础单位） ====================

export const spacing = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "32px",
  "2xl": "48px",
  "3xl": "64px",
} as const;

// ==================== 字体 ====================

export const fontFamily = `-apple-system, BlinkMacSystemFont, "Microsoft YaHei", "PingFang SC", "Segoe UI", Roboto, sans-serif`;
export const fontFamilyMono = `"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Consolas, monospace`;

export const fontSize = {
  xs: "11px",
  sm: "12px",
  base: "13px",
  md: "14px",
  lg: "16px",
  xl: "18px",
  "2xl": "22px",
  "3xl": "28px",
  "4xl": "36px",
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const lineHeight = {
  tight: 1.25,
  normal: 1.5,
  relaxed: 1.7,
} as const;

// ==================== 圆角 ====================

export const radius = {
  none: "0",
  sm: "4px",
  button: "6px",
  input: "8px",
  card: "12px",
  panel: "16px",
  dialog: "20px",
  bubble: "16px",
  full: "9999px",
} as const;

// ==================== 阴影 ====================

export const shadows = {
  // 轻微
  subtle: "0 1px 4px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
  // 标准
  standard: "0 4px 16px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.10)",
  // 强调
  elevated: "0 8px 24px rgba(0,0,0,0.12), 0 16px 48px rgba(0,0,0,0.16)",
  // 内阴影
  inset: "inset 0 1px 2px rgba(0,0,0,0.04)",
  // 深色模式
  darkSubtle: "0 1px 4px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.4)",
  darkStandard: "0 4px 16px rgba(0,0,0,0.4), 0 8px 32px rgba(0,0,0,0.5)",
} as const;

// ==================== 动画 ====================

export const duration = {
  instant: "100ms",
  fast: "150ms",
  normal: "250ms",
  slow: "300ms",
} as const;

export const easing = {
  standard: "ease-in-out",
  // 弹性曲线
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  // 入场
  enter: "cubic-bezier(0.16, 1, 0.3, 1)",
  // 退场
  exit: "cubic-bezier(0.7, 0, 0.84, 0)",
} as const;

// Framer Motion 预设
export const motionPresets = {
  // 快速淡入
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15 },
  },
  // 上滑入场
  slideUp: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
    transition: { duration: 0.25, ease: "easeOut" as const },
  },
  // 弹性缩放
  springScale: {
    initial: { opacity: 0, scale: 0.92 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.92 },
    transition: { duration: 0.3, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" as const },
  },
  // 列表项交错入场
  staggerContainer: {
    animate: {
      transition: {
        staggerChildren: 0.04,
      },
    },
  },
  staggerItem: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2, ease: "easeOut" as const },
  },
} as const;

// ==================== z-index 层级 ====================

export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  overlay: 1200,
  modal: 1300,
  popover: 1400,
  toast: 1500,
  tooltip: 1600,
  commandPalette: 1700,
} as const;

// ==================== 主题类型 ====================

export type ThemeMode = "light" | "dark";

// ==================== 默认设置 ====================

export const defaultSettings = {
  ai_api_key: "",
  ai_base_url: "https://api.openai.com/v1",
  ai_model: "gpt-4o-mini",
  mascot_enabled: true,
  mascot_form: "note" as const,
  mascot_size: 80,
  capture_interval_secs: 30,
  save_screenshots: true,
  screenshot_retention_days: 7,
  screenshot_path: "",
  ocr_engine: "windows",
  dnd_enabled: false,
  dnd_start: "22:00",
  dnd_end: "08:00",
  reminder_daily_report: true,
  reminder_weekly_report: true,
  reminder_greeting: true,
  reminder_focus_25min: true,
  reminder_fragmented: true,
  reminder_long_work: true,
  reminder_night_work: true,
};
