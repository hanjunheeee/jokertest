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

  // 마지막으로 검색 버튼을 누른 검색어, 누르기 전·검색어 바꾼 뒤엔 결과·"없음"을 안 보이게 함
  const [searchedQuery, setSearchedQuery] = useState(null)

  // 신청 보내는 중인 대상 (연타로 같은 신청 여러 번 나가는 것 막기), 신청 실패 문구 (대상 id → 문구)
  const [sendingIds, setSendingIds] = useState(() => new Set())
  const [sendErrors, setSendErrors] = useState(() => ({}))
  const sendingRef = useRef(new Set())

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
    setSearchedQuery(trimmedQuery)

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
      // 더 새 검색이 있으면 로딩 표시는 그쪽이 끔, 계정만 바뀐 경우는 여기서 끔(안 꺼지는 것 막기)
      if (searchGenerationRef.current === searchGeneration) setSearching(false)
    }
  }

  // 친구 신청: 보낸 뒤 그 줄을 보낸 상태로 표시
  // 실패 문구는 줄마다 둠: 검색 결과가 있으면 빈 상태 줄이 안 그려져 errorMsg로는 안 보였음
  const handleSend = async (receiverId) => {
    if (sendingRef.current.has(receiverId)) return
    sendingRef.current.add(receiverId)
    setSendingIds(new Set(sendingRef.current))
    setSendErrors((previous) => {
      if (!(receiverId in previous)) return previous
      const next = { ...previous }
      delete next[receiverId]
      return next
    })
    const accountGeneration = syncAccount()
    try {
      await sendFriendRequest(receiverId)
      if (!isCurrentAccount(accountGeneration)) return

      addSentRequest(receiverId)
    } catch (err) {
      if (!isCurrentAccount(accountGeneration)) return
      console.error("친구 신청 실패:", err)
      setSendErrors((previous) => ({ ...previous, [receiverId]: err?.message || "친구 신청에 실패했습니다." }))
    } finally {
      sendingRef.current.delete(receiverId)
      setSendingIds(new Set(sendingRef.current))
    }
  }

  // 상대가 응답 끝낸 신청 대상은 검색 결과에서 뺌
  const visibleResults = filterVisibleFriendCandidates(results, resolvedRequestIds)

  // 검색어가 있고 그 검색어로 검색했을 때만 결과 목록을 보임
  const trimmed = query.trim()
  const isSearching = trimmed.length > 0 && trimmed === searchedQuery

  return {
    query,
    setQuery,
    results: visibleResults,
    searching,
    isSearching,
    sentIds: sentRequestIds,
    errorMsg,
    sendingIds,
    sendErrors,
    handleSearch,
    handleSend,
  }
}
