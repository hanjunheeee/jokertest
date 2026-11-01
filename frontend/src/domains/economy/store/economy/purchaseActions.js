// 경제 스토어의 아이템 구매·다시 구매 액션 (구매 줄 상태: 대기·확정·거절·결과 모름)
// economy.store.js가 create 안에서 펼쳐 씀
import { economyApi } from "../../api/economy.api.js"
import { resolveUserId } from "./state.js"

// 같은 구매를 서버가 한 번만 처리하게 붙이는 id
const buildReferenceEventId = (userId, itemId) =>
  `purchase:${userId}:${itemId}:${crypto.randomUUID()}`

// 구매·다시 구매 액션 묶음, 지금 가게 화면은 storePurchase.store.js로 사서 시험만 부름
export const purchaseActions = (set, get) => ({
  // 결과 모름으로 끝난 구매는 같은 id로 다시 보내 두 번 사지 않게 함
  purchase: async ({ itemId }) => {
    // 로그인 안 했으면 거절
    const userId = resolveUserId()
    if (!userId) throw new Error("로그인이 필요합니다.")

    const generation = get().requestGeneration
    const existingPending = get().pendingPurchases[itemId]
    const referenceEventId = existingPending?.status === "unknown"
      ? existingPending.referenceEventId
      : buildReferenceEventId(userId, itemId)

    // 구매 줄을 대기로 표시
    set((state) => ({
      pendingPurchases: {
        ...state.pendingPurchases,
        [itemId]: { referenceEventId, status: "pending", error: null, code: null },
      },
    }))

    try {
      const result = await economyApi.purchase({ itemId, referenceEventId })
      // 그사이 초기화됐으면 상태 안 건드림, 아니면 확정 표시 뒤 지갑·보유 다시 받음
      if (get().requestGeneration !== generation) return result
      set((state) => ({
        pendingPurchases: {
          ...state.pendingPurchases,
          [itemId]: { referenceEventId, status: "confirmed", error: null, code: null },
        },
      }))
      await get().fetchSummary()
      return result
    } catch (error) {
      // 그사이 초기화됐으면 상태 안 건드림
      if (get().requestGeneration !== generation) throw error

      // 서버가 코드를 준 실패만 거절, 나머지는 결과 모름
      const confirmedRejection = typeof error.code === "string" && error.code.length > 0
      set((state) => ({
        pendingPurchases: {
          ...state.pendingPurchases,
          [itemId]: {
            referenceEventId,
            status: confirmedRejection ? "rejected" : "unknown",
            error: error.message ?? (confirmedRejection ? "구매가 거부되었습니다." : "구매 요청에 실패했습니다."),
            code: confirmedRejection ? error.code : null,
          },
        },
      }))
      throw error
    }
  },

  // 같은 아이템 다시 구매 (결과 모름이면 같은 id로)
  retryPurchase: (itemId) => get().purchase({ itemId }),
})
