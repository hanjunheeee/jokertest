// 대기방 화면을 그리는 중 판이 이미 시작됐으면 인게임으로 보냄 (파티 재입장·ENDED는 제외)
export function shouldLeaveMatchingForInGame(gameId, gameState) {
  if (typeof gameId !== "string" || gameId.length === 0) return false
  if (!gameState || typeof gameState !== "object") return false
  if (gameState.id !== gameId) return false
  if (gameState.phase === "ENDED") return false
  return true
}

// 지금 판이 있는지 (끝난 판 ENDED 포함) — 대기방에서 목록으로 내보내기 전에 봄
// 판 시작 직후 곧바로 끝나면(광대 나감 등) 인게임 이동이 화면에 반영되기 전에 ENDED가 와서 목록으로 튀던 것 막음
export function hasCurrentInGame(gameId, gameState) {
  if (typeof gameId !== "string" || gameId.length === 0) return false
  if (!gameState || typeof gameState !== "object") return false
  return gameState.id === gameId
}