// 친구 목록 패널 값 동기화 훅 (스토어 값 고르기·열 때 목록 받기·처리 함수 묶기)
// FriendListPanel·시험이 이 경로로 씀
import { useCallback, useEffect } from "react"
import { useFriendStore } from "../store/friend.store.js"
import { applyFriendFavoriteFlags, groupFriends } from "../utils/friendList.js"
import { makeRequestHandlers } from "./friendSync/requestOps.js"
import { runAcceptAll } from "./friendSync/acceptAll.js"


// 패널이 열릴 때마다 친구·받은 신청·즐겨찾기를 새로 받음
export function useFriendListSync(friendListOpen) {
  const friends = useFriendStore((state) => state.friends)
  const favoriteFriendIds = useFriendStore((state) => state.favoriteFriendIds)
  const favoritePendingIds = useFriendStore((state) => state.favoritePendingIds)
  const incomingRequests = useFriendStore((state) => state.incomingRequests)
  const friendsError = useFriendStore((state) => state.friendsError)
  const incomingError = useFriendStore((state) => state.incomingError)
  const blockedUsers = useFriendStore((state) => state.blockedUsers)
  const blocksStatus = useFriendStore((state) => state.blocksStatus)
  const blocksError = useFriendStore((state) => state.blocksError)

  const fetchFriends = useFriendStore((state) => state.fetchFriends)
  const fetchIncoming = useFriendStore((state) => state.fetchIncomingRequests)
  const fetchFavorites = useFriendStore((state) => state.fetchFavorites)
  const fetchBlocks = useFriendStore((state) => state.fetchBlocks)
  const removeIncomingRequest = useFriendStore((state) => state.removeIncomingRequest)

  const processingRequestIds = useFriendStore((state) => state.processingRequestIds)
  const acceptAllResult = useFriendStore((state) => state.acceptAllResult)
  const lockRequests = useFriendStore((state) => state.lockRequests)
  const unlockRequests = useFriendStore((state) => state.unlockRequests)
  const setAcceptAllResult = useFriendStore((state) => state.setAcceptAllResult)

  useEffect(() => {
    if (!friendListOpen) return

    fetchFriends()
    fetchIncoming()
    fetchFavorites()
  }, [friendListOpen])

  const handleRefreshFriends = async () => {
    await Promise.all([fetchFriends(), fetchIncoming(), fetchFavorites()])
  }

  const { handleAcceptRequest, handleDeclineRequest } = makeRequestHandlers({
    lockRequests, unlockRequests, removeIncomingRequest, fetchFriends, fetchIncoming,
  })

  // 누른 때의 받은 신청 목록으로 전부 수락함
  const handleAcceptAll = () => runAcceptAll({
    incomingRequests, lockRequests, unlockRequests, setAcceptAllResult, fetchFriends, fetchIncoming,
  })

  const handleRefreshBlocks = useCallback(() => fetchBlocks(), [fetchBlocks])

  return {
    ...groupFriends(applyFriendFavoriteFlags(friends, favoriteFriendIds)),
    incomingRequests,
    friendsError,
    incomingError,
    blockedUsers,
    blocksStatus,
    blocksError,
    favoritePendingIds,
    processingRequestIds,
    acceptAllResult,
    handleRefreshFriends,
    handleRefreshBlocks,
    handleAcceptRequest,
    handleDeclineRequest,
    handleAcceptAll,
  }
}
