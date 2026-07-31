/**
 * night_result_applied 방송을 검증·정규화한다. 신뢰하지 않는 외부 입력이므로 top-level 형태,
 * gameId 일치, dayIndex 단조성, canonical roster 정합성(누락/추가/중복 uuid), victim/alive
 * 일관성을 전부 통과해야만 정규화된 payload를 돌려준다 — 하나라도 위반하면 null(완전한
 * no-op)이다. canonicalPlayerIds는 호출부가 현재 store의 participant uuid 집합을 넘긴다.
 */
export function parseNightResultAppliedPayload({ payload, gameId, dayIndex, canonicalPlayerIds }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  const { gameId: payloadGameId, phase, dayIndex: payloadDayIndex, players, victimUuid } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (phase !== "DAY") return null
  if (!Number.isInteger(payloadDayIndex)) return null
  if (!Array.isArray(players)) return null
  if (victimUuid !== null && typeof victimUuid !== "string") return null

  if (!gameId || payloadGameId !== gameId) return null
  if (typeof dayIndex !== "number" || payloadDayIndex <= dayIndex) return null
  if (!(canonicalPlayerIds instanceof Set) || canonicalPlayerIds.size === 0) return null

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

  const deadUuids = normalizedPlayers.filter((p) => !p.alive).map((p) => p.uuid)
  if (victimUuid === null) {
    if (deadUuids.length !== 0) return null
  } else {
    if (deadUuids.length !== 1 || deadUuids[0] !== victimUuid) return null
  }

  return { gameId: payloadGameId, phase, dayIndex: payloadDayIndex, players: normalizedPlayers, victimUuid }
}
