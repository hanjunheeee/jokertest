// 읽은 알림 지우기·알림 창 열고 닫기 액션
// notifications.store.js가 create 안에서 펼쳐 씀
import { callNotificationsApi } from "./callApi.js"

// 읽은 알림 지우기·알림 창 열고 닫기 액션 묶음
export const deleteActions = (set, get) => ({
  // 읽은 알림 먼저 숨기고, 서버가 거절하면 원래 목록으로 되돌림
  deleteReadNotifications: async () => {
    // 로그인 안 했으면 거절, 읽은 알림이 없으면 요청 없이 끝
    const { accountId, accountGeneration } = get()
    if (accountId === null) return { ok: false, reason: "anonymous" }

    const readItems = get().items.filter((item) => item.readAt)
    if (readItems.length === 0) return { ok: true, deleted: 0 }

    const snapshot = get().items
    const readIds = new Set(readItems.map((item) => item.id))

    // 화면에서 먼저 빼고 그 알림의 읽음 오류·처리 중 표시도 지움
    set({
      deleteReadPending: true,
      deleteReadError: null,
      items: snapshot.filter((item) => !readIds.has(item.id)),
      readErrors: Object.fromEntries(
        Object.entries(get().readErrors).filter(([id]) => !readIds.has(id)),
      ),
      readPendingIds: get().readPendingIds.filter((id) => !readIds.has(id)),
    })

    // 실패하면 목록 되돌리고 오류 남김, 그사이 계정 바뀌었으면 결과 버림
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

    // 성공해도 그사이 계정 바뀌었으면 결과 버림
    if (!get().isCurrent(accountGeneration)) return { ok: false, reason: "stale" }

    set({ deleteReadPending: false, deleteReadError: null })
    return { ok: true, deleted: readItems.length }
  },

  // 삭제 오류 지움 (다시 누를 때·창 닫을 때)
  clearDeleteReadError: () => set({ deleteReadError: null }),

  // 알림 창 열기·닫기, 로비 알림 패널 훅이 부름
  openModal: () => set({ open: true }),
  // 닫을 때 지우기 오류도 같이 지움
  closeModal: () => set({ open: false, deleteReadError: null }),
})
