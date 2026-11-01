// 버튼 오른쪽 위 빨간 숫자 배지 (0이면 안 그림, 100부터 99+)
// 알림 버튼이 씀
import { NOTIF_ENTRY_BADGE_CLASS } from "@/shared/constants/lobbyLayoutStyle.js"

// 모양은 데스크톱 알림 버튼 배지 class 그대로
export default function CountBadge({ count }) {
    if (!count || count <= 0) return null

    return (
        <span aria-hidden="true" className={`pointer-events-none ${NOTIF_ENTRY_BADGE_CLASS}`}>
            {count > 99 ? "99+" : count}
        </span>
    )
}
