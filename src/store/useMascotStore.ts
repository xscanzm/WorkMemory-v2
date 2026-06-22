// Mascot 状态管理：桌面伙伴状态、位置、气泡

import { create } from "zustand";
import type { MascotState, BubbleContent, MascotForm } from "@/types";
import * as ipc from "@/lib/ipc";

interface MascotStoreState {
  state: MascotState | null;
  bubble: BubbleContent | null;
  dragging: boolean;
  firstLaunch: boolean;
  guideStep: number; // 0-4，0 表示未开始引导，4 表示完成

  loadState: () => Promise<void>;
  setForm: (form: MascotForm) => Promise<void>;
  setPosition: (x: number, y: number) => Promise<void>;
  showBubble: (bubble: BubbleContent) => void;
  hideBubble: () => void;
  setDragging: (dragging: boolean) => void;
  setFirstLaunch: (first: boolean) => void;
  setGuideStep: (step: number) => void;
  hideTemporarily: (minutes: number) => Promise<void>;
}

export const useMascotStore = create<MascotStoreState>((set, get) => ({
  state: null,
  bubble: null,
  dragging: false,
  firstLaunch: false,
  guideStep: 0,

  loadState: async () => {
    try {
      const state = await ipc.mascotGetState();
      set({ state });
    } catch (e) {
      console.error("加载 Mascot 状态失败:", e);
    }
  },

  setForm: async (form) => {
    try {
      await ipc.mascotSetForm(form);
      const state = get().state;
      if (state) {
        set({ state: { ...state, form } });
      }
    } catch (e) {
      console.error("设置形象失败:", e);
    }
  },

  setPosition: async (x, y) => {
    try {
      await ipc.mascotSetPosition(x, y);
      const state = get().state;
      if (state) {
        set({ state: { ...state, position: [x, y] } });
      }
    } catch (e) {
      console.error("设置位置失败:", e);
    }
  },

  showBubble: (bubble) => set({ bubble }),
  hideBubble: () => set({ bubble: null }),
  setDragging: (dragging) => set({ dragging }),
  setFirstLaunch: (first) => set({ firstLaunch: first }),
  setGuideStep: (step) => set({ guideStep: step }),

  hideTemporarily: async (minutes) => {
    try {
      await ipc.mascotHideTemporarily(minutes);
      const state = get().state;
      if (state) {
        set({ state: { ...state, visible: false } });
      }
    } catch (e) {
      console.error("隐藏 Mascot 失败:", e);
    }
  },
}));
