// 命令面板（Ctrl+K 唤起）

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/Input";
import { cx } from "@/lib/utils";
import styles from "./CommandPalette.module.css";

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  keywords?: string;
  group?: string;
  action: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandItem[];
}

export function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();

  // 过滤
  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => {
      const text = `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""} ${c.group ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [query, commands]);

  // 分组
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    filtered.forEach((c) => {
      const g = c.group ?? "命令";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(c);
    });
    return Array.from(map.entries());
  }, [filtered]);

  // 重置选中
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // 键盘导航
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filtered[activeIndex];
        if (item) {
          item.action();
          onOpenChange(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, activeIndex, onOpenChange]);

  // 清空查询当关闭
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // 路由跳转辅助
  const go = (path: string) => navigate(path);

  // 注入路由命令
  const allCommands = useMemo(() => {
    return commands.map((c) => {
      if (c.id.startsWith("nav-")) {
        return { ...c, action: () => go(c.id.slice(4)) };
      }
      return c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands]);

  // 重新过滤含路由命令
  const filteredAll = useMemo(() => {
    if (!query.trim()) return allCommands;
    const q = query.toLowerCase();
    return allCommands.filter((c) => {
      const text = `${c.label} ${c.hint ?? ""} ${c.keywords ?? ""} ${c.group ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [query, allCommands]);

  let runningIndex = -1;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={styles.overlay} />
        <AnimatePresence>
          {open && (
            <DialogPrimitive.Content className={styles.content} asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, y: -8 }}
                transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <Input
                  autoFocus
                  placeholder="搜索命令或页面…（↑↓ 选择，回车执行）"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={styles.search}
                  icon={<SearchIcon />}
                />
                <div className={styles.list}>
                  {filteredAll.length === 0 && (
                    <div className={styles.empty}>没有匹配的命令</div>
                  )}
                  {grouped.map(([group, items]) => (
                    <div key={group} className={styles.group}>
                      <div className={styles.groupLabel}>{group}</div>
                      {items.map((item) => {
                        runningIndex += 1;
                        const idx = runningIndex;
                        const active = idx === activeIndex;
                        return (
                          <button
                            key={item.id}
                            className={cx(styles.item, active && styles.itemActive)}
                            onMouseEnter={() => setActiveIndex(idx)}
                            onClick={() => {
                              item.action();
                              onOpenChange(false);
                            }}
                          >
                            {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                            <span className={styles.itemLabel}>{item.label}</span>
                            {item.hint && <span className={styles.itemHint}>{item.hint}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          )}
        </AnimatePresence>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M9.5 9.5L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
