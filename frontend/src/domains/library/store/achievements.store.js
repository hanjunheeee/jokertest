// F-12: 서고 "금지된 기록"·"초대받은 자들"이 함께 읽는 22개 업적 진행률·달성 상태.
// A-08: economy.store.js/roleStatistics.store.js와 같은 계약 — 계정 전환/로그아웃 뒤
// 도착한 이전 계정의 응답이 화면을 덮어쓰지 않도록 requestGeneration을 둔다.
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
  // CODEX-2 재검토(AC-06): useAchievements가 이제 재진입(재마운트)마다 다시 조회해 새로
  // 지급된 업적을 반영하므로(더 이상 "세대당 한 번"에 머물지 않는다), 같은 세대 안에서
  // 겹치는 여러 fetchAchievements 호출 중 가장 나중에 "시작된" 호출의 응답만 반영해야
  // 한다 — roleStatistics.store.js의 requestTokens와 같은 이유(A-08 원칙을 세대 경계
  // 안에서도 지킨다).
  requestToken: null,

  /** 22개 업적의 진행률·달성 상태를 서버에서 다시 읽어온다. */
  fetchAchievements: async () => {
    const generation = get().requestGeneration;
    const token = Symbol("achievements");
    set({ status: "loading", error: null, requestToken: token });
    try {
      const achievements = await getMyAchievementsApi();
      // 응답이 도착하기 전에 로그아웃했거나 다른 계정으로 전환됐거나, 더 나중에 시작된
      // fetchAchievements 호출이 있었다면 더 이상 "지금 이 화면"의 응답이 아니다 — 조용히
      // 버린다(A-08).
      if (get().requestGeneration !== generation || get().requestToken !== token) return;
      set({ status: "success", achievements, error: null });
    } catch (error) {
      if (get().requestGeneration !== generation || get().requestToken !== token) return;
      set({ status: "error", error: error.message ?? "업적 정보를 불러오지 못했습니다." });
    }
  },

  /** 마지막 실패를 그대로 다시 시도한다. */
  retry: () => get().fetchAchievements(),

  /** 계정 경계를 넘는 상태를 지우고 진행 중이던 요청을 전부 무효화한다(requestGeneration 증가). */
  reset: () => set((state) => ({ ...initialState, requestToken: null, requestGeneration: state.requestGeneration + 1 })),
}));

// 로그아웃이든 계정 전환이든, 계정 식별자가 바뀌는 순간 즉시 리셋한다(economy.store.js와 동일 계약).
useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null;
  const prevUserId = prevState?.user?.uuid ?? null;
  if (nextUserId !== prevUserId) {
    useAchievementsStore.getState().reset();
  }
});
