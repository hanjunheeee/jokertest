// 파일 역할: NotificationEntryButton.js - 로비 좌하단 알림 모달 진입 버튼입니다.
//
// LOBBY_LEFT_CONTROLS_CLASS에 배치한다. 미확인 수는 버튼 우상단 배지로 표시하며,
// 표시 설정으로 가려진 알림은 세지 않는다(AC-04).
//
// createElement로만 구현해 .js 시험이 그대로 import할 수 있게 한다(파치먼트 셸과 같은 이유).
import { createElement } from "react"

import { LOBBY_ASSETS } from "../../lobby/constants/lobbyAssets.js"
import {
  LOBBY_NOTIFICATION_ENTRY_BADGE_CLASS,
  LOBBY_NOTIFICATION_ENTRY_BTN_CLASS,
  LOBBY_NOTIFICATION_ENTRY_BTN_IMG_CLASS,
} from "../../lobby/constants/lobbyLayoutStyle.js"
import PublicAsset from "../../../shared/ui/PublicAsset.jsx"
import { useNotificationsStore, selectUnreadCount } from "../store/notifications.store.js"
import { useSettingsStore } from "../../settings/store/settingsStore.js"

/** 두 자리를 넘는 수는 99+로 줄인다 — 버튼 폭이 레이아웃을 밀지 않게 한다. */
function formatUnread(count) {
  return count > 99 ? "99+" : String(count)
}

/**
 * @param {object} props
 * @param {() => void} props.onOpen 알림 모달을 연다.
 * @param {boolean} [props.open] 열려 있는지(aria-expanded).
 */
export default function NotificationEntryButton({ onOpen, open = false }) {
  const items = useNotificationsStore((state) => state.items)
  const generalChecks = useSettingsStore((state) => state.generalChecks)

  const unread = selectUnreadCount(items, generalChecks)

  return createElement(
    "button",
    {
      type: "button",
      "aria-label": unread > 0 ? `알림 (읽지 않음 ${unread}개)` : "알림",
      "aria-expanded": open,
      className: LOBBY_NOTIFICATION_ENTRY_BTN_CLASS,
      style: { outline: "none" },
      "data-notification-entry": "true",
      "data-notification-unread-count": String(unread),
      onClick: onOpen,
    },
    createElement(PublicAsset, {
      src: LOBBY_ASSETS.notificationEntryButton,
      alt: "",
      className: LOBBY_NOTIFICATION_ENTRY_BTN_IMG_CLASS,
    }),
    unread > 0
      ? createElement(
          "span",
          { className: LOBBY_NOTIFICATION_ENTRY_BADGE_CLASS, "aria-hidden": "true" },
          formatUnread(unread),
        )
      : null,
  )
}
