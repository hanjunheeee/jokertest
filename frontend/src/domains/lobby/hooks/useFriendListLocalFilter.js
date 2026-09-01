import { useMemo, useState } from "react"
import { filterFriendListItems } from "@/domains/lobby/utils/filterFriendListItems.js"

/** 친구 목록·요청 수락 탭에서 쓰는 로컬 닉네임/ID 필터 훅입니다. */
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
