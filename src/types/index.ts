// WorkMemory 全局类型定义
// 与后端 Rust 结构体一一对应，所有字段命名保持 snake_case 以匹配 serde 序列化结果

// ==================== Episode 相关 ====================

/** 实体：人物/项目/文档 */
export interface Entity {
  name: string;
  entity_type: "person" | "project" | "document" | string;
}

/** 工作事件：由多个连续 Segment 归并而成 */
export interface Episode {
  id: string;
  date: string;
  start_time: number;
  end_time: number;
  title: string | null;
  summary: string | null;
  episode_type: string | null;
  project: string | null;
  entities_json: string | null;
  topics_json: string | null;
  todos_json: string | null;
  blockers_json: string | null;
  segment_ids_json: string | null;
  source: string | null;
  related_episode_ids_json: string | null;
  important: number;
  created_at: number;
}

/** 截图片段：单次截图元数据 + OCR 结果 */
export interface Segment {
  id: string;
  timestamp: number;
  ocr_text: string | null;
  window_title: string | null;
  app_name: string | null;
  image_path: string | null;
  ocr_blocks_json: string | null;
  perceptual_hash: string | null;
  capture_source: string | null;
}

/** 待办项（前端组装） */
export interface TodoItem {
  id: string;
  episode_id: string;
  content: string;
  done: boolean;
}

// ==================== Wiki 相关 ====================

/** Wiki 卡片类型 */
export type WikiType = "person" | "project" | "decision" | "meeting" | "topic" | "skill";

/** Wiki 卡片状态 */
export type WikiStatus = "pending" | "confirmed" | "ignored";

/** 知识库页面 */
export interface WikiPage {
  id: string;
  title: string;
  wiki_type: WikiType | string;
  content: string | null;
  backlinks_json: string | null;
  last_cited_at: number | null;
  status: WikiStatus | string | null;
  created_at: number;
  updated_at: number;
}

// ==================== Report 相关 ====================

/** 报告模板 ID */
export type ReportTemplateId =
  | "enhanced"
  | "concise"
  | "standup"
  | "okr"
  | "structured";

/** 报告模板元信息 */
export interface ReportTemplateMeta {
  id: ReportTemplateId;
  name: string;
  description: string;
}

/** 报告 */
export interface Report {
  id: string;
  date: string;
  report_type: string;
  template_id: string | null;
  content: string | null;
  word_count: number | null;
  exported_at: number | null;
  created_at: number;
}

// ==================== 搜索相关 ====================

/** 时间范围 */
export interface TimeRange {
  start: number;
  end: number;
  label: string;
}

/** 搜索过滤条件 */
export interface SearchFilter {
  tags: string[];
  entities: string[];
  project: string | null;
  time_range: TimeRange | null;
  query: string;
}

/** 全文搜索结果 */
export interface FtsResult {
  table: string;
  id: string;
  snippet: string;
  rank: number;
}

/** 搜索结果 */
export interface SearchResult {
  episodes: Episode[];
  fts_results: FtsResult[];
  filter: SearchFilter;
  total: number;
}

// ==================== 设置相关 ====================

/** 应用设置（与后端 AppSettings 对应） */
export interface AppSettings {
  ai_api_key: string;
  ai_base_url: string;
  ai_model: string;
  mascot_enabled: boolean;
  mascot_form: string;
  mascot_size: number;
  capture_interval_secs: number;
  save_screenshots: boolean;
  screenshot_retention_days: number;
  screenshot_path: string;
  ocr_engine: string;
  dnd_enabled: boolean;
  dnd_start: string;
  dnd_end: string;
  reminder_daily_report: boolean;
  reminder_weekly_report: boolean;
  reminder_greeting: boolean;
  reminder_focus_25min: boolean;
  reminder_fragmented: boolean;
  reminder_long_work: boolean;
  reminder_night_work: boolean;
}

// ==================== Mascot 相关 ====================

/** Mascot 功能状态 */
export type MascotFunctionalState =
  | "recording"
  | "paused"
  | "privacy"
  | "ocr_scanning"
  | "report_ready";

