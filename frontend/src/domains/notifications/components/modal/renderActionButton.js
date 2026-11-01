// 알림 창 이미지 버튼 그리기 (보러 가기·다시 시도·읽은 메시지 삭제)
// 알림 항목·본문·바닥 줄이 씀, 배열에 넣어 쓰므로 컴포넌트 말고 함수로 둠
import { createElement } from "react"

import { publicAsset } from "../../../../shared/utils/publicAsset.js"
import { NOTIFICATION_ASSETS } from "../../constants/notificationAssets.js"
import {
  ACTION_BTN_CLASS,
  ACTION_BTN_IMG_CLASS,
  ACTION_BTN_PRIMARY_LABEL_CLASS,
  ACTION_BTN_SECONDARY_LABEL_CLASS,
} from "../../constants/notificationLayoutStyle.js"

// 처리 중이면 글자·읽기 이름을 '처리 중'으로 바꿈
export function renderActionButton({ key, label, onClick, disabled, actionAttr, variant = "primary", pending = false }) {
  const isPrimary = variant === "primary"

  return createElement(
    "button",
    {
      key,
      type: "button",
      className: ACTION_BTN_CLASS,
      disabled,
      "aria-label": pending ? "처리 중" : label,
      "data-notification-action": actionAttr,
      "data-notification-action-variant": variant,
      onClick,
    },
    createElement("img", {
      src: isPrimary
        ? publicAsset(NOTIFICATION_ASSETS.actionButtonPrimary)
        : publicAsset(NOTIFICATION_ASSETS.actionButtonSecondary),
      alt: "",
      draggable: false,
      className: ACTION_BTN_IMG_CLASS,
    }),
    createElement(
      "span",
      {
        className: isPrimary
          ? ACTION_BTN_PRIMARY_LABEL_CLASS
          : ACTION_BTN_SECONDARY_LABEL_CLASS,
      },
      pending ? "처리 중…" : label,
    ),
  )
}
