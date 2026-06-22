// 下拉菜单组件，基于 Radix UI

import { type ReactNode, type ReactElement } from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cx } from "@/lib/utils";
import styles from "./Dropdown.module.css";

export interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}

export function Dropdown({ trigger, children, align = "end", side = "bottom", className }: DropdownProps) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          side={side}
          sideOffset={4}
          className={cx(styles.content, className)}
        >
          {children}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export function DropdownItem({
  children,
  onSelect,
  disabled,
  danger,
  icon,
  className,
}: {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <DropdownMenuPrimitive.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cx(styles.item, danger && styles.danger, className)}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <span className={styles.label}>{children}</span>
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownSeparator() {
  return <DropdownMenuPrimitive.Separator className={styles.separator} />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <DropdownMenuPrimitive.Label className={styles.label}>{children}</DropdownMenuPrimitive.Label>;
}

// 让 Trigger 可作为子元素
export function DropdownTrigger({ children }: { children: ReactElement }) {
  return <DropdownMenuPrimitive.Trigger asChild>{children}</DropdownMenuPrimitive.Trigger>;
}
