// 로비 알림 버튼 (안 읽은 수 배지)
// BottomBar가 씀
import { LOBBY_ASSETS } from "@/shared/constants/lobbyAssets.js"
import { selectUnreadCount } from "@/domains/notifications/utils/visibleNotifications.js"
import { useNotificationsStore } from "@/domains/notifications/store/notifications.store.js"
import { useSettingsStore } from "@/domains/settings/store/settingsStore.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import CountBadge from "@m/domains/lobby/components/bottom/CountBadge.jsx"

// 설정에서 끈 종류는 빼고 셈 (데스크톱 NotificationEntryButton과 같은 기준)
export default function NotificationButton({ open, onOpen }) {
    const items = useNotificationsStore((state) => state.items)
    const generalChecks = useSettingsStore((state) => state.generalChecks)
    const unread = selectUnreadCount(items, generalChecks)

    return (
        <button
            type="button"
            aria-label={unread > 0 ? `알림 (읽지 않음 ${unread}개)` : "알림"}
            aria-expanded={open}
            onClick={onOpen}
            data-notification-entry="true"
            data-notification-unread-count={String(unread)}
            className="relative flex h-12 w-14 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-transform duration-200 active:scale-95 md:h-16 md:w-20"
        >
            <PublicAsset src={LOBBY_ASSETS.notificationEntryButton} alt="" className="block h-auto w-full select-none" />
            <CountBadge count={unread} />
        </button>
    )
}
