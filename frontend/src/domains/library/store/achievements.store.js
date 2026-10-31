import { create } from "zustand";
import { getMyAchievementsApi } from "../api/achievements.api.js";
import { useAuthStore } from "../../auth/store/auth.store.js";

const initialState = {
  status: "idle", // idle | loading | success | error
  achievements: null, // [{ id, current, threshold, achieved }, ...] — 조회 전용(A-09), 지급하지 않는다.
  error: null,
};

export const useAchievementsStore = create((set, get) => ({
  ...initialState,
  requestGeneration: 0,
  requestToken: null,

  fetchAchievements: async () => {
    const generation = get().requestGeneration;
    const token = Symbol("achievements");
    set({ status: "loading", error: null, requestToken: token });
    try {
      const achievements = await getMyAchievementsApi();
      if (get().requestGeneration !== generation || get().requestToken !== token) return { outcome: "stale" };
      set({ status: "success", achievements, error: null });
      return { outcome: "success" };
    } catch (error) {
      if (get().requestGeneration !== generation || get().requestToken !== token) return { outcome: "stale" };
      set({ status: "error", error: error.message ?? "업적 정보를 불러오지 못했습니다." });
      return { outcome: "error" };
    }
  },

  retry: () => get().fetchAchievements(),

  reset: () => set((state) => ({ ...initialState, requestToken: null, requestGeneration: state.requestGeneration + 1 })),
}));

useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null;
  const prevUserId = prevState?.user?.uuid ?? null;
  if (nextUserId !== prevUserId) {
    useAchievementsStore.getState().reset();
  }
});
