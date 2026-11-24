// 대기방 화면을 그리는 중 판이 이미 시작됐으면 인게임으로 보냄 (파티 재입장·ENDED는 제외)
export function shouldLeaveMatchingForInGame(gameId, gameState) {
  if (typeof gameId !== "string" || gameId.length === 0) return false
  if (!gameState || typeof gameState !== "object") return false
  if (gameState.id !== gameId) return false
  if (gameState.phase === "ENDED") return false
  return true
}