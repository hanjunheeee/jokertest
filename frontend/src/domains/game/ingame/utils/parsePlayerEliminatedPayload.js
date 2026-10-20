/**
 * player_eliminated 공개 방송 파서(F-16 AC-01/AC-04).
 *
 * 서버는 이 사건을 이미 보내고 있는데(끊김 유예 만료 → commitDisconnectElimination →
 * io.to(channel).emit('player_eliminated', ...)) 프런트에 수신기가 하나도 없었다. 이 파서는
 * 그 **이미 발생하는 현재 사건**의 누락된 소비처를 채우기 위한 것이며, 종료 흐름 자체를
 * 바꾸지 않는다(F-22 범위로 확대하지 않는다).
 *
 * 서버 payload는 두 모양이다.
 *   - 일반 사망:   { gameId, phase, dayIndex, players: [{uuid, alive}], victimUuid }
 *   - 끊김 terminal: 위 payload에 buildTerminalFields를 덮어씀
 *                   → { ..., phase: 'ENDED', players: [{uuid, isAlive}], winResult }
 * 그래서 생존 필드 이름이 두 가지다. 둘 다 받되, 둘이 함께 있으면서 서로 다르면 거부한다 —
 * 어느 쪽을 믿을지 추측하지 않는다.
 *
 * 공개 payload에는 role/team/사망 원인이 없다. 이 파서도 그런 값을 만들어내지 않는다(AC-05).
 */

import { normalizePublicWinResult } from "./normalizePublicWinResult.js"

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * players 원소 하나의 생존값을 정규화한다.
 * @returns {{ ok: true, uuid: string, alive: boolean } | { ok: false }}
 */
function normalizePlayerEntry(entry) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return { ok: false }
  if (!isNonEmptyString(entry.uuid)) return { ok: false }

  const hasAlive = Object.hasOwn(entry, "alive")
  const hasIsAlive = Object.hasOwn(entry, "isAlive")
  if (!hasAlive && !hasIsAlive) return { ok: false }
  if (hasAlive && typeof entry.alive !== "boolean") return { ok: false }
  if (hasIsAlive && typeof entry.isAlive !== "boolean") return { ok: false }
  // 두 필드가 함께 왔는데 값이 다르면 손상된 payload다 — 한쪽을 골라 통과시키지 않는다.
  if (hasAlive && hasIsAlive && entry.alive !== entry.isAlive) return { ok: false }

  return { ok: true, uuid: entry.uuid, alive: hasAlive ? entry.alive : entry.isAlive }
}

/**
 * @param {object} args
 * @param {unknown} args.payload            서버 방송 원본(신뢰하지 않음)
 * @param {string} args.gameId              현재 canonical gameId
 * @param {number} args.dayIndex            현재 canonical dayIndex
 * @param {string} args.phase               현재 canonical phase
 * @param {Set<string>} args.canonicalPlayerIds 현재 알려진 roster 전체 uuid
 * @param {Set<string>} args.previouslyDeadUuids 이미 사망으로 알고 있는 uuid(부활 거부용)
 * @returns {{gameId:string, phase:string, dayIndex:number, victimUuid:string,
 *           players:Array<{uuid:string, alive:boolean}>, terminal:boolean,
 *           winResult:object|null} | null}
 */
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
  // 시대가 뒤로 가거나 앞으로 건너뛰는 payload는 받지 않는다 — 이 사건은 현재 날짜에서만 난다.
  if (!Number.isInteger(payload.dayIndex) || payload.dayIndex !== dayIndex) return null

  const isTerminal = payload.phase === "ENDED"
  let winResult = null
  if (isTerminal) {
    // terminal은 유효한 승자가 함께 와야만 종료로 인정한다.
    winResult = normalizePublicWinResult(payload.winResult)
    if (winResult === null) return null
  } else if (payload.phase !== phase) {
    // 일반 사망은 현재 canonical phase에서만 유효하다.
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
    // 외부 uuid·중복은 roster 전체 집합과 어긋난다는 뜻이다.
    if (!canonicalPlayerIds.has(normalized.uuid)) return null
    if (seen.has(normalized.uuid)) return null
    seen.add(normalized.uuid)
    players.push({ uuid: normalized.uuid, alive: normalized.alive })
  }
  // 길이가 같고 중복이 없으며 전부 roster 소속이면 두 집합은 정확히 같다(누락 없음).

  // 이미 죽은 참가자가 다시 살아나는 payload는 받지 않는다.
  if (previouslyDeadUuids instanceof Set) {
    for (const { uuid, alive } of players) {
      if (alive === true && previouslyDeadUuids.has(uuid)) return null
    }
  }

  // 이 사건의 본문은 "victim이 죽었다"이다 — payload 안에서 그 사실이 확인되지 않으면 거부한다.
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
