// 로비 알림 버튼 (안 읽은 수 배지)
// BottomBar가 씀
import { LOBBY_MOBILE_ASSETS } from "@m/domains/lobby/constants/lobbyMobileAssets.js"
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
            className="interactive-scale relative flex h-14 w-16 shrink-0 items-center justify-center md:h-[4.5rem] md:w-[5.5rem]"
        >
            <PublicAsset src={LOBBY_MOBILE_ASSETS.notificationButton} alt="" className="block h-auto w-full select-none" />
            <CountBadge count={unread} />
        </button>
    )
}
