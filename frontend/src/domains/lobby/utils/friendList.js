// 친구 목록 다듬기: 즐겨찾기 표시, 접속·즐겨찾기 묶음, 처리한 검색 후보 빼기
// 친구 목록 동기화 훅·친구 검색 훅·시험이 사용

// 즐겨찾기 id 모음으로 친구마다 isFavorite 붙임
export function applyFriendFavoriteFlags(friends, favoriteFriendIds) {
  return friends.map((friend) => ({
    ...friend,
    isFavorite: favoriteFriendIds.has(friend.id),
  }))
}

// 접속 중·접속 안 함·즐겨찾기로 나눔 (즐겨찾기는 앞 두 묶음에서 빠짐)
export const groupFriends = (friends) => {
  return {
    onlineFriends: friends.filter((friend) => friend.online && !friend.isFavorite),

    offlineFriends: friends.filter((friend) => !friend.online && !friend.isFavorite),

    favoriteFriends: friends.filter((friend) => friend.isFavorite),
  }
}

// 상대가 응답 끝낸 신청 대상은 검색 결과에서 뺌
export const filterVisibleFriendCandidates = (results, resolvedRequestIds) => {
  return results.filter((user) => !resolvedRequestIds.has(user.id))
}
