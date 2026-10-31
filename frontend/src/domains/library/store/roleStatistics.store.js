import { create } from "zustand";
import { getMyRoleStatisticsApi, getRoleRankingApi } from "../api/roleStatistics.api.js";
import { getMyAchievementsApi } from "../api/achievements.api.js";
import { useAuthStore } from "../../auth/store/auth.store.js";

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
      const [myStatsList, rankingResponse, achievements] = await Promise.all([
        getMyRoleStatisticsApi(),
        getRoleRankingApi(role),
        getMyAchievementsApi(),
      ]);
      if (get().requestGeneration !== generation || get().requestTokens[jobKey] !== token) return;

      const myStats = myStatsList.find((entry) => entry.role === role) ?? null;
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

  retryJob: (jobKey) => get().requestJob(jobKey),

  reset: () => set((state) => ({ byJobKey: initialByJobKey(), requestTokens: {}, requestGeneration: state.requestGeneration + 1 })),
}));

useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null;
  const prevUserId = prevState?.user?.uuid ?? null;
  if (nextUserId !== prevUserId) {
    useRoleStatisticsStore.getState().reset();
  }
});
