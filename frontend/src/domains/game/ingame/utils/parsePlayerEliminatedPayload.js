// 사망 방송 검사: 지금 판·날짜·단계, 피해자·명단 생존이 맞을 때만 (판 끝이면 승패 포함)
// 낮 이벤트 손잡이(hooks/sessionEvents/dayHandlers.js)가 사용
import { normalizePublicWinResult } from "./normalizePublicWinResult.js"

// 빈칸 아닌 글자 (앞뒤 공백만 있어도 빈칸)
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

// 참가자 하나: uuid, 생존은 alive·isAlive 중 온 것 (둘 다 오면 같아야 함)
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

// 사망 방송 → 반영할 조각 (틀리면 null)
export function parsePlayerEliminatedPayload({
  payload,
  gameId,
  dayIndex,
  phase,
  canonicalPlayerIds,
  previouslyDeadUuids,
}) {
  // 지금 판·날짜, 비교할 명단이 있어야 함
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null
  if (!isNonEmptyString(gameId)) return null
  if (!(canonicalPlayerIds instanceof Set) || canonicalPlayerIds.size === 0) return null

  if (payload.gameId !== gameId) return null
  if (!Number.isInteger(payload.dayIndex) || payload.dayIndex !== dayIndex) return null

  // 판 끝이면 승패 결과가 있어야 하고, 아니면 지금 단계와 같아야 함
  const isTerminal = payload.phase === "ENDED"
  let winResult = null
  if (isTerminal) {
    winResult = normalizePublicWinResult(payload.winResult)
    if (winResult === null) return null
  } else if (payload.phase !== phase) {
    return null
  }

  // 피해자는 명단 안 사람
  if (!isNonEmptyString(payload.victimUuid)) return null
  if (!canonicalPlayerIds.has(payload.victimUuid)) return null

  // 참가자 목록: 명단과 사람 수·얼굴이 같고 중복 없음
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
  // 전에 죽은 사람이 되살아나면 거절
  if (previouslyDeadUuids instanceof Set) {
    for (const { uuid, alive } of players) {
      if (alive === true && previouslyDeadUuids.has(uuid)) return null
    }
  }

  // 피해자는 죽은 것으로 와야 함
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
