// 시간 바 타이머 마감 시각 고르기: 밤엔 역할 차례 마감, 낮엔 토론·투표 마감
// 인게임 화면(InGamePage)이 사용, 값은 서버가 방송·스냅샷에 실어 준 것만 씀

// 지금 단계 마감 시각 (재판·끝남·틀린 값이면 null)
export function selectInGameTimebarPhaseDeadline(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null

  // 밤: 역할이 비어도 마감 시각만 있으면 씀
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
