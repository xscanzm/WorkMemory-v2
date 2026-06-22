// Episode 状态管理：今日事件、选中事件、加载状态

import { create } from "zustand";
import type { Episode, TodayStats, CaptureStatus } from "@/types";
import * as ipc from "@/lib/ipc";
import { todayStr } from "@/lib/utils";

interface EpisodeState {
  // 数据
  episodes: Episode[];
  selectedEpisode: Episode | null;
  todayStats: TodayStats | null;
  captureStatus: CaptureStatus | null;

  // 加载状态
  loading: boolean;
  error: string | null;

  // 视图模式
  viewMode: "timeline" | "list";

  // 操作
  loadTodayEpisodes: () => Promise<void>;
  loadTodayStats: () => Promise<void>;
  loadCaptureStatus: () => Promise<void>;
  selectEpisode: (episode: Episode | null) => void;
  setViewMode: (mode: "timeline" | "list") => void;
  updateEpisode: (episode: Episode) => void;
  removeEpisode: (id: string) => void;
  toggleImportant: (id: string, important: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useEpisodeStore = create<EpisodeState>((set, get) => ({
  episodes: [],
  selectedEpisode: null,
  todayStats: null,
  captureStatus: null,

  loading: false,
  error: null,

  viewMode: "timeline",

  loadTodayEpisodes: async () => {
    set({ loading: true, error: null });
    try {
      const episodes = await ipc.episodeList(todayStr());
      set({ episodes, loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },

  loadTodayStats: async () => {
    try {
      const stats = await ipc.captureGetTodayStats();
      set({ todayStats: stats });
    } catch (e) {
      console.error("加载今日统计失败:", e);
    }
  },

  loadCaptureStatus: async () => {
    try {
      const status = await ipc.captureStatus();
      set({ captureStatus: status });
    } catch (e) {
      console.error("加载采集状态失败:", e);
    }
  },

  selectEpisode: (episode) => set({ selectedEpisode: episode }),

  setViewMode: (mode) => set({ viewMode: mode }),

  updateEpisode: (episode) => {
    const episodes = get().episodes.map((e) => (e.id === episode.id ? episode : e));
    set({ episodes, selectedEpisode: episode });
  },

  removeEpisode: (id) => {
    const episodes = get().episodes.filter((e) => e.id !== id);
    const selected = get().selectedEpisode;
    set({
      episodes,
      selectedEpisode: selected?.id === id ? null : selected,
    });
  },

  toggleImportant: async (id, important) => {
    try {
      await ipc.episodeMarkImportant(id, important);
      const episodes = get().episodes.map((e) =>
        e.id === id ? { ...e, important: important ? 1 : 0 } : e
      );
      const selected = get().selectedEpisode;
      set({
        episodes,
        selectedEpisode:
          selected?.id === id ? { ...selected, important: important ? 1 : 0 } : selected,
      });
    } catch (e) {
      console.error("标记重要失败:", e);
    }
  },

  refresh: async () => {
    await Promise.all([get().loadTodayEpisodes(), get().loadTodayStats()]);
  },
}));
