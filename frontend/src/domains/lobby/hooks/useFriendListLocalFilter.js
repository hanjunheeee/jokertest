// 친구 목록·받은 신청 탭 안 글자 거르기 훅 (서버 안 부름)
// FriendListTabContent·FriendAcceptTab이 씀
import { useMemo, useState } from "react"
import { filterFriendListItems } from "../utils/filterFriendListItems.js"

// 검색어로 목록 거름, 검색어가 있을 때만 거르는 중으로 봄
export function useFriendListLocalFilter(items, fields) {
  const [query, setQuery] = useState("")
  const trimmedQuery = query.trim()
  const isFiltering = trimmedQuery.length > 0

  const filteredItems = useMemo(
    () => filterFriendListItems(items, trimmedQuery, fields),
    [items, trimmedQuery, fields],
  )

  return {
    query,
    setQuery,
    isFiltering,
    filteredItems,
  }
}
