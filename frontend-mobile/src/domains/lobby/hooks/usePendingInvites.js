// 받은 게임 초대 중 대기 중인 것 (바닥 친구 버튼 배지·초대 알림 띠용)
// 모바일 로비 BottomBar가 씀
import { useState } from "react"
import { useGameInviteStore } from "@/domains/lobby/store/gameInvite.store.js"

// 대기 수는 데스크톱 초대 탭 글자(usePanelInvites)와 같은 기준(PENDING)으로 셈
// 알림 띠는 닫은 뒤 더 새 초대가 오면 다시 보임
export function usePendingInvites() {
    const invites = useGameInviteStore((state) => state.invites)
    const [dismissedId, setDismissedId] = useState(null)

    const pending = invites.filter((invite) => invite.status === "PENDING")
    // 스토어가 새 순번부터 정렬해 둠
    const latest = pending[0] ?? null
    const alertVisible = latest !== null && latest.inviteId !== dismissedId

    const dismiss = () => {
        if (latest) setDismissedId(latest.inviteId)
    }

    return { count: pending.length, latest, alertVisible, dismiss }
}
