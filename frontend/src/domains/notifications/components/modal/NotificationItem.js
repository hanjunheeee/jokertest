// 알림 항목 한 줄 (제목·받은 시각·본문·보러 가기·읽음 실패 다시 시도)
// 알림 본문 목록(renderBody.js)이 씀
import { createElement } from "react"

import { publicAsset } from "../../../../shared/utils/publicAsset.js"
import { buildNotificationTargetPath, notificationTargetLabel } from "../../../../shared/constants/notificationTargets.js"
import { NOTIFICATION_ASSETS } from "../../constants/notificationAssets.js"
import {
  ACTION_ROW_CLASS,
  ERROR_CLASS,
  ITEM_BODY_CLASS,
  ITEM_INNER_CLASS,
  ITEM_SLOT_CLASS,
  ITEM_SLOT_IMG_CLASS,
  ITEM_TIME_CLASS,
  ITEM_TITLE_CLASS,
  ITEM_TITLE_ROW_CLASS,
} from "../../constants/notificationLayoutStyle.js"
import { formatNotificationTime } from "../../utils/notificationTime.js"
import { renderActionButton } from "./renderActionButton.js"

// 갈 곳이 있는 알림만 보러 가기 버튼을 붙임
export default function NotificationItem({ item, pending, error, onRead, onOpenTarget, onClearError }) {
  const unread = !item.readAt
  const path = buildNotificationTargetPath(item.target)
  const targetLabel = notificationTargetLabel(item.target)
  // 받은 시각 글자, 이상한 값이면 빈 글자 (시각 칸을 안 그림)
  const timeText = formatNotificationTime(item.createdAt)

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
      className: ITEM_SLOT_CLASS,
      "data-notification-id": item.id,
      "data-notification-type": item.type,
      "data-notification-read": unread ? "false" : "true",
    },
    createElement("img", {
      src: publicAsset(NOTIFICATION_ASSETS.itemSlot),
      alt: "",
      draggable: false,
      className: ITEM_SLOT_IMG_CLASS,
    }),
    createElement(
      "div",
      { className: ITEM_INNER_CLASS },
      // 제목과 같은 줄 오른쪽에 받은 시각을 작게 (줄 높이를 안 늘리려고)
      createElement(
        "div",
        { className: ITEM_TITLE_ROW_CLASS },
        createElement("p", { className: ITEM_TITLE_CLASS }, item.title),
        timeText
          ? createElement("time", { className: ITEM_TIME_CLASS, dateTime: item.createdAt }, timeText)
          : null,
      ),
      createElement("p", { className: ITEM_BODY_CLASS }, item.body),
      actions.length > 0 ? createElement("div", { className: ACTION_ROW_CLASS }, actions) : null,
      // 읽음 실패: 오류를 지우고 같은 항목을 다시 읽음 처리
      error
        ? createElement(
            "div",
            { className: ACTION_ROW_CLASS },
            createElement(
              "p",
              { className: ERROR_CLASS, role: "alert", "data-notification-read-error": item.id },
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
