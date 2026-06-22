// 前端核心工具函数单元测试
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatDuration,
  formatDurationShort,
  secondsToHours,
  parseJson,
  parseEntities,
  parseTopics,
  truncate,
  splitByKeyword,
  hexToRgba,
  heatColor,
  cx,
  debounce,
  throttle,
  genId,
} from "../utils";

describe("时长格式化", () => {
  it("formatDuration 秒", () => {
    expect(formatDuration(30)).toBe("30秒");
  });

  it("formatDuration 分钟", () => {
    expect(formatDuration(120)).toBe("2分钟");
  });

  it("formatDuration 小时", () => {
    expect(formatDuration(3600)).toBe("1小时");
  });

  it("formatDuration 小时+分钟", () => {
    expect(formatDuration(5400)).toBe("1小时30分钟");
  });

  it("formatDurationShort 紧凑格式", () => {
    expect(formatDurationShort(30)).toBe("30s");
    expect(formatDurationShort(120)).toBe("2m");
    expect(formatDurationShort(3600)).toBe("1h");
    expect(formatDurationShort(5400)).toBe("1h30m");
  });

  it("secondsToHours 保留 1 位小数", () => {
    expect(secondsToHours(3600)).toBe(1);
    expect(secondsToHours(5400)).toBe(1.5);
    expect(secondsToHours(1800)).toBe(0.5);
  });
});

describe("JSON 解析", () => {
  it("parseJson 合法 JSON", () => {
    expect(parseJson('[1,2,3]', [])).toEqual([1, 2, 3]);
  });

  it("parseJson 非法 JSON 返回默认值", () => {
    expect(parseJson("invalid", "default")).toBe("default");
  });

  it("parseJson null/undefined 返回默认值", () => {
    expect(parseJson(null, "def")).toBe("def");
    expect(parseJson(undefined, "def")).toBe("def");
  });

  it("parseEntities", () => {
    expect(parseEntities('[{"name":"张三","entity_type":"person"}]')).toEqual([
      { name: "张三", entity_type: "person" },
    ]);
    expect(parseEntities(null)).toEqual([]);
  });

  it("parseTopics", () => {
    expect(parseTopics('["编码","测试"]')).toEqual(["编码", "测试"]);
    expect(parseTopics("invalid")).toEqual([]);
  });
});

describe("字符串工具", () => {
  it("truncate 不超长", () => {
    expect(truncate("abc", 5)).toBe("abc");
  });

  it("truncate 超长加省略号", () => {
    expect(truncate("abcdefg", 3)).toBe("abc…");
  });

  it("splitByKeyword 高亮关键词", () => {
    const parts = splitByKeyword("修复登录bug", "登录");
    expect(parts).toHaveLength(3);
    expect(parts[1]).toEqual({ text: "登录", highlight: true });
  });

  it("splitByKeyword 空关键词", () => {
    const parts = splitByKeyword("text", "");
    expect(parts).toEqual([{ text: "text", highlight: false }]);
  });

  it("splitByKeyword 大小写不敏感", () => {
    const parts = splitByKeyword("Hello World", "world");
    expect(parts.some((p) => p.highlight)).toBe(true);
  });
});

describe("颜色工具", () => {
  it("hexToRgba 默认不透明", () => {
    expect(hexToRgba("#5B6AF0")).toBe("rgba(91, 106, 240, 1)");
  });

  it("hexToRgba 带透明度", () => {
    expect(hexToRgba("#5B6AF0", 0.5)).toBe("rgba(91, 106, 240, 0.5)");
  });

  it("heatColor 强度 0", () => {
    expect(heatColor(0)).toContain("0.15");
  });

  it("heatColor 强度 1", () => {
    expect(heatColor(1)).toContain("1)");
  });

  it("heatColor 超出范围被 clamp", () => {
    expect(heatColor(-1)).toContain("0.15");
    expect(heatColor(2)).toContain("1)");
  });
});

describe("类名合并", () => {
  it("cx 过滤 falsy", () => {
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
  });

  it("cx 全 falsy", () => {
    expect(cx(false, null, undefined)).toBe("");
  });
});

describe("防抖与节流", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounce 延迟执行", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced();
    expect(fn).not.toBeCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toBeCalledTimes(1);
  });

  it("debounce 多次调用只执行最后一次", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(300);
    expect(fn).toBeCalledTimes(1);
  });

  it("throttle 首次立即执行", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 300);
    throttled();
    expect(fn).toBeCalledTimes(1);
  });

  it("throttle 间隔内不重复执行", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 300);
    throttled();
    throttled();
    throttled();
    expect(fn).toBeCalledTimes(1);
  });
});

describe("随机 ID", () => {
  it("genId 返回非空字符串", () => {
    const id = genId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("genId 唯一性", () => {
    const ids = new Set(Array.from({ length: 100 }, () => genId()));
    expect(ids.size).toBe(100);
  });
});
