// 标签页组件，基于 Radix UI

import { type ReactNode } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cx } from "@/lib/utils";
import styles from "./Tabs.module.css";

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={cx(styles.root, className)}>
      {children}
    </TabsPrimitive.Root>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <TabsPrimitive.List className={cx(styles.list, className)}>{children}</TabsPrimitive.List>;
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Trigger value={value} className={cx(styles.trigger, className)}>
      {children}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsPrimitive.Content value={value} className={cx(styles.content, className)}>
      {children}
    </TabsPrimitive.Content>
  );
}
