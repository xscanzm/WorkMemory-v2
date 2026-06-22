// 空状态组件：插图 emoji + 引导文字 + 可选按钮

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Button, type ButtonProps } from "./Button";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  /** 插图 emoji */
  illustration?: string;
  /** 标题 */
  title: string;
  /** 描述文字 */
  description?: string;
  /** 按钮文字 */
  actionText?: string;
  /** 按钮点击 */
  onAction?: () => void;
  /** 按钮变体 */
  actionVariant?: ButtonProps["variant"];
  /** 自定义底部内容 */
  footer?: ReactNode;
  /** 尺寸 */
  size?: "sm" | "md" | "lg";
}

export function EmptyState({
  illustration = "📭",
  title,
  description,
  actionText,
  onAction,
  actionVariant = "primary",
  footer,
  size = "md",
}: EmptyStateProps) {
  return (
    <motion.div
      className={styles.container}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      <div className={`${styles.illustration} ${styles[size]}`}>
        <span role="img" aria-hidden>
          {illustration}
        </span>
      </div>
      <h3 className={`${styles.title} ${styles[`${size}Title`]}`}>{title}</h3>
      {description && <p className={styles.description}>{description}</p>}
      {actionText && onAction && (
        <Button variant={actionVariant} onClick={onAction} className={styles.action}>
          {actionText}
        </Button>
      )}
      {footer && <div className={styles.footer}>{footer}</div>}
    </motion.div>
  );
}
