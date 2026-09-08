import { useEffect } from "react"
import {
  acceptFriendRequest,
  declineFriendRequest,
} from "@/domains/lobby/api/friend.api.js"
import { useFriendStore } from "@/domains/lobby/store/friend.store"
import { applyFriendFavoriteFlags } from "@/domains/lobby/utils/applyFriendFavoriteFlags.js"
import { groupFriends } from "@/domains/lobby/utils/groupFriends.js"

// 친구 목록 패널이 열릴 때 친구 목록과 받은 친구 요청을 동기화하는 훅입니다.
export function useFriendListSync(friendListOpen) {
  const friends = useFriendStore((state) => state.friends)
  const favoriteFriendIds = useFriendStore((state) => state.favoriteFriendIds)
  const incomingRequests = useFriendStore((state) => state.incomingRequests)
  const fetchFriendsFromStore = useFriendStore((state) => state.fetchFriends)
  const fetchIncomingFromStore = useFriendStore((state) => state.fetchIncomingRequests)
  const removeIncomingRequest = useFriendStore((state) => state.removeIncomingRequest)
  const setIncomingRequests = useFriendStore((state) => state.setIncomingRequests)

  useEffect(() => {
    // 친구 목록 패널이 닫혀 있으면 서버 요청을 보내지 않습니다.
    if (!friendListOpen) return

    // 패널이 열리는 순간 최신 친구 목록과 받은 요청 목록을 가져옵니다.
    fetchFriendsFromStore()
    fetchIncomingFromStore()
  }, [friendListOpen]) // 패널 열림 여부가 바뀔 때만 동기화합니다.

  const handleRefreshFriends = async () => {
    // 새로고침 버튼에서 친구 목록과 받은 요청 목록을 동시에 다시 가져옵니다.
    await Promise.all([fetchFriendsFromStore(), fetchIncomingFromStore()])
  }

  const handleAcceptRequest = async (requestId) => {
    try {
      await acceptFriendRequest(requestId)

      // 수락한 요청은 받은 요청 목록에서 바로 제거합니다.
      removeIncomingRequest(requestId)

      // 친구가 새로 추가되었으므로 친구 목록도 다시 가져옵니다.
      fetchFriendsFromStore()
    } catch (error) {
      console.error("친구 수락 실패:", error.message)
    }
  }

  const handleDeclineRequest = async (requestId) => {
    try {
      await declineFriendRequest(requestId)

      // 거절한 요청은 받은 요청 목록에서 바로 제거합니다.
      removeIncomingRequest(requestId)
    } catch (error) {
      console.error("친구 거절 실패:", error.message)
    }
  }

  const handleAcceptAll = async () => {
    try {
      // 현재 받은 요청을 모두 수락합니다.
      await Promise.all(incomingRequests.map((request) => acceptFriendRequest(request.request_id)))

      // 모두 처리했으므로 받은 요청 목록은 비웁니다.
      setIncomingRequests([])

      // 수락된 사용자들이 친구 목록에 반영되도록 다시 가져옵니다.
      fetchFriendsFromStore()
    } catch (error) {
      console.error("전체 수락 실패:", error.message)
    }
  }

  return {
    ...groupFriends(applyFriendFavoriteFlags(friends, favoriteFriendIds)),
    incomingRequests,
    handleRefreshFriends,
    handleAcceptRequest,
    handleDeclineRequest,
    handleAcceptAll,
  }
}
