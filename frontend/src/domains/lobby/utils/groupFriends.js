export const groupFriends = (friends) => {
  return {
    onlineFriends: friends.filter((friend) => friend.online && !friend.isFavorite),

    offlineFriends: friends.filter((friend) => !friend.online && !friend.isFavorite),

    favoriteFriends: friends.filter((friend) => friend.isFavorite),
  }
}
