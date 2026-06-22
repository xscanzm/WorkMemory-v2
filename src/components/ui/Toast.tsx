// Toast 通知组件，基于 Radix UI

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { motion, AnimatePresence } from "framer-motion";
import { cx } from "@/lib/utils";
import styles from "./Toast.module.css";

export type ToastVariant = "default" | "success" | "warning" | "danger" | "info";

export interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toast: (item: Omit<ToastItem, "id">) => void;
  success: (description: string, title?: string) => void;
  error: (description: string, title?: string) => void;
  warning: (description: string, title?: string) => void;
  info: (description: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantIcon: Record<ToastVariant, string> = {
  default: "💬",
  success: "✅",
  warning: "⚠️",
  danger: "❌",
  info: "ℹ️",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (item: Omit<ToastItem, "id">) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { ...item, id }]);
    },
    []
  );

  const success = useCallback(
    (description: string, title?: string) => toast({ description, title, variant: "success" }),
    [toast]
  );
  const error = useCallback(
    (description: string, title?: string) => toast({ description, title, variant: "danger", duration: 5000 }),
    [toast]
  );
  const warning = useCallback(
    (description: string, title?: string) => toast({ description, title, variant: "warning" }),
    [toast]
  );
  const info = useCallback(
    (description: string, title?: string) => toast({ description, title, variant: "info" }),
    [toast]
  );

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={3000}>
        {children}
        <AnimatePresence>
          {toasts.map((t) => (
            <ToastPrimitive.Root
              key={t.id}
              duration={t.duration ?? 3000}
              onOpenChange={(open) => {
                if (!open) remove(t.id);
              }}
              className={cx(styles.root, styles[t.variant ?? "default"])}
              asChild
            >
              <motion.div
                initial={{ opacity: 0, x: 40, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.95 }}
                transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
              >
                <span className={styles.icon}>{variantIcon[t.variant ?? "default"]}</span>
                <div className={styles.body}>
                  {t.title && <ToastPrimitive.Title className={styles.title}>{t.title}</ToastPrimitive.Title>}
                  {t.description && (
                    <ToastPrimitive.Description className={styles.description}>
                      {t.description}
                    </ToastPrimitive.Description>
                  )}
                </div>
              </motion.div>
            </ToastPrimitive.Root>
          ))}
        </AnimatePresence>
        <ToastPrimitive.Viewport className={styles.viewport} />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx;
}
