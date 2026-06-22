// 主窗口三栏布局：左侧导航 + 中间内容 + 右侧详情

import { type ReactNode, useEffect, useMemo } from "react";
import { Sidebar, type NavItem } from "./Sidebar";
import { CommandPalette, type CommandItem } from "./CommandPalette";
import { useUIStore } from "@/store/useUIStore";
import { useNavigate } from "react-router-dom";
import styles from "./MainLayout.module.css";

export interface MainLayoutProps {
  children: ReactNode;
  detail?: ReactNode;
  navItems: NavItem[];
  commands?: CommandItem[];
  /** 是否显示右侧详情面板 */
  showDetail?: boolean;
}

export function MainLayout({ children, detail, navItems, commands = [], showDetail = true }: MainLayoutProps) {
  const theme = useUIStore((s) => s.theme);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const openCommandPalette = useUIStore((s) => s.openCommandPalette);
  const closeCommandPalette = useUIStore((s) => s.closeCommandPalette);
  const detailPanelOpen = useUIStore((s) => s.detailPanelOpen);
  const navigate = useNavigate();

  // 应用主题类到 body
  useEffect(() => {
    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(`theme-${theme}`);
  }, [theme]);

  // Ctrl+K / Cmd+K 唤起命令面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (commandPaletteOpen) {
          closeCommandPalette();
        } else {
          openCommandPalette();
        }
      } else if (e.key === "Escape" && commandPaletteOpen) {
        closeCommandPalette();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commandPaletteOpen, openCommandPalette, closeCommandPalette]);

  // 默认命令：导航
  const allCommands = useMemo<CommandItem[]>(() => {
    const navCommands: CommandItem[] = navItems.map((item) => ({
      id: `nav-${item.path}`,
      label: item.label,
      hint: "跳转",
      icon: item.icon,
      group: "导航",
      action: () => navigate(item.path),
    }));
    return [...navCommands, ...commands];
  }, [navItems, commands, navigate]);

  return (
    <div className={styles.layout}>
      <Sidebar items={navItems} />
      <main className={styles.main}>{children}</main>
      {showDetail && detailPanelOpen && detail && (
        <aside className={styles.detail}>
          {detail}
        </aside>
      )}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={(o) => (o ? openCommandPalette() : closeCommandPalette())}
        commands={allCommands}
      />
    </div>
  );
}
