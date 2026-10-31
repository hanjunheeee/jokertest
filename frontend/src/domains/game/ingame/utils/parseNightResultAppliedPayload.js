import { normalizePublicWinResult } from "./normalizePublicWinResult.js"

export function parseNightResultAppliedPayload({ payload, gameId, dayIndex, canonicalPlayerIds, previouslyDeadUuids }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  const { gameId: payloadGameId, phase, dayIndex: payloadDayIndex, players, victimUuid } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (!gameId || payloadGameId !== gameId) return null
  if (!(canonicalPlayerIds instanceof Set) || canonicalPlayerIds.size === 0) return null

  if (phase === "ENDED") {
    if (!Number.isInteger(payloadDayIndex)) return null
    if (typeof dayIndex !== "number" || payloadDayIndex !== dayIndex) return null
    if (!Array.isArray(players)) return null
    if (victimUuid !== null && typeof victimUuid !== "string") return null
    if (!Object.hasOwn(payload, "winResult") || payload.winResult === null) {
      return null
    }
    const winResult = normalizePublicWinResult(payload.winResult)
    if (winResult === null) {
      return null
    }

    const seenEndedUuids = new Set()
    const normalizedEndedPlayers = []
    for (const player of players) {
      if (player === null || typeof player !== "object" || Array.isArray(player)) return null
      if (typeof player.uuid !== "string" || player.uuid.length === 0) return null
      if (typeof player.isAlive !== "boolean") return null
      if (seenEndedUuids.has(player.uuid)) return null
      seenEndedUuids.add(player.uuid)
      normalizedEndedPlayers.push({ uuid: player.uuid, isAlive: player.isAlive })
    }
    if (seenEndedUuids.size !== canonicalPlayerIds.size) return null
    for (const uuid of seenEndedUuids) {
      if (!canonicalPlayerIds.has(uuid)) return null
    }
    if (victimUuid !== null && !canonicalPlayerIds.has(victimUuid)) return null

    return {
      gameId: payloadGameId,
      phase: "ENDED",
      dayIndex: payloadDayIndex,
      players: normalizedEndedPlayers,
      victimUuid,
      winResult,
    }
  }

  if (phase !== "DAY") return null
  if (!Number.isInteger(payloadDayIndex)) return null
  if (!Array.isArray(players)) return null
  if (victimUuid !== null && typeof victimUuid !== "string") return null

  if (typeof dayIndex !== "number" || payloadDayIndex <= dayIndex) return null

  const seenUuids = new Set()
  const normalizedPlayers = []
  for (const player of players) {
    if (player === null || typeof player !== "object" || Array.isArray(player)) return null
    if (typeof player.uuid !== "string" || player.uuid.length === 0) return null
    if (typeof player.alive !== "boolean") return null
    if (seenUuids.has(player.uuid)) return null
    seenUuids.add(player.uuid)
    normalizedPlayers.push({ uuid: player.uuid, alive: player.alive })
  }

  if (seenUuids.size !== canonicalPlayerIds.size) return null
  for (const uuid of seenUuids) {
    if (!canonicalPlayerIds.has(uuid)) return null
  }

  if (victimUuid !== null && !canonicalPlayerIds.has(victimUuid)) return null

  const knownDeadUuids = previouslyDeadUuids instanceof Set ? previouslyDeadUuids : new Set()
  if (victimUuid !== null && knownDeadUuids.has(victimUuid)) return null

  const expectedDeadUuids = new Set(knownDeadUuids)
  if (victimUuid !== null) expectedDeadUuids.add(victimUuid)

  const deadUuids = new Set(normalizedPlayers.filter((p) => !p.alive).map((p) => p.uuid))
  if (deadUuids.size !== expectedDeadUuids.size) return null
  for (const uuid of expectedDeadUuids) {
    if (!deadUuids.has(uuid)) return null
  }

  return { gameId: payloadGameId, phase, dayIndex: payloadDayIndex, players: normalizedPlayers, victimUuid }
}
