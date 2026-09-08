/** 프론트 즐겨찾기 Set을 친구 목록 항목에 반영합니다. */
export function applyFriendFavoriteFlags(friends, favoriteFriendIds) {
  return friends.map((friend) => ({
    ...friend,
    isFavorite: favoriteFriendIds.has(friend.id),
  }))
}
