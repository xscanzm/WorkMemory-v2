// 工具函数集合
// 时间格式化、JSON 解析、防抖、节流等

import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

// ==================== 时间格式化 ====================

/** 格式化为「刚刚 / x 分钟前 / x 小时前 / x 天前」 */
export function fromNow(timestamp: number): string {
  return dayjs.unix(timestamp).fromNow();
}

/** 格式化为 HH:mm */
export function formatTime(timestamp: number): string {
  return dayjs.unix(timestamp).format("HH:mm");
}

/** 格式化为 HH:mm:ss */
export function formatTimeWithSeconds(timestamp: number): string {
  return dayjs.unix(timestamp).format("HH:mm:ss");
}

/** 格式化为 YYYY-MM-DD */
export function formatDate(timestamp: number): string {
  return dayjs.unix(timestamp).format("YYYY-MM-DD");
}

/** 格式化为 MM-DD */
export function formatDateShort(timestamp: number): string {
  return dayjs.unix(timestamp).format("MM-DD");
}

/** 格式化为 YYYY年MM月DD日 */
export function formatDateChinese(timestamp: number): string {
  return dayjs.unix(timestamp).format("YYYY年MM月DD日");
}

/** 格式化为 MM月DD日 HH:mm */
export function formatDateTime(timestamp: number): string {
  return dayjs.unix(timestamp).format("MM月DD日 HH:mm");
}

/** 格式化为 YYYY-MM-DD HH:mm */
export function formatFullDateTime(timestamp: number): string {
  return dayjs.unix(timestamp).format("YYYY-MM-DD HH:mm");
}

/** 获取今天的日期字符串 YYYY-MM-DD */
export function todayStr(): string {
  return dayjs().format("YYYY-MM-DD");
}

/** 获取当前时间戳（秒） */
export function nowTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

// ==================== 时长格式化 ====================

/** 把秒数格式化为「x小时x分钟」或「x分钟」 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (remainMinutes === 0) return `${hours}小时`;
  return `${hours}小时${remainMinutes}分钟`;
}

/** 把秒数格式化为紧凑形式「1h30m」或「30m」或「45s」 */
export function formatDurationShort(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  if (remainMinutes === 0) return `${hours}h`;
  return `${hours}h${remainMinutes}m`;
}

/** 把秒数格式化为小时数（保留 1 位小数） */
export function secondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 10) / 10;
}

// ==================== JSON 解析 ====================

/** 安全解析 JSON 字符串，失败返回默认值 */
export function parseJson<T>(json: string | null | undefined, defaultValue: T): T {
  if (!json) return defaultValue;
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

/** 解析 Episode 的 entities_json */
export function parseEntities(json: string | null | undefined) {
  return parseJson(json, [] as Array<{ name: string; entity_type: string }>);
}

/** 解析 Episode 的 topics_json */
export function parseTopics(json: string | null | undefined): string[] {
  return parseJson(json, [] as string[]);
}

/** 解析 Episode 的 todos_json */
export function parseTodos(json: string | null | undefined): string[] {
  return parseJson(json, [] as string[]);
}

/** 解析 Episode 的 blockers_json */
export function parseBlockers(json: string | null | undefined): string[] {
  return parseJson(json, [] as string[]);
}

/** 解析 Episode 的 segment_ids_json */
export function parseSegmentIds(json: string | null | undefined): string[] {
  return parseJson(json, [] as string[]);
}

/** 解析 WikiPage 的 backlinks_json */
export function parseBacklinks(json: string | null | undefined): string[] {
  return parseJson(json, [] as string[]);
}

// ==================== 防抖与节流 ====================

/** 防抖函数 */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** 节流函数 */
export function throttle<T extends (...args: never[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = delay - (now - lastCall);
    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      lastCall = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        lastCall = Date.now();
        timer = null;
        fn(...args);
      }, remaining);
    }
  };
}

// ==================== 字符串工具 ====================

/** 截断字符串并加省略号 */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}

/** 高亮关键词（返回 React 可用的片段数组） */
export function splitByKeyword(text: string, keyword: string): Array<{ text: string; highlight: boolean }> {
  if (!keyword.trim()) return [{ text, highlight: false }];
  const parts: Array<{ text: string; highlight: boolean }> = [];
  const lowerText = text.toLowerCase();
  const lowerKw = keyword.toLowerCase();
  let lastIndex = 0;
  let idx = lowerText.indexOf(lowerKw);
  while (idx !== -1) {
    if (idx > lastIndex) {
      parts.push({ text: text.slice(lastIndex, idx), highlight: false });
    }
    parts.push({ text: text.slice(idx, idx + keyword.length), highlight: true });
    lastIndex = idx + keyword.length;
    idx = lowerText.indexOf(lowerKw, lastIndex);
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }
  return parts;
}

// ==================== 颜色工具 ====================

/** 把 hex 颜色转为 rgba */
export function hexToRgba(hex: string, alpha: number = 1): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 根据工作时长计算热力图颜色深浅（0-1） */
export function heatColor(intensity: number): string {
  // 从浅蓝到深蓝
  const clamped = Math.max(0, Math.min(1, intensity));
  const alpha = 0.15 + clamped * 0.85;
  return hexToRgba("#5B6AF0", alpha);
}

// ==================== 文件下载 ====================

/** 触发浏览器下载文本文件 */
export function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 触发浏览器下载二进制文件 */
export function downloadBytes(filename: string, bytes: number[] | Uint8Array, mime: string) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const buffer = arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength) as ArrayBuffer;
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ==================== 剪贴板 ====================

/** 复制文本到剪贴板 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 回退方案
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      return true;
    } catch {
      return false;
    }
  }
}

// ==================== 类名合并 ====================

/** 简单的 className 合并（过滤 falsy 值） */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

// ==================== 随机 ID ====================

/** 生成简单随机 ID（前端临时使用） */
export function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
