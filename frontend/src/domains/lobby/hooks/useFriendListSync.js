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
  // useFriendStore(selector)는 Zustand 전역 스토어에서 필요한 값/함수만 뽑아 구독하는 방식입니다.
  // (authStore와 같은 패턴) 아래처럼 값 하나씩 선택하면 그 값이 바뀔 때만 리렌더링됩니다.
  const friends               = useFriendStore((state) => state.friends)
  const incomingRequests      = useFriendStore((state) => state.incomingRequests)
  const fetchFriendsFromStore = useFriendStore((state) => state.fetchFriends)
  const fetchIncomingFromStore = useFriendStore((state) => state.fetchIncomingRequests)
  const removeIncomingRequest = useFriendStore((state) => state.removeIncomingRequest)
  const setIncomingRequests   = useFriendStore((state) => state.setIncomingRequests)

  // useEffect(콜백, 의존성배열)는 렌더링 이후에 부수효과(여기서는 API 호출)를 실행하는 훅입니다.
  // 의존성 배열([friendListOpen])에 있는 값이 바뀔 때마다 콜백이 다시 실행됩니다.
  // 여기서는 friendListOpen이 true로 바뀌는 시점(패널이 열리는 순간)에 최신 데이터를 불러옵니다.
  useEffect(() => {
    if (!friendListOpen) return
    fetchFriendsFromStore()
    fetchIncomingFromStore()
  }, [friendListOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 새로고침 버튼용 — 친구 목록과 받은 요청 목록을 동시에 재조회 */
  const handleRefreshFriends = async () => {
    await Promise.all([fetchFriendsFromStore(), fetchIncomingFromStore()])
  }

  /** 요청 하나 수락: API 호출 후 스토어에서 즉시 제거하고 친구 목록을 갱신 */
  const handleAcceptRequest = async (requestId) => {
    try {
      await acceptFriendRequest(requestId)
      removeIncomingRequest(requestId) // 낙관적 제거 — 서버 재조회 없이 즉시 반영
      fetchFriendsFromStore()
    } catch (error) {
      console.error("친구 수락 실패:", error.message)
    }
  }

  /** 요청 하나 거절: API 호출 후 스토어에서 즉시 제거 */
  const handleDeclineRequest = async (requestId) => {
    try {
      await declineFriendRequest(requestId)
      removeIncomingRequest(requestId)
    } catch (error) {
      console.error("친구 거절 실패:", error.message)
    }
  }

  /** 받은 요청 전체 수락: 모든 요청을 병렬로 수락 API 호출 후 목록을 비우고 친구 목록 갱신 */
  const handleAcceptAll = async () => {
    try {
      await Promise.all(incomingRequests.map((r) => acceptFriendRequest(r.request_id)))
      setIncomingRequests([])
      fetchFriendsFromStore()
    } catch (error) {
      console.error("전체 수락 실패:", error.message)
    }
  }

  // friends를 온라인/오프라인/즐겨찾기 세 그룹으로 나누고, 핸들러 함수들과 함께
  // LobbyPage에 넘겨줄 형태로 반환합니다.
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
