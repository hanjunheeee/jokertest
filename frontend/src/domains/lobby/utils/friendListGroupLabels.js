// 친구 목록에서 온라인으로 볼 수 있는 친구 수를 셉니다.
export const countOnlineFriends = (friends) => {
  return friends.filter((friend) => friend.online || friend.status === "ONLINE").length
}

// 일반 친구 그룹 제목을 만듭니다.
export const getNormalFriendLabel = (friends) => {
  return `일반 (${countOnlineFriends(friends)}/${friends.length})`
}

// 오프라인 친구 그룹 제목을 만듭니다.
export const getOfflineFriendLabel = (friends) => {
  return `오프라인 (${friends.length})`
}

// 즐겨찾기 친구 그룹 제목을 만듭니다.
export const getFavoriteFriendLabel = (friends) => {
  return `즐겨찾기 (${countOnlineFriends(friends)}/${friends.length})`
}
