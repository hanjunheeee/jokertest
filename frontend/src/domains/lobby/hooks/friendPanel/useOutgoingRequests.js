// 친구 추가 탭의 보낸 신청 목록 값·취소 처리 (탭을 열 때 목록을 받음)
// 데스크톱 FriendRequestTab·모바일 AddTab이 씀
import { useEffect } from "react"
import { useFriendStore } from "../../store/friend.store.js"

// 목록·오류·취소 중 표시는 스토어에서 고르고, 취소는 스토어 액션을 그대로 넘김 (연타 막기·실패 문구는 액션이 함)
export function useOutgoingRequests() {
  const outgoingRequests = useFriendStore((state) => state.outgoingRequests)
  const outgoingError = useFriendStore((state) => state.outgoingError)
  const cancelingIds = useFriendStore((state) => state.cancelPendingIds)
  const cancelErrors = useFriendStore((state) => state.cancelErrors)
  const fetchOutgoingRequests = useFriendStore((state) => state.fetchOutgoingRequests)
  const cancelSentRequest = useFriendStore((state) => state.cancelSentRequest)

  // 탭을 열 때마다 새로 받음 (차단 탭과 같음)
  useEffect(() => {
    fetchOutgoingRequests()
  }, [fetchOutgoingRequests])

  return {
    outgoingRequests,
    outgoingError,
    cancelingIds,
    cancelErrors,
    handleCancel: cancelSentRequest,
  }
}
