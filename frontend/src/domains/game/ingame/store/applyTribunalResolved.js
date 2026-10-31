import { normalizePublicWinResult } from "../utils/normalizePublicWinResult.js"

const TRIBUNAL_RESOLVED_OUTCOMES = new Set(["GUILTY", "NOT_GUILTY"])

const TRIBUNAL_CANCELLED_OUTCOME = "CANCELLED"
const TRIBUNAL_CANCEL_REASONS = new Set(["DEFENDANT_LEFT"])

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

export function applyTribunalResolvedPure(current, payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
  if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
  if (!Number.isInteger(payload.dayIndex)) return current
  if (typeof payload.phase !== "string") return current
  if (typeof payload.defendantUuid !== "string" || payload.defendantUuid.length === 0) return current

  if (payload.outcome === TRIBUNAL_CANCELLED_OUTCOME) {
    if (payload.phase !== "NIGHT") return current
    if (!TRIBUNAL_CANCEL_REASONS.has(payload.reason)) return current
    if (payload.executedUuid !== null) return current

    const cancelCounts = payload.counts
    if (!cancelCounts || typeof cancelCounts !== "object" || Array.isArray(cancelCounts)) return current
    if (!isNonNegativeInteger(cancelCounts.guilty) || !isNonNegativeInteger(cancelCounts.notGuilty)) return current

    if (!current.gameId || !current.state) return current
    if (payload.gameId !== current.gameId) return current
    if (payload.dayIndex !== current.state.dayIndex) return current
    if (current.state.phase !== "TRIBUNAL") return current
    if (current.state.tribunal?.defendantUuid !== payload.defendantUuid) return current

    return {
      state: {
        ...current.state,
        phase: "NIGHT",
        tribunal: null,
      },
    }
  }

  if (!TRIBUNAL_RESOLVED_OUTCOMES.has(payload.outcome)) return current

  const counts = payload.counts
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return current
  if (!isNonNegativeInteger(counts.guilty) || !isNonNegativeInteger(counts.notGuilty)) return current

  if (payload.executedUuid !== null && (typeof payload.executedUuid !== "string" || payload.executedUuid.length === 0)) return current
  if (payload.outcome === "GUILTY" && payload.executedUuid !== payload.defendantUuid) return current
  if (payload.outcome === "NOT_GUILTY" && payload.executedUuid !== null) return current

  if (!current.gameId || !current.state) return current
  if (payload.gameId !== current.gameId) return current
  if (payload.dayIndex !== current.state.dayIndex) return current
  if (current.state.tribunal?.defendantUuid !== payload.defendantUuid) return current

  if (payload.phase === "ENDED") {
    if (current.state.phase !== "TRIBUNAL") return current
    if (!Array.isArray(payload.players)) return current
    if (!Object.hasOwn(payload, "winResult") || payload.winResult === null) {
      return current
    }
    const winResult = normalizePublicWinResult(payload.winResult)
    if (winResult === null) {
      return current
    }

    const canonicalUuids = new Set((current.state.players ?? []).map((p) => p.uuid))

    const aliveByUuid = new Map()
    for (const p of payload.players) {
      if (p === null || typeof p !== "object" || Array.isArray(p)) return current
      if (typeof p.uuid !== "string" || p.uuid.length === 0) return current
      if (typeof p.isAlive !== "boolean") return current
      if (aliveByUuid.has(p.uuid)) return current
      aliveByUuid.set(p.uuid, p.isAlive)
    }
    if (aliveByUuid.size !== canonicalUuids.size) return current
    for (const uuid of aliveByUuid.keys()) {
      if (!canonicalUuids.has(uuid)) return current
    }

    const nextEndedPlayers = (current.state.players ?? []).map((p) => ({ ...p, alive: aliveByUuid.get(p.uuid) }))

    return {
      state: {
        ...current.state,
        phase: "ENDED",
        tribunal: {
          ...current.state.tribunal,
          outcome: payload.outcome,
          counts: { guilty: counts.guilty, notGuilty: counts.notGuilty },
          executedUuid: payload.executedUuid,
          resolved: true,
        },
        players: nextEndedPlayers,
        winResult,
      },
    }
  }

  if (payload.phase === "NIGHT") {
    if (current.state.phase !== "TRIBUNAL") return current

    const nextNightPlayers =
      payload.executedUuid === null
        ? current.state.players
        : (current.state.players ?? []).map((p) => (p.uuid === payload.executedUuid ? { ...p, alive: false } : p))

    return {
      state: {
        ...current.state,
        phase: "NIGHT",
        tribunal: null,
        players: nextNightPlayers,
      },
    }
  }

  if (payload.phase !== current.state.phase) return current

  const nextPlayers =
    payload.executedUuid === null
      ? current.state.players
      : (current.state.players ?? []).map((p) => (p.uuid === payload.executedUuid ? { ...p, alive: false } : p))

  return {
    state: {
      ...current.state,
      tribunal: {
        ...current.state.tribunal,
        outcome: payload.outcome,
        counts: { guilty: counts.guilty, notGuilty: counts.notGuilty },
        executedUuid: payload.executedUuid,
        resolved: true,
      },
      players: nextPlayers,
    },
  }
}
