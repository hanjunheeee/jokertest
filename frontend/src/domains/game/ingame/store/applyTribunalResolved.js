const TRIBUNAL_RESOLVED_OUTCOMES = new Set(["GUILTY", "NOT_GUILTY"])

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

/**
 * tribunal_vote_resolved 방송을 store에 반영할지 판정하고, 반영 가능하면 다음 state를
 * 만든다(순수 함수). payload의 gameId/dayIndex/phase/defendantUuid가 store canonical과
 * 전부 일치할 때만 반영하고, 그 외에는 원래 current 참조를 그대로 반환한다(최상위·nested
 * 모두 완전한 no-op). 정상 반영 시 tribunal 결과 필드(outcome/counts/executedUuid/resolved)와,
 * executedUuid가 가리키는 참가자의 alive:false만 갱신한다 — 다른 필드는 건드리지 않는다.
 */
export function applyTribunalResolvedPure(current, payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
  if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
  if (!Number.isInteger(payload.dayIndex)) return current
  if (typeof payload.phase !== "string") return current
  if (typeof payload.defendantUuid !== "string" || payload.defendantUuid.length === 0) return current
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
  if (payload.phase !== current.state.phase) return current
  if (current.state.tribunal?.defendantUuid !== payload.defendantUuid) return current

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
