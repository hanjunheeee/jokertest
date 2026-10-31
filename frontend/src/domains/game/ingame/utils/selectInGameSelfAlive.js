import { isSessionPlayerAlive } from "./buildDayVoteTargets.js"

export function selectInGameSelfAlive(state) {
  const selfUuid = state?.self?.uuid
  if (typeof selfUuid !== "string" || selfUuid.length === 0) return null

  const players = state?.players
  if (!Array.isArray(players)) return null

  const selfEntry = players.find((player) => player?.uuid === selfUuid)
  if (!selfEntry || typeof selfEntry.alive !== "boolean") return null

  return selfEntry.alive
}

export function resolveInGameSelfAliveForControls(state, localSessionPlayer) {
  const canonicalAlive = selectInGameSelfAlive(state)
  if (canonicalAlive !== null) return canonicalAlive

  return isSessionPlayerAlive(localSessionPlayer)
}
