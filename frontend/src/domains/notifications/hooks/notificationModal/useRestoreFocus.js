// 알림 창 열 때 포커스 기억, 닫으면 되돌리고 삭제 오류 지움
// 알림 창(NotificationModal.js)이 씀
import { useEffect, useRef } from "react"

import { useNotificationsStore } from "../../store/notifications.store.js"

// 열리는 렌더에서 바로 기억해야 창 안 버튼으로 포커스가 가기 전 요소를 잡음
export function useRestoreFocus(open) {
  const restoreRef = useRef(null)

  if (open && restoreRef.current === null && typeof document !== "undefined") {
    restoreRef.current = document.activeElement
  }

  useEffect(() => {
    if (open) return undefined
    const previous = restoreRef.current
    restoreRef.current = null
    useNotificationsStore.getState().clearDeleteReadError()
    // 이미 사라진 요소면 포커스 실패를 무시함
    if (previous && typeof previous.focus === "function") {
      try {
        previous.focus()
      } catch {
        // 사라진 요소면 포커스를 되돌리지 않음
      }
    }
    return undefined
  }, [open])
}
