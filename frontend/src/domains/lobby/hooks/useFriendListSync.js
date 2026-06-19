import { useEffect } from "react"
import {
  acceptFriendRequest,
  declineFriendRequest,
} from "@/domains/lobby/api/friend.js"
import { useFriendStore } from "@/domains/lobby/store/friendStore"

/**
 * 친구 목록 패널 데이터 동기화 훅.
 *
 * 패널이 열릴 때 서버에서 최신 데이터를 가져옵니다.
 * 이후 실시간 변경은 useSocket이 friendStore를 직접 업데이트합니다.
 *
 * incomingRequests를 로컬 state가 아닌 스토어에서 읽는 이유:
 *   useSocket이 App.jsx 최상단에서 실행되므로 이 훅의 로컬 state에 접근할 수 없습니다.
 *
 * @param {boolean} friendListOpen
 */
export function useFriendListSync(friendListOpen) {
  const friends               = useFriendStore((state) => state.friends)
  const incomingRequests      = useFriendStore((state) => state.incomingRequests)
  const fetchFriendsFromStore = useFriendStore((state) => state.fetchFriends)
  const fetchIncomingFromStore = useFriendStore((state) => state.fetchIncomingRequests)
  const removeIncomingRequest = useFriendStore((state) => state.removeIncomingRequest)
  const setIncomingRequests   = useFriendStore((state) => state.setIncomingRequests)

  useEffect(() => {
    if (!friendListOpen) return
    fetchFriendsFromStore()
    fetchIncomingFromStore()
  }, [friendListOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefreshFriends = async () => {
    await Promise.all([fetchFriendsFromStore(), fetchIncomingFromStore()])
  }

  const handleAcceptRequest = async (requestId) => {
    try {
      await acceptFriendRequest(requestId)
      removeIncomingRequest(requestId) // 낙관적 제거 — 서버 재조회 없이 즉시 반영
      fetchFriendsFromStore()
    } catch (error) {
      console.error("친구 수락 실패:", error.message)
    }
  }

  const handleDeclineRequest = async (requestId) => {
    try {
      await declineFriendRequest(requestId)
      removeIncomingRequest(requestId)
    } catch (error) {
      console.error("친구 거절 실패:", error.message)
    }
  }

  const handleAcceptAll = async () => {
    try {
      await Promise.all(incomingRequests.map((r) => acceptFriendRequest(r.request_id)))
      setIncomingRequests([])
      fetchFriendsFromStore()
    } catch (error) {
      console.error("전체 수락 실패:", error.message)
    }
  }

  return {
    onlineFriends: friends.filter((f) => f.online && !f.isFavorite),
    offlineFriends: friends.filter((f) => !f.online && !f.isFavorite),
    favoriteFriends: friends.filter((f) => f.isFavorite),
    incomingRequests,
    handleRefreshFriends,
    handleAcceptRequest,
    handleDeclineRequest,
    handleAcceptAll,
  }
}
