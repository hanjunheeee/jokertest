// 내 업적 목록 스토어 (불러오는 중·성공·실패, 늦게 온 답 버리기)
// hooks/useAchievements.js와 shared/ui/ProtectedRoute.jsx(계정 캐시 새로 받기)가 씀
import { create } from "zustand";
import { getMyAchievementsApi } from "../api/achievements.api.js";
import { useAuthStore } from "../../auth/store/auth.store.js";

// 처음 상태 (초기화 때도 이 값)
const initialState = {
  status: "idle",
  achievements: null,
  error: null,
};

// generation은 초기화마다 늘고, token은 요청마다 새로 만듦
export const useAchievementsStore = create((set, get) => ({
  ...initialState,
  requestGeneration: 0,
  requestToken: null,

  // 받기: 그사이 초기화·새 요청이 있었으면 결과 버림(stale)
  fetchAchievements: async () => {
    const generation = get().requestGeneration;
    const token = Symbol("achievements");
    set({ status: "loading", error: null, requestToken: token });
    try {
      const achievements = await getMyAchievementsApi();
      // 그사이 초기화됐거나 더 새 요청이 있으면 버림
      if (get().requestGeneration !== generation || get().requestToken !== token) return { outcome: "stale" };
      set({ status: "success", achievements, error: null });
      return { outcome: "success" };
    } catch (error) {
      // 실패도 같은 기준으로 버림, 아니면 오류 문구 남김
      if (get().requestGeneration !== generation || get().requestToken !== token) return { outcome: "stale" };
      set({ status: "error", error: error.message ?? "업적 정보를 불러오지 못했습니다." });
      return { outcome: "error" };
    }
  },

  // 다시 시도는 그냥 새로 받기
  retry: () => get().fetchAchievements(),

  // 처음 상태로, generation 올려 진행 중 결과 버리고 화면이 다시 받게 함
  reset: () => set((state) => ({ ...initialState, requestToken: null, requestGeneration: state.requestGeneration + 1 })),
}));

// 로그인 계정이 바뀌면 다른 계정 업적이 안 남게 비움
useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null;
  const prevUserId = prevState?.user?.uuid ?? null;
  if (nextUserId !== prevUserId) {
    useAchievementsStore.getState().reset();
  }
});
