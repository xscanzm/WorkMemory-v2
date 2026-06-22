// Tauri invoke 封装
// 统一信封处理，所有后端命令的 TypeScript 调用函数
// 后端返回 Result<T, String>，前端通过 invoke 直接拿到 T 或抛出错误

import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  CalendarDayData,
  CaptureStatus,
  Dashboard,
  DataExport,
  DataStats,
  Episode,
  GraphData,
  InsightCard,
  MascotState,
  OcrStatus,
  PrivacyRule,
  Report,
  SearchResult,
  Segment,
  TodayStats,
  WikiPage,
} from "@/types";

// ==================== 核心 invoke 封装 ====================

/**
 * 调用 Tauri command 的统一封装
 * 后端返回 Result<T, String>，Tauri 会自动把 Err 转为 reject
 * 此函数把错误统一转为 Error 抛出，并附带命令名便于排查
 */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    const message = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
    const err = new Error(`[${command}] ${message}`);
    err.name = "IpcError";
    // 上报错误日志（不阻塞）
    void log_frontend_error(`${command}: ${message}`, "error").catch(() => {});
    throw err;
  }
}

// ==================== Episode 命令 ====================

export const episodeList = (date?: string) => call<Episode[]>("episode_list", { date: date ?? null });

export const episodeGet = (id: string) => call<Episode | null>("episode_get", { id });

export const episodeCreate = (params: {
  title: string;
  summary: string;
  episodeType: string;
  project?: string;
  startTime: number;
  endTime: number;
}) =>
  call<Episode>("episode_create", {
    title: params.title,
    summary: params.summary,
    episodeType: params.episodeType,
    project: params.project ?? null,
    startTime: params.startTime,
    endTime: params.endTime,
  });

export const episodeUpdate = (episode: Episode) => call<void>("episode_update", { episode });

export const episodeDelete = (id: string) => call<void>("episode_delete", { id });

export const episodeMarkImportant = (id: string, important: boolean) =>
  call<void>("episode_mark_important", { id, important });

// ==================== Segment 命令 ====================

export const segmentList = (startTime: number, endTime: number) =>
  call<Segment[]>("segment_list", { startTime, endTime });

export const segmentGet = (id: string) => call<Segment | null>("segment_get", { id });

// ==================== 搜索命令 ====================

export const searchQuery = (query: string, sortBy?: "time" | "relevance") =>
  call<SearchResult>("search_query", { query, sortBy: sortBy ?? null });

export const searchEntityTimeline = (entity: string) =>
  call<Episode[]>("search_entity_timeline", { entity });

// ==================== 报告命令 ====================

export const reportGenerate = (templateId: string, date: string | null, supplement: string) =>
  call<string>("report_generate", { templateId, date, supplement });

export const reportList = (date?: string) => call<Report[]>("report_list", { date: date ?? null });

export const reportGet = (id: string) => call<Report | null>("report_get", { id });

export const reportDelete = (id: string) => call<void>("report_delete", { id });

export const reportExportMarkdown = (id: string) => call<string>("report_export_markdown", { id });

export const reportExportWord = (id: string) => call<number[]>("report_export_word", { id });

// ==================== Wiki 命令 ====================

export const wikiList = (wikiType?: string) =>
  call<WikiPage[]>("wiki_list", { wikiType: wikiType ?? null });

export const wikiGet = (id: string) => call<WikiPage | null>("wiki_get", { id });

export const wikiCreate = (title: string, wikiType: string, content: string) =>
  call<WikiPage>("wiki_create", { title, wikiType, content });

export const wikiUpdate = (page: WikiPage) => call<void>("wiki_update", { page });

export const wikiDelete = (id: string) => call<void>("wiki_delete", { id });

export const wikiApprove = (id: string, action: "confirm" | "ignore") =>
  call<void>("wiki_approve", { id, action });

export const wikiImportObsidian = (files: Array<[string, string]>) =>
  call<number>("wiki_import_obsidian", { files });

// ==================== 采集命令 ====================

export const captureStart = () => call<void>("capture_start");
export const captureStop = () => call<void>("capture_stop");
export const captureStatus = () => call<CaptureStatus>("capture_status");
export const captureGetTodayStats = () => call<TodayStats>("capture_get_today_stats");

// ==================== 隐私规则命令 ====================

export const privacyRuleList = () => call<PrivacyRule[]>("privacy_rule_list");

export const privacyRuleAdd = (ruleType: string, pattern: string) =>
  call<string>("privacy_rule_add", { ruleType, pattern });

export const privacyRuleDelete = (id: string) => call<void>("privacy_rule_delete", { id });

export const privacyRuleToggle = (id: string, enabled: boolean) =>
  call<void>("privacy_rule_toggle", { id, enabled });

// ==================== OCR 命令 ====================

export const ocrStatus = () => call<OcrStatus>("ocr_status");
export const ocrTest = () => call<string>("ocr_test");

// ==================== 设置命令 ====================

export const settingsGet = () => call<AppSettings>("settings_get");
export const settingsSet = (settings: AppSettings) => call<void>("settings_set", { settings });
export const settingsTestAi = () => call<string>("settings_test_ai");

// ==================== 数据管理命令 ====================

export const dataStats = () => call<DataStats>("data_stats");
export const dataClear = (beforeDate?: string) =>
  call<void>("data_clear", { beforeDate: beforeDate ?? null });
export const dataExport = () => call<DataExport>("data_export");

// ==================== 待办命令 ====================

export const todoList = (date?: string) => call<unknown>("todo_list", { date: date ?? null });

export const todoToggle = (episodeId: string, todoIndex: number, done: boolean) =>
  call<void>("todo_toggle", { episodeId, todoIndex, done });

export const todoAdd = (episodeId: string | null, content: string) =>
  call<void>("todo_add", { episodeId, content });

export const todoDelete = (episodeId: string, todoIndex: number) =>
  call<void>("todo_delete", { episodeId, todoIndex });

// ==================== 日历命令 ====================

export const calendarMonthData = (year: number, month: number) =>
  call<CalendarDayData[]>("calendar_month_data", { year, month });

export const calendarDayDetail = (date: string) =>
  call<Episode[]>("calendar_day_detail", { date });

// ==================== 洞察命令 ====================

export const insightsList = () => call<InsightCard[]>("insights_list");

export const insightsSetWeeklyGoals = (goals: string[]) =>
  call<void>("insights_set_weekly_goals", { goals });

export const insightsDashboard = () => call<Dashboard>("insights_dashboard");

// ==================== 图谱命令 ====================

export const graphData = () => call<GraphData>("graph_data");

// ==================== Mascot 命令 ====================

export const mascotGetState = () => call<MascotState>("mascot_get_state");

export const mascotSetForm = (form: string) => call<void>("mascot_set_form", { form });

export const mascotSetPosition = (x: number, y: number) =>
  call<[number, number]>("mascot_set_position", { x, y });

export const mascotGetPosition = () => call<[number, number]>("mascot_get_position");

export const mascotHideTemporarily = (minutes: number) =>
  call<void>("mascot_hide_temporarily", { minutes });

export const mascotShowBubble = (message: string, mode: number) =>
  call<void>("mascot_show_bubble", { message, mode });

export const mascotQuickCapture = (content: string) =>
  call<Episode>("mascot_quick_capture", { content });

// ==================== 日志命令 ====================

export const log_frontend_error = (message: string, level?: string) =>
  call<void>("log_frontend_error", { message, level: level ?? "error" });

// ==================== 快速捕获命令 ====================

export const quickCapture = (content: string) => call<Episode>("quick_capture", { content });
