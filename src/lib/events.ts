// Tauri event 监听封装
// 统一管理后端事件订阅，提供类型安全的事件监听接口

import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  BubbleContent,
  MascotShowBubbleEvent,
  MascotState,
  OcrCompletedEvent,
  ReminderEvent,
  TodosExtractedEvent,
} from "@/types";

// ==================== 事件名常量 ====================

export const EVENT_NAMES = {
  mascotStateChange: "mascot-state-change",
  mascotReminder: "mascot-reminder",
  mascotShowBubble: "mascot-show-bubble",
  captureTick: "capture-tick",
  ocrCompleted: "ocr-completed",
  todosExtracted: "todos-extracted",
  reportToken: "report-token",
  reportCompleted: "report-completed",
} as const;

// ==================== 事件监听封装 ====================

/**
 * 订阅 Mascot 状态变化事件
 */
export function onMascotStateChange(handler: (state: MascotState) => void): Promise<UnlistenFn> {
  return listen<MascotState>(EVENT_NAMES.mascotStateChange, (e) => handler(e.payload));
}

/**
 * 订阅 Mascot 提醒事件
 */
export function onMascotReminder(handler: (reminder: ReminderEvent) => void): Promise<UnlistenFn> {
  return listen<ReminderEvent>(EVENT_NAMES.mascotReminder, (e) => handler(e.payload));
}

/**
 * 订阅 Mascot 气泡显示事件
 */
export function onMascotShowBubble(
  handler: (bubble: MascotShowBubbleEvent) => void
): Promise<UnlistenFn> {
  return listen<MascotShowBubbleEvent>(EVENT_NAMES.mascotShowBubble, (e) => handler(e.payload));
}

/**
 * 订阅采集 tick 事件（每次截图触发）
 */
export function onCaptureTick(handler: (payload: unknown) => void): Promise<UnlistenFn> {
  return listen(EVENT_NAMES.captureTick, (e) => handler(e.payload));
}

/**
 * 订阅 OCR 完成事件
 */
export function onOcrCompleted(
  handler: (event: OcrCompletedEvent) => void
): Promise<UnlistenFn> {
  return listen<OcrCompletedEvent>(EVENT_NAMES.ocrCompleted, (e) => handler(e.payload));
}

/**
 * 订阅待办提取事件
 */
export function onTodosExtracted(
  handler: (event: TodosExtractedEvent) => void
): Promise<UnlistenFn> {
  return listen<TodosExtractedEvent>(EVENT_NAMES.todosExtracted, (e) => handler(e.payload));
}

/**
 * 订阅报告 token 流式事件
 */
export function onReportToken(handler: (token: string) => void): Promise<UnlistenFn> {
  return listen<string>(EVENT_NAMES.reportToken, (e) => handler(e.payload));
}

/**
 * 订阅报告完成事件
 */
export function onReportCompleted(handler: (report: unknown) => void): Promise<UnlistenFn> {
  return listen(EVENT_NAMES.reportCompleted, (e) => handler(e.payload));
}

// ==================== 通用监听工具 ====================

/**
 * 批量订阅事件，返回统一取消函数
 */
export async function subscribeAll(
  subscriptions: Array<Promise<UnlistenFn>>
): Promise<UnlistenFn> {
  const unlisteners = await Promise.all(subscriptions);
  return () => {
    unlisteners.forEach((un) => un());
  };
}

/**
 * 把 BubbleContent 转换为可显示的提醒
 */
export function asBubbleContent(payload: MascotShowBubbleEvent): BubbleContent {
  return {
    message: payload.message,
    mode: payload.mode,
  };
}
