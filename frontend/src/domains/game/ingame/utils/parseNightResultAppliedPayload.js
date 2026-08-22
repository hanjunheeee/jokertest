import { normalizeWinResult } from "./normalizeWinResult.js"

/**
 * night_result_applied 방송을 검증·정규화한다. 신뢰하지 않는 외부 입력이므로 top-level 형태,
 * gameId 일치, dayIndex 단조성, canonical roster 정합성(누락/추가/중복 uuid), victim/alive
 * 일관성을 전부 통과해야만 정규화된 payload를 돌려준다 — 하나라도 위반하면 null(완전한
 * no-op)이다. canonicalPlayerIds는 호출부가 현재 store의 participant uuid 집합을 넘긴다.
 *
 * previouslyDeadUuids는 이번 밤 이전에 이미 사망한 참가자 uuid 집합이다(예: 첫 DAY/TRIBUNAL
 * 사이클의 처형자, 이전 밤의 희생자). buildNightResultAppliedPayload는 매번 전체 roster의
 * alive 상태를 보내므로, 두 번째 이후 밤부터는 payload.players에 과거 사망자가 계속 포함된다
 * — victimUuid 하나만으로 사망자 수를 검증하면(과거엔 "사망자는 항상 0명 또는 victimUuid
 * 하나"라고 가정했다) 과거 사망자가 남아있는 정상적인 두 번째 밤 결과가 거부된다. 지정하지
 * 않으면 빈 Set으로 취급한다(첫 밤 시나리오와 호환).
 *
 * 종료(ENDED) payload의 winResult는 winner만 잘라내지 않고 normalizeWinResult가 정규화한
 * { winner, reveals, mvp } 전체를 돌려준다 — 결과 페이지가 reveals를 읽어야 한다.
 */
export function parseNightResultAppliedPayload({ payload, gameId, dayIndex, canonicalPlayerIds, previouslyDeadUuids }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  const { gameId: payloadGameId, phase, dayIndex: payloadDayIndex, players, victimUuid } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (!gameId || payloadGameId !== gameId) return null
  if (!(canonicalPlayerIds instanceof Set) || canonicalPlayerIds.size === 0) return null

  // 게임 종료(ENDED) payload는 DAY 전이 없이 도착할 수 있다(승리 조건이 밤 사망 직후 확정되면
  // dayIndex가 증가하지 않고 그대로 유지된다) — 아래 "phase !== 'DAY'" 조기 반환이 이 payload를
  // 걸러내기 전에 먼저 검증·통과시켜야 한다(순서 주의).
  if (phase === "ENDED") {
    if (!Number.isInteger(payloadDayIndex)) return null
    if (typeof dayIndex !== "number" || payloadDayIndex !== dayIndex) return null
    if (!Array.isArray(players)) return null
    if (victimUuid !== null && typeof victimUuid !== "string") return null
    // winResult 값의 검증·정규화(reveals/mvp 포함)는 세 파서가 공유하는 normalizeWinResult가
    // 전담한다 — 여기서는 "종료 payload에는 winResult 필드가 반드시 있어야 한다"만 본다.
    if (!Object.hasOwn(payload, "winResult")) return null
    const winResult = normalizeWinResult(payload.winResult)
    if (winResult === null) return null

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

  // 개수와 부분집합 관계가 함께 성립하면 집합이 정확히 동일하다는 뜻이다(누락/추가 둘 다 차단).
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
