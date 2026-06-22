// 卡片组件：白色 + 1px Border + 圆角 12px + 悬停 translateY(-2px)

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cx } from "@/lib/utils";
import styles from "./Card.module.css";

export interface CardProps extends Omit<HTMLMotionProps<"div">, "ref"> {
  hoverable?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  children?: ReactNode;
}

const paddingMap: Record<NonNullable<CardProps["padding"]>, string> = {
  none: styles.none,
  sm: styles.padSm,
  md: styles.padMd,
  lg: styles.padLg,
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { hoverable = false, padding = "md", className, children, ...rest },
  ref
) {
  return (
    <motion.div
      ref={ref}
      className={cx(styles.card, paddingMap[padding], hoverable && styles.hoverable, className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

/** 卡片头部 */
export function CardHeader({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx(styles.header, className)} {...rest}>
      {children}
    </div>
  );
}

/** 卡片标题 */
export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cx(styles.title, className)} {...rest}>
      {children}
    </h3>
  );
}

/** 卡片描述 */
export function CardDescription({ className, children, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cx(styles.description, className)} {...rest}>
      {children}
    </p>
  );
}

/** 卡片内容 */
export function CardContent({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx(styles.content, className)} {...rest}>
      {children}
    </div>
  );
}

/** 卡片底部 */
export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx(styles.footer, className)} {...rest}>
      {children}
    </div>
  );
}
