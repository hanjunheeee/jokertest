// 알림 창이 열리고 목록이 준비되면 보이는 안 읽은 알림 모두 읽음
// 알림 창(NotificationModal.js)이 씀
import { useLayoutEffect } from "react"

import { useNotificationsStore } from "../../store/notifications.store.js"
import { selectVisibleNotifications } from "../../utils/visibleNotifications.js"

// 화면 그리기 전에 보내 안 읽음 표시가 깜빡이지 않게 함
export function useAutoMarkRead(open, status, generalChecks) {
  useLayoutEffect(() => {
    // 창이 열렸고 목록을 다 받았을 때만
    if (!open || status !== "success") return undefined

    // 보이는 것 중 안 읽은 게 없으면 안 보냄
    const store = useNotificationsStore.getState()
    const visible = selectVisibleNotifications(store.items, generalChecks)
    if (!visible.some((item) => !item.readAt)) return undefined

    void store.markVisibleUnreadAsRead(generalChecks)
    return undefined
  }, [open, status, generalChecks])
}
