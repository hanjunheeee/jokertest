export const filterVisibleFriendCandidates = (results, resolvedRequestIds) => {
  return results.filter((user) => !resolvedRequestIds.has(user.id))
}
