import { normalizePublicWinResult } from "./normalizePublicWinResult.js"

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function normalizePlayerEntry(entry) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return { ok: false }
  if (!isNonEmptyString(entry.uuid)) return { ok: false }

  const hasAlive = Object.hasOwn(entry, "alive")
  const hasIsAlive = Object.hasOwn(entry, "isAlive")
  if (!hasAlive && !hasIsAlive) return { ok: false }
  if (hasAlive && typeof entry.alive !== "boolean") return { ok: false }
  if (hasIsAlive && typeof entry.isAlive !== "boolean") return { ok: false }
  if (hasAlive && hasIsAlive && entry.alive !== entry.isAlive) return { ok: false }

  return { ok: true, uuid: entry.uuid, alive: hasAlive ? entry.alive : entry.isAlive }
}

export function parsePlayerEliminatedPayload({
  payload,
  gameId,
  dayIndex,
  phase,
  canonicalPlayerIds,
  previouslyDeadUuids,
}) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null
  if (!isNonEmptyString(gameId)) return null
  if (!(canonicalPlayerIds instanceof Set) || canonicalPlayerIds.size === 0) return null

  if (payload.gameId !== gameId) return null
  if (!Number.isInteger(payload.dayIndex) || payload.dayIndex !== dayIndex) return null

  const isTerminal = payload.phase === "ENDED"
  let winResult = null
  if (isTerminal) {
    winResult = normalizePublicWinResult(payload.winResult)
    if (winResult === null) return null
  } else if (payload.phase !== phase) {
    return null
  }

  if (!isNonEmptyString(payload.victimUuid)) return null
  if (!canonicalPlayerIds.has(payload.victimUuid)) return null

  if (!Array.isArray(payload.players)) return null
  if (payload.players.length !== canonicalPlayerIds.size) return null

  const players = []
  const seen = new Set()
  for (const entry of payload.players) {
    const normalized = normalizePlayerEntry(entry)
    if (!normalized.ok) return null
    if (!canonicalPlayerIds.has(normalized.uuid)) return null
    if (seen.has(normalized.uuid)) return null
    seen.add(normalized.uuid)
    players.push({ uuid: normalized.uuid, alive: normalized.alive })
  }
  if (previouslyDeadUuids instanceof Set) {
    for (const { uuid, alive } of players) {
      if (alive === true && previouslyDeadUuids.has(uuid)) return null
    }
  }

  const victimEntry = players.find((p) => p.uuid === payload.victimUuid)
  if (!victimEntry || victimEntry.alive !== false) return null

  return {
    gameId,
    phase: isTerminal ? "ENDED" : phase,
    dayIndex,
    victimUuid: payload.victimUuid,
    players,
    terminal: isTerminal,
    winResult,
  }
}
