import { useCallback, useMemo, useState } from "react"
import { DUMMY_FRIENDS } from "../constants/friendInviteModalDummyData.js"

export function useMatchingFriendInvite({ roomId = null } = {}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [invitingIds, setInvitingIds] = useState(() => {
    const initial = new Set()
    for (const friend of DUMMY_FRIENDS) {
      if (friend.initiallyInviting) initial.add(friend.id)
    }
    return initial
  })

  const canInvite = roomId !== null

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
