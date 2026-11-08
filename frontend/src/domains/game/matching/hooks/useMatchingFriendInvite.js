// 대기방 친구 초대 창 열기·닫기·초대 보내기 (친구 목록·초대는 로비 친구·게임 초대 스토어)
// useMatchingPage가 씀(모바일 대기방도 같음), 방에 있을 때만 열림
import { useCallback, useEffect, useMemo, useState } from "react"
import { useFriendStore } from "@/domains/lobby/store/friend.store.js"
import { useGameInviteStore } from "@/domains/lobby/store/gameInvite.store.js"

const EMPTY_IDS = new Set()

// 접속한 친구 먼저 (서버가 접속 안 한 친구 초대는 거절하기 때문)
function sortOnlineFirst(friends) {
  const list = Array.isArray(friends) ? friends : []
  return [...list.filter((friend) => friend?.online), ...list.filter((friend) => !friend?.online)]
}

// 친구 초대 상태 (roomId 없으면 못 엶, 방 확인 전이면 보내기만 막음)
export function useMatchingFriendInvite({ roomId = null, isRoomVerified = true } = {}) {
  const [modalOpen, setModalOpen] = useState(false)
  // 이 방에서 초대를 보낸 친구 id (방이 바뀌면 안 씀)
  const [sent, setSent] = useState(() => ({ roomId: null, ids: EMPTY_IDS }))
  const [sendError, setSendError] = useState(null)

  const friends = useFriendStore((state) => state.friends)
  const friendsError = useFriendStore((state) => state.friendsError)
  const fetchFriends = useFriendStore((state) => state.fetchFriends)
  const sendInvite = useGameInviteStore((state) => state.sendInvite)
  const sendingIds = useGameInviteStore((state) => state.sendingReceiverIds)

  // 방에 있을 때만 초대 가능
  const canInvite = roomId !== null

  // 자격을 잃으면 창도 닫음 (되찾아도 저절로 다시 안 열리게)
  const [prevCanInvite, setPrevCanInvite] = useState(canInvite)
  if (prevCanInvite !== canInvite) {
    setPrevCanInvite(canInvite)
    if (!canInvite) {
      setModalOpen(false)
      setSendError(null)
    }
  }

  const isOpen = modalOpen && canInvite

  // 창 열 때마다 친구 목록 새로 받음
  useEffect(() => {
    if (!isOpen) return
    fetchFriends?.()
  }, [isOpen, fetchFriends])

  // 화면엔 줄에 필요한 값만 넘김 (전적은 목록 응답에 없어 비움)
  const inviteFriends = useMemo(
    () => sortOnlineFirst(friends).map((friend) => ({
      id: friend.id,
      name: friend.name,
      accountProfilePhotoId: friend.accountProfilePhotoId ?? null,
      accountProfileBorderId: friend.accountProfileBorderId ?? null,
    })),
    [friends],
  )

  // 보내는 중 + 이 방에서 보낸 친구를 "초대중"으로 보임
  const invitingIds = useMemo(() => {
    const sentIds = sent.roomId === roomId ? sent.ids : EMPTY_IDS
    if (sentIds.size === 0) return sendingIds ?? EMPTY_IDS
    const next = new Set(sentIds)
    for (const id of sendingIds ?? []) next.add(id)
    return next
  }, [sent, roomId, sendingIds])

  const openFriendInviteModal = useCallback(() => {
    if (!canInvite) return
    setSendError(null)
    setModalOpen(true)
  }, [canInvite])

  const closeFriendInviteModal = useCallback(() => {
    setModalOpen(false)
    setSendError(null)
  }, [])

  // 초대 누르면 서버로 보냄, 성공해야 "초대중" 남김 (같은 방·친구는 같은 키라 중복 초대 안 생김)
  const inviteFriend = useCallback(async (friendId) => {
    if (roomId === null || !isRoomVerified || typeof friendId !== "string") return
    if (invitingIds.has(friendId)) return
    setSendError(null)
    const result = await sendInvite(friendId, `${roomId}:${friendId}`)
    if (result?.ok) {
      setSent((previous) => {
        const base = previous.roomId === roomId ? previous.ids : EMPTY_IDS
        const ids = new Set(base)
        ids.add(friendId)
        return { roomId, ids }
      })
      return
    }
    if (result?.reason === "error") {
      setSendError(result.message ?? "초대를 보내지 못했습니다.")
    }
  }, [roomId, isRoomVerified, invitingIds, sendInvite])

  // 방을 나가면 열려 있던 창도 닫힌 것으로 봄
  return {
    canOpenFriendInvite: canInvite,
    friendInviteModalOpen: isOpen,
    openFriendInviteModal,
    closeFriendInviteModal,
    inviteFriends,
    invitingIds,
    inviteFriend,
    friendInviteError: sendError ?? friendsError ?? null,
  }
}
