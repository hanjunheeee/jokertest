export function selectInGameDeadParticipantChoice(gameState, authUuid) {
  if (gameState === null || typeof gameState !== "object") return false
  if (gameState.phase === "ENDED") return false
  if (typeof authUuid !== "string" || authUuid.length === 0) return false

  const selfUuid = gameState.self?.uuid ?? null
  if (selfUuid !== authUuid) return false

  const seated = (gameState.players ?? []).find((player) => player?.uuid === authUuid)
  if (!seated) return false
  if (seated.alive !== false) return false
  if (seated.isParticipating === false) return false
  return true
}
