// 읽은 알림 지우기·알림 창 열고 닫기 액션
// notifications.store.js가 create 안에서 펼쳐 씀
import { callNotificationsApi } from "./callApi.js"

export const deleteActions = (set, get) => ({
  // 읽은 알림 먼저 숨기고, 서버가 거절하면 원래 목록으로 되돌림
  deleteReadNotifications: async () => {
    const { accountId, accountGeneration } = get()
    if (accountId === null) return { ok: false, reason: "anonymous" }

    const readItems = get().items.filter((item) => item.readAt)
    if (readItems.length === 0) return { ok: true, deleted: 0 }

    const snapshot = get().items
    const readIds = new Set(readItems.map((item) => item.id))

    set({
      deleteReadPending: true,
      deleteReadError: null,
      items: snapshot.filter((item) => !readIds.has(item.id)),
      readErrors: Object.fromEntries(
        Object.entries(get().readErrors).filter(([id]) => !readIds.has(id)),
      ),
      readPendingIds: get().readPendingIds.filter((id) => !readIds.has(id)),
    })

    try {
      await callNotificationsApi("deleteReadNotificationsApi")
    } catch (error) {
      if (!get().isCurrent(accountGeneration)) return { ok: false, reason: "stale" }
      set({
        deleteReadPending: false,
        deleteReadError: error?.message ?? "읽은 메시지를 삭제하지 못했습니다.",
        items: snapshot,
      })
      return { ok: false, reason: "error" }
    }

    if (!get().isCurrent(accountGeneration)) return { ok: false, reason: "stale" }

    set({ deleteReadPending: false, deleteReadError: null })
    return { ok: true, deleted: readItems.length }
  },

  clearDeleteReadError: () => set({ deleteReadError: null }),

  openModal: () => set({ open: true }),
  // 닫을 때 지우기 오류도 같이 지움
  closeModal: () => set({ open: false, deleteReadError: null }),
})
