// 친구 검색 결과 줄의 접속 상태 글자
// RecommendedFriendStatus가 씀

// 서버가 모르는 상태를 주면 UNKNOWN 글자를 씀
export const STATUS_TEXT = Object.freeze({
  ONLINE: "접속 중",
  OFFLINE: "오프라인",
  UNKNOWN: "상태 확인 불가",
})
