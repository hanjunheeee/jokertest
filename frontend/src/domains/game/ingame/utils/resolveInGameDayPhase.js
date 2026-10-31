export const INGAME_DAY_PHASES = Object.freeze({
  DISCUSSION: "DAY_DISCUSSION",
  VOTE: "DAY_VOTE",
})

export function resolveInGameDayPhase(gameState) {
  if (!gameState || gameState.phase !== "DAY") return null
  if (gameState.dayPhase === INGAME_DAY_PHASES.VOTE) return INGAME_DAY_PHASES.VOTE
  return INGAME_DAY_PHASES.DISCUSSION
}
