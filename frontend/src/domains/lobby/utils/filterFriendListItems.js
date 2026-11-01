function normQuery(query) {
  return query.trim().toLowerCase()
}

function matchesFilter(item, normalizedQuery, fields) {
  return fields.some((field) => {
    const value = item?.[field]
    if (value == null) return false
    return String(value).toLowerCase().includes(normalizedQuery)
  })
}

export function filterFriendListItems(items, query, fields) {
  const normalizedQuery = normQuery(query)
  if (!normalizedQuery) return items

  return items.filter((item) => matchesFilter(item, normalizedQuery, fields))
}

export function mergeFriendGroups({ onlineFriends, offlineFriends, favoriteFriends }) {
  return [...onlineFriends, ...offlineFriends, ...favoriteFriends]
}
