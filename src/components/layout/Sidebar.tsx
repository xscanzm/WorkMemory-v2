// 左侧导航栏：图标导航

import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { cx } from "@/lib/utils";
import styles from "./Sidebar.module.css";

export interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  path: string;
  badge?: number;
}

export interface SidebarProps {
  items: NavItem[];
  footer?: ReactNode;
  collapsed?: boolean;
}

export function Sidebar({ items, footer }: SidebarProps) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.logo}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect x="2" y="3" width="16" height="14" rx="3" fill="var(--color-primary)" />
            <path d="M6 8H14M6 11H10" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <span className={styles.brandName}>WorkMemory</span>
      </div>

      <nav className={styles.nav}>
        {items.map((item) => (
          <NavLink key={item.key} to={item.path} className={styles.navLink}>
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.span
                    layoutId="nav-active"
                    className={styles.activeIndicator}
                    transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
                  />
                )}
                <span className={cx(styles.navIcon, isActive && styles.navIconActive)}>
                  {item.icon}
                </span>
                <span className={cx(styles.navLabel, isActive && styles.navLabelActive)}>
                  {item.label}
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className={styles.navBadge}>{item.badge}</span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {footer && <div className={styles.footer}>{footer}</div>}
    </aside>
  );
}
