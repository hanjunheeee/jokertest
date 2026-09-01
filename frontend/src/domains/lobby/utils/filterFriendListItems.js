function normalizeFriendListFilterQuery(query) {
  return query.trim().toLowerCase()
}

function itemMatchesFriendListFilter(item, normalizedQuery, fields) {
  return fields.some((field) => {
    const value = item?.[field]
    if (value == null) return false
    return String(value).toLowerCase().includes(normalizedQuery)
  })
}

/** 로컬 필터 — query가 비어 있으면 items 전체를 반환합니다. */
export function filterFriendListItems(items, query, fields) {
  const normalizedQuery = normalizeFriendListFilterQuery(query)
  if (!normalizedQuery) return items

  return items.filter((item) => itemMatchesFriendListFilter(item, normalizedQuery, fields))
}

/** 기본 탭 검색 결과용 — 그룹별 친구 목록을 하나로 합칩니다. */
export function mergeFriendGroups({ onlineFriends, offlineFriends, favoriteFriends }) {
  return [...onlineFriends, ...offlineFriends, ...favoriteFriends]
}
