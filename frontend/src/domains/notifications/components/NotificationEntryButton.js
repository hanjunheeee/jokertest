// 로비 알림 버튼 (안 읽은 수 배지)
// 로비 친구 영역(lobby/components/LobbyFriendArea.jsx)이 씀
import { createElement } from "react"

import { LOBBY_ASSETS } from "../../../shared/constants/lobbyAssets.js"
import {
  NOTIF_ENTRY_BADGE_CLASS,
  NOTIF_ENTRY_BTN_CLASS,
  NOTIF_ENTRY_BTN_IMG_CLASS,
} from "../../../shared/constants/lobbyLayoutStyle.js"
import PublicAsset from "../../../shared/ui/PublicAsset.jsx"
import { selectUnreadCount } from "../utils/visibleNotifications.js"
import { useNotificationsStore } from "../store/notifications.store.js"
import { useSettingsStore } from "../../settings/store/settingsStore.js"

// 배지 글자, 100개부터는 99+로 줄임
function formatUnread(count) {
  return count > 99 ? "99+" : String(count)
}

// 설정에서 끈 종류는 빼고 셈, 안 읽은 게 없으면 배지 안 그림
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
      className: NOTIF_ENTRY_BTN_CLASS,
      style: { outline: "none" },
      "data-notification-entry": "true",
      "data-notification-unread-count": String(unread),
      onClick: onOpen,
    },
    createElement(PublicAsset, {
      src: LOBBY_ASSETS.notificationEntryButton,
      alt: "",
      className: NOTIF_ENTRY_BTN_IMG_CLASS,
    }),
    unread > 0
      ? createElement(
          "span",
          { className: NOTIF_ENTRY_BADGE_CLASS, "aria-hidden": "true" },
          formatUnread(unread),
        )
      : null,
  )
}