/** Mascot 情绪状态 */
export type MascotEmotionalState =
  | "happy"
  | "focused"
  | "concerned"
  | "curious"
  | "sleepy"
  | "proud"
  | "neutral";

/** Mascot 形象 */
export type MascotForm = "note" | "film" | "copilot" | "cursor" | "paper";

/** Mascot 状态 */
export interface MascotState {
  functional_state: MascotFunctionalState | string;
  emotional_state: MascotEmotionalState | string;
  form: MascotForm | string;
  size: number;
  position: [number, number];
  visible: boolean;
}

/** 气泡模式 */
export type BubbleMode = 1 | 2 | 3;

/** 气泡内容 */
export interface BubbleContent {
  message: string;
  mode: BubbleMode;
  actions?: Array<{ label: string; action: string }>;
  summary?: TodaySummary;
}

/** 今日摘要（用于气泡模式 3） */
export interface TodaySummary {
  episodes: Array<{ id: string; title: string; start_time: number }>;
  focus_seconds: number;
  episode_count: number;
}

// ==================== 隐私规则 ====================

/** 隐私规则类型 */
export type PrivacyRuleType = "app_name" | "window_title" | "url_keyword";

/** 隐私规则 */
export interface PrivacyRule {
  id: string;
  rule_type: PrivacyRuleType | string;
  pattern: string;
  enabled: boolean;
  created_at: number;
}

// ==================== OCR ====================

/** OCR 引擎状态 */
export interface OcrStatus {
  engine: string;
  available: boolean;
  language: string;
}

// ==================== 采集状态 ====================

/** 采集状态 */
export interface CaptureStatus {
  is_paused: boolean;
  in_privacy_mode: boolean;
  functional_state: MascotFunctionalState | string;
  today_switch_count: number;
}

/** 今日统计 */
export interface TodayStats {
  episode_count: number;
  focus_seconds: number;
  focus_hours: number;
  switch_count: number;
  todo_count: number;
  todo_done: number;
}

// ==================== 日历 ====================

/** 日历单日数据 */
export interface CalendarDayData {
  date: string;
  day: number;
  work_seconds: number;
  work_hours: number;
  episode_count: number;
  summary: string;
}

// ==================== 洞察 ====================

/** 洞察卡片 */
export interface InsightCard {
  id: string;
  insight_type: "focus_pattern" | "time_allocation" | "fragmented" | "milestone" | "anomaly" | string;
  title: string;
  description: string;
  detail: string | null;
}

/** 项目占比 */
export interface ProjectShare {
  project: string;
  percentage: number;
  hours: number;
}

/** 仪表盘数据 */
export interface Dashboard {
  week_hours: number[];
  month_projects: ProjectShare[];
  wiki_growth: number[];
  token_estimate: number;
}

// ==================== 图谱 ====================

/** 图谱节点 */
export interface GraphNode {
  id: string;
  label: string;
  wiki_type: string;
  size: number;
}

/** 图谱边 */
export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

/** 图谱数据 */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ==================== 数据管理 ====================

/** 数据统计 */
export interface DataStats {
  episodes: number;
  segments: number;
  wiki_pages: number;
  reports: number;
}

/** 数据导出包 */
export interface DataExport {
  episodes: Episode[];
  wiki_pages: WikiPage[];
  reports: Report[];
  exported_at: number;
}

// ==================== IPC 信封 ====================

/** 统一响应信封 */
export interface ApiResponse<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
}

// ==================== 提醒事件 ====================

/** Mascot 提醒事件 */
export interface ReminderEvent {
  type: string;
  message: string;
  timestamp: number;
}

/** OCR 完成事件 */
export interface OcrCompletedEvent {
  segment_id: string;
  text_length: number;
}

/** 待办提取事件 */
export interface TodosExtractedEvent {
  segment_id: string;
  todos: string[];
}

/** Mascot 气泡事件 */
export interface MascotShowBubbleEvent {
  message: string;
  mode: BubbleMode;
}
