// 결과 화면 → 대기방 복귀 중에는 대기방→인게임 자동 이동을 잠깐 막음 (끝난 판 id·스냅샷이 남아 /ingame→/gameresult로 루프 나는 것 방지)
let blockedUntil = 0

export function beginBlockInGameNavFromResultReturn(durationMs = 8000) {
  blockedUntil = Date.now() + Math.max(0, durationMs)
}

export function clearBlockInGameNavFromResultReturn() {
  blockedUntil = 0
}

export function isInGameNavBlockedFromResultReturn() {
  return Date.now() < blockedUntil
}