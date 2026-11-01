import { useRef, useState } from "react"
import {
  searchFriendCandidates,
  sendFriendRequest,
} from "@/domains/lobby/api/friend.api.js"
import { useFriendStore } from "@/domains/lobby/store/friend.store"
import { filterVisibleFriendCandidates } from "@/domains/lobby/utils/friendList.js"

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

  const searchGenerationRef = useRef(0)

  const handleSearch = async () => {
    const trimmedQuery = query.trim()

    if (!trimmedQuery) return

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
      if (!isStale()) setSearching(false)
    }
  }

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
