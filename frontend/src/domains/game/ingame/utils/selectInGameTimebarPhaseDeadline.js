/**
 * 확대 시간흐름바 타이머 — 밤 역할 턴·낮 하위 구간(DAY_DISCUSSION/DAY_VOTE)의 절대 마감(ms).
 * 서버가 방송·스냅샷으로 실어 보낸 deadline만 쓴다.
 */
export function selectInGameTimebarPhaseDeadline(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null

  if (state.phase === "NIGHT") {
    const deadline = state.nightTurnDeadline
    if (!Number.isFinite(deadline) || deadline <= 0) return null
    return deadline
  }

  if (state.phase === "DAY") {
    const deadline = state.dayPhaseDeadline
    if (!Number.isFinite(deadline) || deadline <= 0) return null
    return deadline
  }

  return null
}
