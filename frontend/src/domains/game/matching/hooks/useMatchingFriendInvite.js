import { useCallback, useMemo, useState } from "react"
import { FRIEND_INVITE_DUMMY_FRIENDS } from "../constants/friendInviteModalDummyData.js"

/**
 * F-19: 대기방 친구 초대 팝업 UI 상태.
 *
 * 현재는 prototype/친구초대 팝업.png 미리보기용 더미 데이터만 쓴다.
 * friend.store·gameInvite.store 연동은 이후 단계에서 이 훅에 붙인다.
 */
export function useMatchingFriendInvite({ roomId = null } = {}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [invitingIds, setInvitingIds] = useState(() => {
    const initial = new Set()
    for (const friend of FRIEND_INVITE_DUMMY_FRIENDS) {
      if (friend.initiallyInviting) initial.add(friend.id)
    }
    return initial
  })

  const canInvite = roomId !== null

  const inviteFriends = useMemo(
    () => FRIEND_INVITE_DUMMY_FRIENDS.map(({ initiallyInviting: _ignored, ...friend }) => friend),
    [],
  )

  const openFriendInviteModal = useCallback(() => {
    if (!canInvite) return
    setModalOpen(true)
  }, [canInvite])

  const closeFriendInviteModal = useCallback(() => {
    setModalOpen(false)
  }, [])

  const inviteFriend = useCallback((friendId) => {
    setInvitingIds((previous) => {
      if (previous.has(friendId)) return previous
      const next = new Set(previous)
      next.add(friendId)
      return next
    })
  }, [])

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
