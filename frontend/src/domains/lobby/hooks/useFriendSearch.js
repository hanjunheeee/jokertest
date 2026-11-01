// 친구 추가 탭 검색 훅 (닉네임 검색·친구 신청 보내기·응답 끝난 대상 빼기)
// FriendRequestTab이 씀
import { useRef, useState } from "react"
import {
  searchFriendCandidates,
  sendFriendRequest,
} from "@/domains/lobby/api/friend.api.js"
import { useFriendStore } from "@/domains/lobby/store/friend.store"
import { filterVisibleFriendCandidates } from "@/domains/lobby/utils/friendList.js"

// 검색어·결과·보낸 신청 표시 묶음, 옛 검색·다른 계정 응답은 버림
export function useFriendSearch() {
  const sentRequestIds = useFriendStore((state) => state.sentRequestIds)
  const resolvedRequestIds = useFriendStore((state) => state.resolvedRequestIds)
  const addSentRequest = useFriendStore((state) => state.addSentRequest)
  const clearResolvedRequests = useFriendStore((state) => state.clearResolvedRequests)
  const syncAccount = useFriendStore((state) => state.syncAccount)
  const isCurrentAccount = useFriendStore((state) => state.isCurrent)

  const [query, setQuery] = useState("")

  const [results, setResults] = useState([])

  const [searching, setSearching] = useState(false)

  const [errorMsg, setErrorMsg] = useState("")

  // 검색 번호 (새 검색마다 올림)
  const searchGenerationRef = useRef(0)

  // 검색: 늦게 온 옛 검색 응답은 번호로 가려 버림
  const handleSearch = async () => {
    const trimmedQuery = query.trim()

    // 빈 검색어면 안 보냄
    if (!trimmedQuery) return

    // 지난 검색 뒤 응답 끝난 신청 기록 비움
    clearResolvedRequests()

    const accountGeneration = syncAccount()
    searchGenerationRef.current += 1
    const searchGeneration = searchGenerationRef.current

    const isStale = () =>
      searchGenerationRef.current !== searchGeneration || !isCurrentAccount(accountGeneration)

    setSearching(true)
    setErrorMsg("")

    try {
      const data = await searchFriendCandidates(trimmedQuery)
      if (isStale()) return
      setResults(data)
      setErrorMsg("")
    } catch (err) {
      if (isStale()) return
      setResults([])
      setErrorMsg(err.message || "검색 중 오류가 발생했습니다.")
    } finally {
      // 옛 검색이면 로딩 표시는 새 검색이 끔
      if (!isStale()) setSearching(false)
    }
  }

  // 친구 신청: 보낸 뒤 그 줄을 보낸 상태로 표시
  const handleSend = async (receiverId) => {
    const accountGeneration = syncAccount()
    try {
      await sendFriendRequest(receiverId)
      if (!isCurrentAccount(accountGeneration)) return

      addSentRequest(receiverId)
    } catch (err) {
      if (!isCurrentAccount(accountGeneration)) return
      console.error("친구 신청 실패:", err)
      setErrorMsg(err.message || "친구 신청에 실패했습니다.")
    }
  }

  // 상대가 응답 끝낸 신청 대상은 검색 결과에서 뺌
  const visibleResults = filterVisibleFriendCandidates(results, resolvedRequestIds)

  // 검색어가 있을 때만 결과 목록을 보임
  const isSearching = query.trim().length > 0

  return {
    query,
    setQuery,
    results: visibleResults,
    searching,
    isSearching,
    sentIds: sentRequestIds,
    errorMsg,
    handleSearch,
    handleSend,
  }
}
