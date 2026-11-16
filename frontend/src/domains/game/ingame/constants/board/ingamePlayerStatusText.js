// 플레이어 상태의 화면 읽기용 이름 (그림만으로는 상태를 모르니 글로도 줌)
// 카드 상태 표시(InGamePlayerStatusOverlay)·카드 판(동료 카드 읽기 이름)이 사용

// 상태 값 → 읽을 글 (생존은 글 없음)
export const INGAME_PLAYER_STATUS_TEXT = Object.freeze({
  dead: "사망",
  disconnected: "연결 끊김",
})
