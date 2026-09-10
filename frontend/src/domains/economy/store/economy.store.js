// F-08 서버 경제 상태 클라이언트. 상점·기억의 서고·마이페이지가 공통으로 보는 잔액·
// 소유품·장착 상태를 backend/routes/economy.routes.js에서 복원한다. 도메인 관례상 API
// 호출은 별도 *.api.js로 감싸지만, 이 작업의 계획된 새 파일은 이 store 하나뿐이라(수정
// 범위 문서) fetch 호출을 이 파일 안에 그대로 둔다.
import { create } from "zustand"

import { api } from "../../../shared/api/client.js"
import { useAuthStore } from "../../auth/store/auth.store.js"

const initialLoadout = {
  selectedProfilePhotoId: null,
  selectedProfileBorderId: null,
  selectedCardFrameId: null,
}

const initialState = {
  balanceGold: 0,
  entitlements: [],
  loadout: initialLoadout,
  status: "idle", // idle | loading | ready | error
  error: null,
  // itemId별 구매 진행 상태. referenceEventId를 유지해 응답 유실 후 재시도가 같은
  // 참조 사건 ID를 재사용하게 한다(백엔드 재처리 방지 키, F-08 AC-02) — 그래야 "성공했는지
  // 모르는 채로 재시도"해도 서버가 중복 지급하지 않는다.
  pendingPurchases: {},
}

const resolveUserId = () => useAuthStore.getState().user?.uuid ?? null

const buildReferenceEventId = (userId, itemId) =>
  `purchase:${userId}:${itemId}:${crypto.randomUUID()}`

export const useEconomyStore = create((set, get) => ({
  ...initialState,

  /** 지갑 잔액·소유품·장착 상태를 서버에서 다시 읽어온다. */
  fetchSummary: async () => {
    const userId = resolveUserId()
    if (!userId) {
      set({ status: "error", error: "로그인이 필요합니다." })
      return
    }

    set({ status: "loading", error: null })
    try {
      const [wallet, entitlementsResponse] = await Promise.all([
        api.get(`/economy/accounts/${userId}/wallet`),
        api.get(`/economy/accounts/${userId}/entitlements`),
      ])
      set({
        balanceGold: wallet.balanceGold,
        entitlements: entitlementsResponse.entitlements,
        loadout: entitlementsResponse.loadout,
        status: "ready",
        error: null,
      })
    } catch (error) {
      set({ status: "error", error: error.message ?? "지갑 정보를 불러오지 못했습니다." })
    }
  },

  /** 마지막 실패를 그대로 다시 시도한다. */
  retry: () => get().fetchSummary(),

  /** @param {{ itemId: string }} params */
  purchase: async ({ itemId }) => {
    const userId = resolveUserId()
    if (!userId) throw new Error("로그인이 필요합니다.")

    const existingPending = get().pendingPurchases[itemId]
    const referenceEventId = existingPending?.referenceEventId ?? buildReferenceEventId(userId, itemId)

    set((state) => ({
      pendingPurchases: {
        ...state.pendingPurchases,
        [itemId]: { referenceEventId, status: "pending", error: null },
      },
    }))

    try {
      const result = await api.post("/economy/purchase", { itemId, referenceEventId })
      set((state) => ({
        pendingPurchases: {
          ...state.pendingPurchases,
          [itemId]: { referenceEventId, status: "confirmed", error: null },
        },
      }))
      await get().fetchSummary()
      return result
    } catch (error) {
      // 네트워크가 끊겨 응답을 못 받았을 수도, 서버가 정말 거부했을 수도 있다 — 어느
      // 쪽인지 이 시점엔 알 수 없으므로 referenceEventId는 지우지 않는다. retryPurchase가
      // 같은 참조 사건 ID로 재시도하면 서버가 중복 지급 없이 안전하게 같은 결과를 돌려준다.
      set((state) => ({
        pendingPurchases: {
          ...state.pendingPurchases,
          [itemId]: { referenceEventId, status: "unknown", error: error.message ?? "구매 요청에 실패했습니다." },
        },
      }))
      throw error
    }
  },

  /** 응답을 잃어버린(status "unknown") 구매를 같은 참조 사건 ID로 재시도한다. */
  retryPurchase: (itemId) => get().purchase({ itemId }),

  /** @param {{ slot: "PROFILE_PHOTO" | "PROFILE_BORDER" | "PLAYER_CARD_FRAME", itemId: string }} params */
  equip: async ({ slot, itemId }) => {
    const result = await api.post("/economy/equip", { slot, itemId })
    set((state) => ({ loadout: { ...state.loadout, ...result.loadout } }))
    return result
  },

  reset: () => set({ ...initialState, pendingPurchases: {} }),
}))
