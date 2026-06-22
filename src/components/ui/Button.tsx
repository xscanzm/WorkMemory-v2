// 按钮组件：主/次/危险/幽灵，高度 36/40/44px

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cx } from "@/lib/utils";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends Omit<HTMLMotionProps<"button">, "ref"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  children?: ReactNode;
}

const sizeMap: Record<ButtonSize, string> = {
  sm: styles.sm, // 32px
  md: styles.md, // 40px
  lg: styles.lg, // 44px
};

const variantMap: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  danger: styles.danger,
  ghost: styles.ghost,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    iconRight,
    fullWidth = false,
    disabled,
    className,
    children,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;
  return (
    <motion.button
      ref={ref}
      className={cx(styles.button, sizeMap[size], variantMap[variant], fullWidth && styles.fullWidth, className)}
      disabled={isDisabled}
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden />}
      {!loading && icon && <span className={styles.icon}>{icon}</span>}
      {children && <span className={styles.label}>{children}</span>}
      {!loading && iconRight && <span className={styles.icon}>{iconRight}</span>}
    </motion.button>
  );
});
