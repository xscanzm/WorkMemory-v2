// 设置状态管理：加载、保存应用设置

import { create } from "zustand";
import type { AppSettings } from "@/types";
import { defaultSettings } from "@/styles/theme";
import * as ipc from "@/lib/ipc";

interface SettingsState {
  settings: AppSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;

  load: () => Promise<void>;
  save: (settings: AppSettings) => Promise<void>;
  update: (partial: Partial<AppSettings>) => Promise<void>;
  testAi: () => Promise<string>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: { ...defaultSettings },
  loading: false,
  saving: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const settings = await ipc.settingsGet();
      set({ settings, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        loading: false,
      });
    }
  },

  save: async (settings) => {
    set({ saving: true, error: null });
    try {
      await ipc.settingsSet(settings);
      set({ settings, saving: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
        saving: false,
      });
      throw e;
    }
  },

  update: async (partial) => {
    const next = { ...get().settings, ...partial };
    await get().save(next);
  },

  testAi: async () => {
    return await ipc.settingsTestAi();
  },
}));
