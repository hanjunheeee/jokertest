import { useCallback, useEffect, useRef, useState } from "react"
import {
  searchFriendCandidates,
  sendFriendRequest,
} from "@/domains/lobby/api/friend.api.js"
import { useFriendStore } from "@/domains/lobby/store/friend.store"
import { filterVisibleFriendCandidates } from "@/domains/lobby/utils/filterVisibleFriendCandidates.js"

const FRIEND_SEARCH_DEBOUNCE_MS = 300

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

  const searchRequestIdRef = useRef(0)
  const debounceTimeoutRef = useRef(null)

  const runSearch = useCallback(async (searchQuery) => {
    const trimmedQuery = searchQuery.trim()

    if (!trimmedQuery) {
      setResults([])
      setErrorMsg("")
      setSearching(false)
      return
    }

    // 새 검색을 시작하면 이전 검색에서 숨겼던 처리 완료 결과를 초기화합니다.
    clearResolvedRequests()

    const requestId = ++searchRequestIdRef.current
    setSearching(true)
    setErrorMsg("")

    try {
      const data = await searchFriendCandidates(trimmedQuery)
      if (requestId !== searchRequestIdRef.current) return
      setResults(data)
    } catch (err) {
      if (requestId !== searchRequestIdRef.current) return
      setResults([])
      setErrorMsg(err.message || "검색 중 오류가 발생했습니다.")
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setSearching(false)
      }
    }
  }, [clearResolvedRequests])

  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }

    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      setResults([])
      setErrorMsg("")
      setSearching(false)
      return undefined
    }

    setSearching(true)

    debounceTimeoutRef.current = setTimeout(() => {
      runSearch(query)
    }, FRIEND_SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
    }
  }, [query, runSearch])

  const handleSearch = () => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current)
    }
    runSearch(query)
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
