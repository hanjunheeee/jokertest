// 인게임 화면 지키기: 맞는 판인지, 밖으로 보낼지
// 인게임 화면(InGamePage)이 사용

// 스토어의 판 id와 판 상태 id가 같아야 맞는 판
export function isValidInGameSession(gameId, gameState) {
  if (!gameId) return false
  if (gameState === null || typeof gameState !== "object") return false
  return gameState.id === gameId
}

// 스냅샷 확인 중이면 기다림, 그 밖엔 맞는 판이 아니면 밖으로 보냄
export function shouldRedirectOutOfInGame({ snapshotSyncStatus, gameId, gameState }) {
  if (snapshotSyncStatus === "checking") return false
  return !isValidInGameSession(gameId, gameState)
}
