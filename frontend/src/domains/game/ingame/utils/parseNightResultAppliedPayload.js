// 밤 결과 적용 방송 검사: 판 끝 또는 다음 낮, 명단·죽은 사람이 맞을 때만
// 밤 이벤트 손잡이(hooks/sessionEvents/nightHandlers.js)가 사용
import { normalizePublicWinResult } from "./normalizePublicWinResult.js"
import { parseDayPhaseDeadlineField } from "./dayPhase.js"

// 지금 판·명단 기준 검사 → 반영할 조각 (틀리면 null)
export function parseNightResultAppliedPayload({ payload, gameId, dayIndex, canonicalPlayerIds, previouslyDeadUuids }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  // 지금 판 것이고 비교할 명단이 있어야 함
  const { gameId: payloadGameId, phase, dayIndex: payloadDayIndex, players, victimUuid } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (!gameId || payloadGameId !== gameId) return null
  if (!(canonicalPlayerIds instanceof Set) || canonicalPlayerIds.size === 0) return null

  // 판 끝: 같은 날, 승패 결과 있음 (생존은 isAlive로 받음)
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

    // 참가자 모양·중복 검사, 명단과 같은 사람들이어야 함
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

  // 다음 낮: 날짜가 앞으로 가야 함 (생존은 alive로 받음)
  if (phase !== "DAY") return null
  if (!Number.isInteger(payloadDayIndex)) return null
  if (!Array.isArray(players)) return null
  if (victimUuid !== null && typeof victimUuid !== "string") return null

  if (typeof dayIndex !== "number" || payloadDayIndex <= dayIndex) return null

  // 참가자 모양·중복 검사, 명단과 같은 사람들이어야 함
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

  // 피해자는 명단 안 사람, 이미 죽은 사람이면 거절
  if (victimUuid !== null && !canonicalPlayerIds.has(victimUuid)) return null

  const knownDeadUuids = previouslyDeadUuids instanceof Set ? previouslyDeadUuids : new Set()
  if (victimUuid !== null && knownDeadUuids.has(victimUuid)) return null

  // 죽은 사람 = 전에 죽은 사람 + 이번 피해자, 정확히 맞아야 함
  const expectedDeadUuids = new Set(knownDeadUuids)
  if (victimUuid !== null) expectedDeadUuids.add(victimUuid)

  const deadUuids = new Set(normalizedPlayers.filter((p) => !p.alive).map((p) => p.uuid))
  if (deadUuids.size !== expectedDeadUuids.size) return null
  for (const uuid of expectedDeadUuids) {
    if (!deadUuids.has(uuid)) return null
  }

  // 새 낮 마감 시각: 틀리면 거절, 없으면 칸째 안 실음 (스토어가 칸 있으면 값을 믿음)
  const dayPhaseDeadline = parseDayPhaseDeadlineField(payload)
  if (dayPhaseDeadline === null) return null

  return {
    gameId: payloadGameId, phase, dayIndex: payloadDayIndex, players: normalizedPlayers, victimUuid,
    ...(dayPhaseDeadline !== undefined ? { dayPhaseDeadline } : {}),
  }
}
