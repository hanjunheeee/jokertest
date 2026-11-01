// 친구 목록 패널의 게임 초대 (받은 초대 목록 값 + 친구에게 초대 보내기)
// FriendListPanel이 차단 훅 다음에 부름
import { useCallback, useEffect } from "react"
import { useGameInviteStore } from "../../store/gameInvite.store.js"
import {
  loadInviteSnapshotAndPlayNew,
  requestGameInviteAccept,
} from "../useFriendSocketEvents.js"

// 받은 초대 탭 값 + 친구에게 초대 보내기 (방 id가 있을 때만)
export function usePanelInvites({ open, roomId, isRoomVerified }) {
  const invites = useGameInviteStore((state) => state.invites)
  const inviteStatus = useGameInviteStore((state) => state.status)
  const inviteError = useGameInviteStore((state) => state.error)
  const pendingInviteIds = useGameInviteStore((state) => state.pendingInviteIds)
  const inviteErrors = useGameInviteStore((state) => state.inviteErrors)
  const declineInvite = useGameInviteStore((state) => state.declineInvite)
  const sendInvite = useGameInviteStore((state) => state.sendInvite)

  // 패널 열 때마다 초대 스냅샷 다시 받음
  useEffect(() => {
    if (!open) return
    loadInviteSnapshotAndPlayNew()
  }, [open])

  // 같은 방·같은 친구에게는 같은 키를 써서 중복 초대를 막음
  const handleSendInvite = useCallback((receiverId) => {
    // 방이 없거나 확인 전이면 안 보냄
    if (roomId === null || !isRoomVerified) return
    return sendInvite(receiverId, `${roomId}:${receiverId}`)
  }, [roomId, isRoomVerified, sendInvite])

  // 대기방 밖(방 id 없음)에서는 초대 버튼 자체를 안 보임 (로비만 이 패널을 써서 지금은 늘 null)
  const invite = roomId !== null
    ? {
        onInvite: handleSendInvite,
        disabled: !isRoomVerified,
        disabledReason: "대기방 상태를 확인하는 중입니다.",
      }
    : null

  // 탭 글자에 붙일 대기 초대 수
  const pendingCount = invites.filter((item) => item.status === "PENDING").length

  // 초대 탭에 넘길 값·처리 함수
  const inviteList = {
    invites,
    status: inviteStatus,
    error: inviteError,
    pendingInviteIds,
    inviteErrors,
    pendingCount,
    onAccept: requestGameInviteAccept,
    onDecline: declineInvite,
    onRefresh: loadInviteSnapshotAndPlayNew,
  }

  return { invite, inviteList }
}
