export function isInGameSelfPlayer(playerId, localPlayerId) {
  return (
    typeof playerId === "string" &&
    playerId.length > 0 &&
    typeof localPlayerId === "string" &&
    localPlayerId.length > 0 &&
    playerId === localPlayerId
  )
}
