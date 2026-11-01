// 경제 스토어의 지갑·보유 아이템·장착 상태 불러오기 액션
// economy.store.js가 create 안에서 펼쳐 씀
import { economyApi } from "../../api/economy.api.js"
import { resolveUserId } from "./state.js"

export const summaryActions = (set, get) => ({
  // 늦게 온 응답은 버리고, 그사이 장착을 바꿨으면 장착 상태는 덮지 않음
  fetchSummary: async () => {
    const userId = resolveUserId()
    if (!userId) {
      set({ status: "error", error: "로그인이 필요합니다." })
      return { ok: false }
    }

    const generation = get().requestGeneration
    const attemptSeq = get().loadoutAttemptSeq
    const writeSeq = get().loadoutWriteSeq
    const summarySeq = get().summaryRequestSeq + 1
    set({ summaryRequestSeq: summarySeq, status: "loading", error: null })
    try {
      const [wallet, entitlementsResponse] = await Promise.all([
        economyApi.wallet(userId),
        economyApi.entitlements(userId),
      ])
      if (get().requestGeneration !== generation || get().summaryRequestSeq !== summarySeq) return { ok: false, stale: true }
      const loadoutApplied = get().loadoutAttemptSeq === attemptSeq && get().loadoutWriteSeq === writeSeq
      set((state) => ({
        balanceGold: wallet.balanceGold,
        balanceDiamond: wallet.balanceDiamond,
        entitlements: entitlementsResponse.entitlements,
        loadout: state.loadoutAttemptSeq === attemptSeq && state.loadoutWriteSeq === writeSeq ? entitlementsResponse.loadout : state.loadout,
        status: "ready",
        error: null,
      }))
      return { ok: loadoutApplied, stale: !loadoutApplied, loadout: loadoutApplied ? entitlementsResponse.loadout : undefined }
    } catch (error) {
      if (get().requestGeneration !== generation || get().summaryRequestSeq !== summarySeq) return { ok: false, stale: true }
      set({ status: "error", error: error.message ?? "지갑 정보를 불러오지 못했습니다." })
      return { ok: false, error }
    }
  },

  retry: () => get().fetchSummary(),
})
