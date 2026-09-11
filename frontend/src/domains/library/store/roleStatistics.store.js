// F-10: 서고 "초대받은 자들"이 쓰는 직업별 내 전적·랭킹 런타임 상태입니다.
//
// A-08: economy.store.js와 같은 계약을 따릅니다 — 계정 전환/로그아웃 뒤에 도착한 이전
// 계정(또는 이전 직업 선택)의 응답이 화면을 덮어쓰지 않도록 requestGeneration을 둡니다.
// 직업 탭을 바꾸는 동안에도 이전 직업으로 보낸 느린 요청이 새로 선택한 직업의 상태를
// 덮어쓰면 안 되므로, jobKey별로 in-flight 요청의 generation을 따로 추적합니다.
import { create } from "zustand";
import { getMyRoleStatisticsApi, getRoleRankingApi } from "../api/roleStatistics.api.js";
import { getMyAchievementsApi } from "../api/achievements.api.js";
import { useAuthStore } from "../../auth/store/auth.store.js";

// 서고 jobKey ↔ 서버 고정 직업 코드(AC-02). 두 표현을 여기 한 곳에서만 연결한다.
export const JOB_KEY_TO_ROLE_CODE = Object.freeze({
  noble: "CITIZEN",
  clown: "JOKER",
  doctor: "DOCTOR",
  guard: "GUARD",
  witchHunter: "WITCH_HUNTER",
});

const JOB_KEYS = Object.keys(JOB_KEY_TO_ROLE_CODE);

const emptyJobState = () => ({ status: "idle", myStats: null, ranking: null, error: null, achievementsById: {} });

const initialByJobKey = () => Object.fromEntries(JOB_KEYS.map((jobKey) => [jobKey, emptyJobState()]));

export const useRoleStatisticsStore = create((set, get) => ({
  byJobKey: initialByJobKey(),
  requestGeneration: 0,
  requestTokens: {},

  /** 선택한 직업의 내 전적과 전체 랭킹을 함께 불러온다. 이미 성공한 직업도 재시도용으로 다시 부를 수 있다. */
  requestJob: async (jobKey) => {
    const role = JOB_KEY_TO_ROLE_CODE[jobKey];
    if (!role) return;

    const generation = get().requestGeneration;
    const token = Symbol(jobKey);
    set((state) => ({
      requestTokens: { ...state.requestTokens, [jobKey]: token },
      byJobKey: { ...state.byJobKey, [jobKey]: { ...state.byJobKey[jobKey], status: "loading", error: null } },
    }));

    try {
      // F-12 AC-01/AC-06: 직업 도전과제(초대받은 자들)의 클리어 표시는 achievementDefinitions.js가
      // 정의한 업적 id(noble-win-10 등)로 판정한다 — 도전과제 id와 업적 id가 같은 문자열이므로
      // 별도 jobKey별 필터링 없이 22개 전체를 id로 색인해 두면 mergeInvitedGuestsSpreads.js가
      // 각 도전과제의 id로 조회한다. CODEX-1 재검토(AC-01): achieved 여부만 남기고 current·
      // threshold를 버리면 도전과제 화면이 실제 진행률("7/10승" 등)을 보여줄 방법이 없어진다
      // — 서버가 내려준 값을 id별로 그대로 보존한다.
      const [myStatsList, rankingResponse, achievements] = await Promise.all([
        getMyRoleStatisticsApi(),
        getRoleRankingApi(role),
        getMyAchievementsApi(),
      ]);
      // 응답이 도착하기 전에 로그아웃했거나 계정이 바뀌었다면 더 이상 "지금 이 화면"의
      // 응답이 아니다 — 조용히 버린다(A-08).
      if (get().requestGeneration !== generation || get().requestTokens[jobKey] !== token) return;

      const myStats = myStatsList.find((entry) => entry.role === role) ?? null;
      // CODEX-2 재검토(AC-06): achieved(진행률 조건 충족)만 남기면 지급이 실패/지연된
      // 업적도 화면에 "클리어"로 보일 수 있다 — mergeInvitedGuestsSpreads.js가 실제 지급
      // 이력(granted)으로 cleared를 판정할 수 있도록 여기서도 버리지 않고 함께 보존한다.
      const achievementsById = Object.fromEntries(
        achievements.map((a) => [a.id, { achieved: a.achieved, current: a.current, threshold: a.threshold, granted: a.granted }]),
      );
      set((state) => ({
        byJobKey: {
          ...state.byJobKey,
          [jobKey]: { status: "success", myStats, ranking: rankingResponse.ranking, error: null, achievementsById },
        },
      }));
    } catch (error) {
      if (get().requestGeneration !== generation || get().requestTokens[jobKey] !== token) return;
      set((state) => ({
        byJobKey: {
          ...state.byJobKey,
          [jobKey]: { ...state.byJobKey[jobKey], status: "error", error: error.message ?? "불러오지 못했습니다." },
        },
      }));
    }
  },

  /** 실패한 직업을 다시 요청한다. */
  retryJob: (jobKey) => get().requestJob(jobKey),

  /** 계정 경계를 넘는 상태를 지우고 진행 중이던 요청을 전부 무효화한다(requestGeneration 증가). */
  reset: () => set((state) => ({ byJobKey: initialByJobKey(), requestTokens: {}, requestGeneration: state.requestGeneration + 1 })),
}));

// 로그아웃이든 계정 전환이든 계정 식별자가 바뀌는 순간 즉시 리셋한다(economy.store.js와 동일 계약).
useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null;
  const prevUserId = prevState?.user?.uuid ?? null;
  if (nextUserId !== prevUserId) {
    useRoleStatisticsStore.getState().reset();
  }
});
