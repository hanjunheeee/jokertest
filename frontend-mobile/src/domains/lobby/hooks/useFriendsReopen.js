// 알림 "보러 가기"로 같은 로비 주소에 다시 와도 친구 시트를 다시 엶
// 모바일 LobbyPage가 씀 (데스크톱 handleNotificationNavigate의 다시 열기 신호 대신)
import { useEffect } from "react"
import { useLocation } from "react-router-dom"

// 이동마다 바뀌는 location.key로 신호를 대신함 (알림 시트가 직접 navigate해서 신호를 못 올림)
export function useFriendsReopen({ friendRequestTargetId, gameInviteTargetId, openFriendList }) {
    const { key } = useLocation()

    useEffect(() => {
        if (friendRequestTargetId === null && gameInviteTargetId === null) return
        openFriendList()
    }, [key, friendRequestTargetId, gameInviteTargetId, openFriendList])
}
