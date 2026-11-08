// 알림 창이 열리고 목록이 준비되면 보이는 안 읽은 알림 모두 읽음 (열린 동안 새로 온 것도)
// 알림 창(NotificationModal.js)이 씀
import { useLayoutEffect, useRef } from "react"

import { useNotificationsStore } from "../../store/notifications.store.js"
import { selectVisibleNotifications } from "../../utils/visibleNotifications.js"

// 보이는 안 읽은 알림 id를 글자 하나로 (바뀔 때만 다시 그리게)
const unreadKeyOf = (items, generalChecks) =>
  selectVisibleNotifications(items, generalChecks)
    .filter((item) => !item.readAt)
    .map((item) => item.id)
    .join(",")

// 화면 그리기 전에 보내 안 읽음 표시가 깜빡이지 않게 함
// 열린 동안 한 번 보낸 id는 다시 안 보냄 (실패가 되풀이돼도 끝없이 보내지 않게)
export function useAutoMarkRead(open, status, generalChecks) {
  const unreadKey = useNotificationsStore((state) => unreadKeyOf(state.items, generalChecks))
  const triedRef = useRef(new Set())

  useLayoutEffect(() => {
    if (!open) {
      triedRef.current = new Set()
      return undefined
    }
    // 목록을 다 받았을 때만
    if (status !== "success" || unreadKey === "") return undefined

    // 이번에 연 창에서 아직 안 보낸 안 읽은 알림이 있을 때만
    const ids = unreadKey.split(",")
    if (!ids.some((id) => !triedRef.current.has(id))) return undefined
    for (const id of ids) triedRef.current.add(id)

    void useNotificationsStore.getState().markVisibleUnreadAsRead(generalChecks)
    return undefined
  }, [open, status, generalChecks, unreadKey])
}
