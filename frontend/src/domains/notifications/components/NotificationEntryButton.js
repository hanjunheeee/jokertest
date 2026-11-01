import { createElement } from "react"

import { LOBBY_ASSETS } from "../../../shared/constants/lobbyAssets.js"
import {
  LOBBY_NOTIFICATION_ENTRY_BADGE_CLASS,
  LOBBY_NOTIFICATION_ENTRY_BTN_CLASS,
  LOBBY_NOTIFICATION_ENTRY_BTN_IMG_CLASS,
} from "../../../shared/constants/lobbyLayoutStyle.js"
import PublicAsset from "../../../shared/ui/PublicAsset.jsx"
import { useNotificationsStore, selectUnreadCount } from "../store/notifications.store.js"
import { useSettingsStore } from "../../settings/store/settingsStore.js"

function formatUnread(count) {
  return count > 99 ? "99+" : String(count)
}

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
