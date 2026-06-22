// 角标组件

import { type ReactNode } from "react";
import { cx } from "@/lib/utils";
import styles from "./Badge.module.css";

export type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "info";

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  count?: number;
  dot?: boolean;
  max?: number;
  className?: string;
}

const variantMap: Record<BadgeVariant, string> = {
  default: styles.default,
  primary: styles.primary,
  success: styles.success,
  warning: styles.warning,
  danger: styles.danger,
  info: styles.info,
};

export function Badge({
  children,
  variant = "default",
  count,
  dot,
  max = 99,
  className,
}: BadgeProps) {
  // 数字角标
  if (count !== undefined) {
    if (count <= 0 && !dot) return null;
    const display = dot ? null : count > max ? `${max}+` : count;
    return (
      <span className={cx(styles.countBadge, variantMap[variant], className)}>
        {display}
      </span>
    );
  }

  return (
    <span className={cx(styles.badge, variantMap[variant], className)}>
      {children}
    </span>
  );
}
