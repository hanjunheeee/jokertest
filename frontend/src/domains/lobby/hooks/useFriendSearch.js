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
  // useFriendStore(selector)로 전역 스토어에서 필요한 값/액션만 구독 (authStore와 같은 Zustand 패턴)
  const sentRequestIds      = useFriendStore((state) => state.sentRequestIds)
  const resolvedRequestIds  = useFriendStore((state) => state.resolvedRequestIds)
  const addSentRequest      = useFriendStore((state) => state.addSentRequest)
  const clearResolvedRequests = useFriendStore((state) => state.clearResolvedRequests)

  // useState(초기값)은 [현재값, 값을 바꾸는 함수]를 반환하는 훅으로, 이 훅을 사용하는
  // 컴포넌트가 리렌더링될 때도 값을 유지시켜 줍니다. 아래 네 개는 이 훅만의 로컬 상태입니다.
  // query: 검색창 입력값
  const [query, setQuery] = useState("")
  // results: 서버에서 받아온 검색 결과 원본 배열
  const [results, setResults] = useState([])
  // searching: 검색 요청이 진행 중인지 여부 (로딩 표시용)
  const [searching, setSearching] = useState(false)
  // errorMsg: 검색 실패 시 표시할 에러 메시지
  const [errorMsg, setErrorMsg] = useState("")

  /** 검색어로 후보를 조회하고 결과/에러/로딩 상태를 갱신 */
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

  /** receiverId에게 친구 요청을 보내고, 성공 시 스토어에 sentRequestIds로 기록 */
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
