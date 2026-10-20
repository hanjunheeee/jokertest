/** game-core DAY_PHASES와 값이 일치해야 한다. */
export const INGAME_DAY_PHASES = Object.freeze({
  DISCUSSION: "DAY_DISCUSSION",
  VOTE: "DAY_VOTE",
})

/**
 * 낮 하위 구간을 canonical 값으로 정규화한다.
 *
 * backend getDayPhase와 같은 fail-closed 규칙 — phase !== "DAY"이거나 알 수 없는 값이면
 * 투표를 열지 않고 토론으로 본다.
 *
 * @param {{ phase?: string|null, dayPhase?: string|null }|null|undefined} gameState
 * @returns {"DAY_DISCUSSION"|"DAY_VOTE"|null}
 */
export function resolveInGameDayPhase(gameState) {
  if (!gameState || gameState.phase !== "DAY") return null
  if (gameState.dayPhase === INGAME_DAY_PHASES.VOTE) return INGAME_DAY_PHASES.VOTE
  return INGAME_DAY_PHASES.DISCUSSION
}
