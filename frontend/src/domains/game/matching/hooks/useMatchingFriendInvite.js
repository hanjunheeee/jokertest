// 대기방 친구 초대 창 열기·닫기·초대 중 표시 (가짜 친구 목록, 서버로는 안 보냄)
// useMatchingPage가 씀, 방에 있을 때만 열림
import { useCallback, useMemo, useState } from "react"
import { DUMMY_FRIENDS } from "../constants/friendInviteModalDummyData.js"

// 친구 초대 상태 (roomId 없으면 못 엶)
export function useMatchingFriendInvite({ roomId = null } = {}) {
  const [modalOpen, setModalOpen] = useState(false)
  // 처음부터 초대 중으로 보일 친구 id 모음
  const [invitingIds, setInvitingIds] = useState(() => {
    const initial = new Set()
    for (const friend of DUMMY_FRIENDS) {
      if (friend.initiallyInviting) initial.add(friend.id)
    }
    return initial
  })

  // 방에 있을 때만 초대 가능
  const canInvite = roomId !== null

  // 화면엔 initiallyInviting 뺀 친구 정보만 넘김
  const inviteFriends = useMemo(
    () => DUMMY_FRIENDS.map(({ initiallyInviting: _ignored, ...friend }) => friend),
    [],
  )

  const openFriendInviteModal = useCallback(() => {
    if (!canInvite) return
    setModalOpen(true)
  }, [canInvite])

  const closeFriendInviteModal = useCallback(() => {
    setModalOpen(false)
  }, [])

  // 초대 누르면 초대 중 표시 (이미 표시됐으면 그대로 둠)
  const inviteFriend = useCallback((friendId) => {
    setInvitingIds((previous) => {
      if (previous.has(friendId)) return previous
      const next = new Set(previous)
      next.add(friendId)
      return next
    })
  }, [])

  // 방을 나가면 열려 있던 창도 닫힌 것으로 봄
  return {
    canOpenFriendInvite: canInvite,
    friendInviteModalOpen: modalOpen && canInvite,
    openFriendInviteModal,
    closeFriendInviteModal,
    inviteFriends,
    invitingIds,
    inviteFriend,
  }
}
