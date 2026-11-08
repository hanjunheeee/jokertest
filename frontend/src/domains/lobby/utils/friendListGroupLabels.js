// 친구 폴더 이름 글자 (접속 수/전체 수)
// FriendListGroupFolders가 씀

// online 칸이나 status ONLINE이면 접속으로 셈
export const countOnlineFriends = (friends) => {
  return friends.filter((friend) => friend.online || friend.status === "ONLINE").length
}

// 일반 폴더: 접속 수/전체 수 (폴더엔 접속 중만 들어와 늘 n/n이라, 전체는 즐겨찾기 뺀 친구 수를 따로 받음)
export const getNormalFriendLabel = (friends, total = friends.length) => {
  return `일반 (${countOnlineFriends(friends)}/${total})`
}

// 오프라인 폴더: 전체 수
export const getOfflineFriendLabel = (friends) => {
  return `오프라인 (${friends.length})`
}

// 즐겨찾기 폴더: 전체 수
export const getFavoriteFriendLabel = (friends) => {
  return `즐겨찾기 (${friends.length})`
}
