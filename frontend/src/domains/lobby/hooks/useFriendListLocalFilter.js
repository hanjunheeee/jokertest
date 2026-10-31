import { useMemo, useState } from "react"
import { filterFriendListItems } from "../utils/filterFriendListItems.js"

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
