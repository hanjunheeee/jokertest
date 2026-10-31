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

export function filterFriendListItems(items, query, fields) {
  const normalizedQuery = normalizeFriendListFilterQuery(query)
  if (!normalizedQuery) return items

  return items.filter((item) => itemMatchesFriendListFilter(item, normalizedQuery, fields))
}

export function mergeFriendGroups({ onlineFriends, offlineFriends, favoriteFriends }) {
  return [...onlineFriends, ...offlineFriends, ...favoriteFriends]
}
