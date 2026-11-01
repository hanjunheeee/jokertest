// 알림 창 본문 그리기 (오류·불러오는 중·비어 있음·목록)
// 알림 창(NotificationModal.js)이 스크롤 영역 안에 넣어 씀
import { createElement } from "react"

import {
  NOTIFICATION_ERROR_CLASS,
  NOTIFICATION_LIST_CLASS,
  NOTIFICATION_MESSAGE_CLASS,
  NOTIFICATION_EMPTY_MESSAGE_CLASS,
} from "../../constants/notificationLayoutStyle.js"
import { renderActionButton } from "./renderActionButton.js"
import NotificationItem from "./NotificationItem.js"

// 본문 상태별로 한 가지만 그림
export function renderBody({ state, error, visible, onRetry, itemProps }) {
  if (state === "error") {
    return createElement(
      "div",
      { className: "flex flex-col items-center gap-2", "data-notification-state": "error" },
      createElement("p", { className: NOTIFICATION_ERROR_CLASS, role: "alert" }, error ?? "알림을 불러오지 못했습니다."),
      renderActionButton({
        key: "retry-list",
        label: "다시 시도",
        actionAttr: "retry-list",
        onClick: onRetry,
      }),
    )
  }

  if (state === "loading") {
    return createElement(
      "p",
      { className: NOTIFICATION_MESSAGE_CLASS, "data-notification-state": "loading" },
      "알림을 불러오는 중입니다.",
    )
  }

  if (state === "empty") {
    return createElement(
      "p",
      { className: NOTIFICATION_EMPTY_MESSAGE_CLASS, "data-notification-state": "empty" },
      "표시할 알림이 없습니다.",
    )
  }

  return createElement(
    "ul",
    { className: NOTIFICATION_LIST_CLASS, "data-notification-state": "list" },
    visible.map((item) => createElement(NotificationItem, { key: item.id, item, ...itemProps(item) })),
  )
}
