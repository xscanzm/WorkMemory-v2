// 骨架屏组件

import { cx } from "@/lib/utils";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "full";
  className?: string;
}

const roundedMap: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  sm: styles.rSm,
  md: styles.rMd,
  lg: styles.rLg,
  full: styles.rFull,
};

export function Skeleton({ width, height, rounded = "sm", className }: SkeletonProps) {
  return (
    <div
      className={cx(styles.skeleton, roundedMap[rounded], className)}
      style={{ width, height }}
    />
  );
}

/** 多行文本骨架 */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx(styles.textContainer, className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={12}
          width={i === lines - 1 ? "60%" : "100%"}
          className={styles.line}
        />
      ))}
    </div>
  );
}

/** 卡片骨架 */
export function SkeletonCard() {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <Skeleton rounded="full" width={32} height={32} />
        <div className={styles.cardHeaderText}>
          <Skeleton height={12} width="40%" />
          <Skeleton height={10} width="60%" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}
