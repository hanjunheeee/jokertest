export function applyFriendFavoriteFlags(friends, favoriteFriendIds) {
  return friends.map((friend) => ({
    ...friend,
    isFavorite: favoriteFriendIds.has(friend.id),
  }))
}
