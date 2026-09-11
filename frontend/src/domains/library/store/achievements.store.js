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

  /** 22개 업적의 진행률·달성 상태를 서버에서 다시 읽어온다.
   *
   * CODEX-4 재검토(AC-06): 이전 버전은 호출부에 아무것도 돌려주지 않아, useAchievements.js가
   * "이번 호출이 실제로 상태를 갱신했는지"를 판단할 방법이 없어 나중에 전역 status를 다시
   * 읽을 수밖에 없었다 — 그 사이 다른(더 나중에 시작된) 호출이 이미 끝나 있으면 그 호출의
   * 성공을 자신의 것으로 착각해 경제 상태를 불필요하게 다시 읽거나, 반대로 이 호출 자신의
   * 세대/토큰 판정 결과를 호출부가 재사용할 수 없었다. 이제 이 함수가 그 순간에 실제로 검사한
   * generation/token 일치 여부를 반환값(outcome)에 그대로 실어, 호출부가 전역 status가
   * 아니라 이 반환값만으로 "이 호출이 지금도 유효한지"를 판단하게 한다(A-08 원칙을 호출부
   * 경계까지 그대로 전달한다). */
  fetchAchievements: async () => {
    const generation = get().requestGeneration;
    const token = Symbol("achievements");
    set({ status: "loading", error: null, requestToken: token });
    try {
      const achievements = await getMyAchievementsApi();
      // 응답이 도착하기 전에 로그아웃했거나 다른 계정으로 전환됐거나, 더 나중에 시작된
      // fetchAchievements 호출이 있었다면 더 이상 "지금 이 화면"의 응답이 아니다 — 조용히
      // 버린다(A-08).
      if (get().requestGeneration !== generation || get().requestToken !== token) return { outcome: "stale" };
      set({ status: "success", achievements, error: null });
      return { outcome: "success" };
    } catch (error) {
      if (get().requestGeneration !== generation || get().requestToken !== token) return { outcome: "stale" };
      set({ status: "error", error: error.message ?? "업적 정보를 불러오지 못했습니다." });
      return { outcome: "error" };
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
