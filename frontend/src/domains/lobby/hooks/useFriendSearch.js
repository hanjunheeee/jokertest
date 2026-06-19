import { useState } from "react"
import { searchFriendCandidates, sendFriendRequest } from "@/domains/lobby/api/friend.js"
import { useFriendStore } from "@/domains/lobby/store/friendStore"

/**
 * 친구 검색 및 신청 상태 관리 훅.
 *
 * sentRequestIds를 로컬 state 대신 friendStore에서 읽는 이유:
 *   useSocket이 수락/거절 이벤트를 받으면 스토어의 removeSentRequest를 호출합니다.
 *   로컬 state였다면 소켓 핸들러에서 이 훅 내부의 state를 바꿀 방법이 없습니다.
 */
export function useFriendSearch() {
  const sentRequestIds      = useFriendStore((state) => state.sentRequestIds)
  const resolvedRequestIds  = useFriendStore((state) => state.resolvedRequestIds)
  const addSentRequest      = useFriendStore((state) => state.addSentRequest)
  const clearResolvedRequests = useFriendStore((state) => state.clearResolvedRequests)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  const handleSearch = async () => {
    if (!query.trim()) return
    clearResolvedRequests() // 새 검색마다 이전 수락/거절 필터 초기화
    setSearching(true)
    setErrorMsg("")
    try {
      const data = await searchFriendCandidates(query.trim())
      setResults(data)
    } catch (err) {
      setResults([])
      setErrorMsg(err.message || "검색 중 오류가 발생했습니다.")
    } finally {
      setSearching(false)
    }
  }

  const handleSend = async (receiverId) => {
    try {
      await sendFriendRequest(receiverId)
      addSentRequest(receiverId)
    } catch (err) {
      console.error("친구 신청 실패:", err)
    }
  }

  // 수락/거절 처리된 UUID는 재검색 전까지 목록에서 숨김
  const visibleResults = results.filter((u) => !resolvedRequestIds.has(u.id))

  return {
    query,
    setQuery,
    results: visibleResults,
    searching,
    sentIds: sentRequestIds, // FriendRequestTab의 prop 이름과 맞춤
    errorMsg,
    handleSearch,
    handleSend,
  }
}
