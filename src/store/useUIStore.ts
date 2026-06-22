// UI 状态管理：主题、命令面板、加载状态等全局 UI 状态

import { create } from "zustand";
import type { ThemeMode } from "@/styles/theme";

interface UIState {
  // 主题
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;

  // 命令面板
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;

  // 全局加载
  globalLoading: boolean;
  setGlobalLoading: (loading: boolean) => void;

  // 当前激活的导航项
  activeNav: string;
  setActiveNav: (nav: string) => void;

  // 右侧详情面板
  detailPanelOpen: boolean;
  setDetailPanelOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  theme: "light",
  toggleTheme: () => set({ theme: get().theme === "light" ? "dark" : "light" }),
  setTheme: (theme) => set({ theme }),

  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set({ commandPaletteOpen: !get().commandPaletteOpen }),

  globalLoading: false,
  setGlobalLoading: (loading) => set({ globalLoading: loading }),

  activeNav: "today",
  setActiveNav: (nav) => set({ activeNav: nav }),

  detailPanelOpen: true,
  setDetailPanelOpen: (open) => set({ detailPanelOpen: open }),
}));
