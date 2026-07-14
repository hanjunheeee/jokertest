// 파일 역할: filterVisibleFriendCandidates.js - 여러 곳에서 재사용하는 유틸 함수입니다.
// 수락/거절 등으로 이미 처리된 친구 후보는 검색 결과 화면에서 숨깁니다.
export const filterVisibleFriendCandidates = (results, resolvedRequestIds) => {
  return results.filter((user) => !resolvedRequestIds.has(user.id))
}
