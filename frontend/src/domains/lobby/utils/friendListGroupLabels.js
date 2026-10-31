export const countOnlineFriends = (friends) => {
  return friends.filter((friend) => friend.online || friend.status === "ONLINE").length
}

export const getNormalFriendLabel = (friends) => {
  return `일반 (${countOnlineFriends(friends)}/${friends.length})`
}

export const getOfflineFriendLabel = (friends) => {
  return `오프라인 (${friends.length})`
}

export const getFavoriteFriendLabel = (friends) => {
  return `즐겨찾기 (${friends.length})`
}
