// 알림 항목 한 줄 (제목·본문·보러 가기·읽음 실패 다시 시도)
// 알림 본문 목록(renderBody.js)이 씀
import { createElement } from "react"

import { publicAsset } from "../../../../shared/utils/publicAsset.js"
import { buildNotificationTargetPath, notificationTargetLabel } from "../../constants/notificationTargets.js"
import { NOTIFICATION_ASSETS } from "../../constants/notificationAssets.js"
import {
  NOTIFICATION_ACTION_ROW_CLASS,
  NOTIFICATION_ERROR_CLASS,
  NOTIFICATION_ITEM_BODY_CLASS,
  NOTIFICATION_ITEM_INNER_CLASS,
  NOTIFICATION_ITEM_SLOT_CLASS,
  NOTIFICATION_ITEM_SLOT_IMG_CLASS,
  NOTIFICATION_ITEM_TITLE_CLASS,
} from "../../constants/notificationLayoutStyle.js"
import { renderActionButton } from "./renderActionButton.js"

// 갈 곳이 있는 알림만 보러 가기 버튼을 붙임
export default function NotificationItem({ item, pending, error, onRead, onOpenTarget, onClearError }) {
  const unread = !item.readAt
  const path = buildNotificationTargetPath(item.target)
  const targetLabel = notificationTargetLabel(item.target)

  const actions = []
  if (path !== null) {
    actions.push(
      renderActionButton({
        key: "open",
        label: targetLabel ?? "보러 가기",
        disabled: pending,
        pending,
        actionAttr: "open-target",
        onClick: () => onOpenTarget(item, path),
      }),
    )
  }

  return createElement(
    "li",
    {
      className: NOTIFICATION_ITEM_SLOT_CLASS,
      "data-notification-id": item.id,
      "data-notification-type": item.type,
      "data-notification-read": unread ? "false" : "true",
    },
    createElement("img", {
      src: publicAsset(NOTIFICATION_ASSETS.itemSlot),
      alt: "",
      draggable: false,
      className: NOTIFICATION_ITEM_SLOT_IMG_CLASS,
    }),
    createElement(
      "div",
      { className: NOTIFICATION_ITEM_INNER_CLASS },
      createElement("p", { className: NOTIFICATION_ITEM_TITLE_CLASS }, item.title),
      createElement("p", { className: NOTIFICATION_ITEM_BODY_CLASS }, item.body),
      actions.length > 0 ? createElement("div", { className: NOTIFICATION_ACTION_ROW_CLASS }, actions) : null,
      // 읽음 실패: 오류를 지우고 같은 항목을 다시 읽음 처리
      error
        ? createElement(
            "div",
            { className: NOTIFICATION_ACTION_ROW_CLASS },
            createElement(
              "p",
              { className: NOTIFICATION_ERROR_CLASS, role: "alert", "data-notification-read-error": item.id },
              error,
            ),
            renderActionButton({
              key: "retry",
              label: "다시 시도",
              actionAttr: "retry-read",
              onClick: () => {
                onClearError(item.id)
                onRead(item)
              },
            }),
          )
        : null,
    ),
  )
}
