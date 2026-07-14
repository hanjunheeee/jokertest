// 친구 목록을 화면에서 보여줄 그룹별로 나눕니다.
export const groupFriends = (friends) => {
  return {
    // 즐겨찾기가 아닌 일반 온라인 친구입니다.
    onlineFriends: friends.filter((friend) => friend.online && !friend.isFavorite),

    // 즐겨찾기가 아닌 일반 오프라인 친구입니다.
    offlineFriends: friends.filter((friend) => !friend.online && !friend.isFavorite),

    // 즐겨찾기 친구입니다. 온라인/오프라인 그룹과 별도로 보여주기 위해 분리합니다.
    favoriteFriends: friends.filter((friend) => friend.isFavorite),
  }
}
