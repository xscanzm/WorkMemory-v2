// 输入框组件：高度 40px，focus 变主色，圆角 8px

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/lib/utils";
import styles from "./Input.module.css";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  icon?: ReactNode;
  iconRight?: ReactNode;
  error?: boolean;
  size?: "sm" | "md" | "lg";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, iconRight, error, className, size = "md", ...rest },
  ref
) {
  return (
    <div
      className={cx(
        styles.wrapper,
        styles[size],
        error && styles.error,
        className
      )}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <input ref={ref} className={styles.input} {...rest} />
      {iconRight && <span className={styles.iconRight}>{iconRight}</span>}
    </div>
  );
});
