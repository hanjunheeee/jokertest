// 친구 목록 탭 안 글자 거르기 계산 (서버 안 부름)
// 친구 목록 탭(FriendListTabContent)·거르기 훅(useFriendListLocalFilter)·시험이 씀

// 검색어 앞뒤 공백 빼고 소문자로 맞춤
function normQuery(query) {
  return query.trim().toLowerCase()
}

// 고른 칸 중 하나라도 검색어를 품으면 맞음 (빈 칸은 건너뜀)
function matchesFilter(item, normalizedQuery, fields) {
  return fields.some((field) => {
    const value = item?.[field]
    if (value == null) return false
    return String(value).toLowerCase().includes(normalizedQuery)
  })
}

// 검색어가 비면 목록 그대로, 아니면 맞는 줄만
export function filterFriendListItems(items, query, fields) {
  const normalizedQuery = normQuery(query)
  if (!normalizedQuery) return items

  return items.filter((item) => matchesFilter(item, normalizedQuery, fields))
}

// 검색할 때 접속·오프라인·즐겨찾기 묶음을 한 목록으로 합침
export function mergeFriendGroups({ onlineFriends, offlineFriends, favoriteFriends }) {
  return [...onlineFriends, ...offlineFriends, ...favoriteFriends]
}
