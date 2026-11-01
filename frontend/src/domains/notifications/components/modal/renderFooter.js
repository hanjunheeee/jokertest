// 알림 창 바닥 줄 그리기 (읽은 메시지 삭제 버튼·삭제 오류)
// 알림 창(NotificationModal.js)이 씀
import { createElement } from "react"

import { useNotificationsStore } from "../../store/notifications.store.js"
import { ERROR_CLASS, MODAL_FOOTER_CLASS } from "../../constants/notificationLayoutStyle.js"
import { renderActionButton } from "./renderActionButton.js"

// 누를 때 지난 삭제 오류를 먼저 지우고 지우기 시작
export function renderFooter({ disabled, pending, error }) {
  return createElement(
    "div",
    { className: MODAL_FOOTER_CLASS, "data-notification-footer": "true" },
    renderActionButton({
      key: "delete-read",
      label: "읽은 메시지 삭제",
      actionAttr: "delete-read",
      variant: "secondary",
      disabled,
      pending,
      onClick: () => {
        useNotificationsStore.getState().clearDeleteReadError()
        void useNotificationsStore.getState().deleteReadNotifications()
      },
    }),
    error
      ? createElement(
          "p",
          {
            className: ERROR_CLASS,
            role: "alert",
            "data-notification-delete-error": "true",
          },
          error,
        )
      : null,
  )
}
