// 알림 읽음 처리 액션 (하나·보이는 것 모두·오류 지우기)
// notifications.store.js가 create 안에서 펼쳐 씀
import { callNotificationsApi } from "./callApi.js"
import { isConfirmedReadRow } from "../../utils/notificationRows.js"
import { mergeNotifications } from "../../utils/mergeNotifications.js"
import { selectVisibleNotifications } from "../../utils/visibleNotifications.js"

// id 하나를 뺀 오류 표
const withoutId = (errors, notificationId) =>
  Object.fromEntries(Object.entries(errors).filter(([id]) => id !== notificationId))

// 읽음 처리 액션 묶음
export const readActions = (set, get) => ({
  // 하나 읽음: 서버가 읽음 시각을 돌려줘야 확정
  markRead: async (notificationId) => {
    // 로그인 안 했거나 id가 이상하면 거절
    const { accountId, accountGeneration } = get()
    if (accountId === null) return { ok: false, reason: "anonymous" }
    if (typeof notificationId !== "string" || notificationId.length === 0) {
      return { ok: false, reason: "invalid" }
    }

    // 처리 중 표시 켜고 지난 오류 지움
    set((state) => ({
      readPendingIds: state.readPendingIds.includes(notificationId)
        ? state.readPendingIds
        : [...state.readPendingIds, notificationId],
      readErrors: withoutId(state.readErrors, notificationId),
    }))

    // 이 알림 처리 중 표시 끔
    const clearPending = () =>
      set((state) => ({ readPendingIds: state.readPendingIds.filter((id) => id !== notificationId) }))

    // 요청 실패: 처리 중 끄고 오류 남김, 그사이 계정 바뀌었으면 결과 버림
    let row
    try {
      row = await callNotificationsApi("markNotificationReadApi", notificationId)
    } catch (error) {
      if (!get().isCurrent(accountGeneration)) return { ok: false, reason: "stale" }
      clearPending()
      set((state) => ({
        readErrors: { ...state.readErrors, [notificationId]: error?.message ?? "읽음 처리에 실패했습니다." },
      }))
      return { ok: false, reason: "error" }
    }

    // 그사이 계정 바뀌었으면 결과 버림
    if (!get().isCurrent(accountGeneration)) return { ok: false, reason: "stale" }

    clearPending()

    // 응답이 와도 읽음 시각이 없으면 실패로 보여 다시 누르게 함
    if (!isConfirmedReadRow(row, notificationId)) {
      set((state) => ({
        readErrors: {
          ...state.readErrors,
          [notificationId]: "읽음 확정 응답을 받지 못했습니다. 다시 시도해 주세요.",
        },
      }))
      return { ok: false, reason: "unconfirmed" }
    }

    // 확정된 줄로 목록 고침
    set((state) => ({ items: mergeNotifications(state.items, [row]) }))
    return { ok: true, notification: row }
  },

  // 보이는 안 읽은 알림 모두 읽음: 먼저 읽음으로 보이고 실패한 것만 되돌림
  markVisibleUnreadAsRead: async (generalChecks) => {
    // 로그인 안 했으면 거절, 보이는 안 읽은 게 없으면 요청 없음
    const { accountId, accountGeneration } = get()
    if (accountId === null) return { ok: false, reason: "anonymous" }

    const visible = selectVisibleNotifications(get().items, generalChecks)
    const unread = visible.filter((item) => !item.readAt)
    if (unread.length === 0) return { ok: true, marked: 0 }

    const unreadIds = new Set(unread.map((item) => item.id))
    const optimisticAt = new Date().toISOString()

    // 같은 시각으로 미리 읽음 표시
    set((state) => ({
      items: state.items.map((item) =>
        unreadIds.has(item.id) ? { ...item, readAt: optimisticAt } : item,
      ),
    }))

    // 알림마다 따로 동시에 보내고 실패·미확정은 결과로만 모음
    const results = await Promise.all(
      unread.map(async (item) => {
        try {
          const row = await callNotificationsApi("markNotificationReadApi", item.id)
          if (!isConfirmedReadRow(row, item.id)) return { id: item.id, ok: false, row: null }
          return { id: item.id, ok: true, row }
        } catch {
          return { id: item.id, ok: false, row: null }
        }
      }),
    )

    // 그사이 계정 바뀌었으면 결과 버림
    if (!get().isCurrent(accountGeneration)) return { ok: false, reason: "stale" }

    const failedIds = results.filter((result) => !result.ok).map((result) => result.id)
    const okRows = results.filter((result) => result.ok).map((result) => result.row)

    // 실패한 것만 안 읽음으로 되돌리고 확정 줄은 합침
    set((state) => ({
      items: mergeNotifications(
        state.items.map((item) => (failedIds.includes(item.id) ? { ...item, readAt: null } : item)),
        okRows,
      ),
    }))

    return {
      ok: failedIds.length === 0,
      marked: unread.length - failedIds.length,
      failed: failedIds.length,
    }
  },

  // 다시 시도 전에 그 알림 오류 지움
  clearReadError: (notificationId) =>
    set((state) => ({
      readErrors: withoutId(state.readErrors, notificationId),
    })),
})
