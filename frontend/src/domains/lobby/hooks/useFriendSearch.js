import { useState } from "react"
import {
  searchFriendCandidates,
  sendFriendRequest,
} from "@/domains/lobby/api/friend.api.js"
import { useFriendStore } from "@/domains/lobby/store/friend.store"
import { filterVisibleFriendCandidates } from "@/domains/lobby/utils/filterVisibleFriendCandidates.js"

// 친구 검색창에서 필요한 상태와 동작을 한 번에 꺼내 쓰게 해주는 조립용 훅입니다.
export function useFriendSearch() {
  const sentRequestIds = useFriendStore((state) => state.sentRequestIds)
  const resolvedRequestIds = useFriendStore((state) => state.resolvedRequestIds)
  const addSentRequest = useFriendStore((state) => state.addSentRequest)
  const clearResolvedRequests = useFriendStore((state) => state.clearResolvedRequests)

  // 친구 검색창에 입력한 검색어입니다.
  const [query, setQuery] = useState("")

  // 서버에서 받은 친구 검색 결과 원본입니다.
  const [results, setResults] = useState([])

  // 친구 검색 요청이 진행 중인지 표시합니다.
  const [searching, setSearching] = useState(false)

  // 검색 실패 시 화면에 보여줄 에러 메시지입니다.
  const [errorMsg, setErrorMsg] = useState("")

  const handleSearch = async () => {
    const trimmedQuery = query.trim()

    // 검색어가 비어 있으면 서버 요청을 보내지 않습니다.
    if (!trimmedQuery) return

    // 새 검색을 시작하면 이전 검색에서 숨겼던 처리 완료 결과를 초기화합니다.
    clearResolvedRequests()

    setSearching(true)
    setErrorMsg("")

    try {
      const data = await searchFriendCandidates(trimmedQuery)
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

      // 신청 성공 후 같은 사용자에게 또 신청하지 못하게 보낸 요청 목록에 표시합니다.
      addSentRequest(receiverId)
    } catch (err) {
      console.error("친구 신청 실패:", err)
    }
  }

  const visibleResults = filterVisibleFriendCandidates(results, resolvedRequestIds)

  return {
    query,
    setQuery,
    results: visibleResults,
    searching,
    sentIds: sentRequestIds,
    errorMsg,
    handleSearch,
    handleSend,
  }
}
