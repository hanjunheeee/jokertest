export function isValidInGameSession(gameId, gameState) {
  if (!gameId) return false
  if (gameState === null || typeof gameState !== "object") return false
  return gameState.id === gameId
}

export function shouldRedirectOutOfInGame({ snapshotSyncStatus, gameId, gameState }) {
  if (snapshotSyncStatus === "checking") return false
  return !isValidInGameSession(gameId, gameState)
}
