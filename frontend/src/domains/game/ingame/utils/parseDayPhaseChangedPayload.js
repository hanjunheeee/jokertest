/**
 * day_phase_changed 방송을 검증·정규화한다. 신뢰하지 않는 외부 입력이므로 top-level 형태,
 * gameId 일치, dayIndex 일치, dayPhase 값, round 형태를 전부 통과해야만 정규화된 payload를
 * 돌려준다 — 하나라도 위반하면 null(완전한 no-op)이다.
 *
 * dayPhase는 'DAY_VOTE'만 받는다. 서버는 이 이벤트를 DAY_DISCUSSION→DAY_VOTE 전이에서만
 * 방송하며(backend/socket/gameSession.js의 handleAcknowledgeDayVoteReady), 투표를 다시 토론으로
 * 되돌리는 전이는 계약에 없다 — 알 수 없는 값이나 되돌리는 값은 받지 않는 쪽이 안전하다.
 *
 * dayIndex는 단조 증가가 아니라 "지금 보고 있는 낮과 정확히 같아야 한다"로 본다 — 이 이벤트는
 * 낮 안에서 일어나는 하위 전이라 dayIndex를 전혀 바꾸지 않기 때문이다.
 *
 * @param {object} params - 검증 입력
 * @param {*} params.payload - day_phase_changed 방송 원본(신뢰하지 않는 외부 입력)
 * @param {string} params.gameId - 현재 store가 신뢰 경계로 요구하는 활성 gameId
 * @param {number} params.dayIndex - 현재 store가 보고 있는 낮 인덱스
 * @flow 형태 → gameId 일치 → dayIndex 일치 → dayPhase 값 → round 형태를 차례로 검사하고,
 *       하나라도 어긋나면 즉시 null을 돌려준다.
 */
export function parseDayPhaseChangedPayload({ payload, gameId, dayIndex }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  const { gameId: payloadGameId, dayIndex: payloadDayIndex, dayPhase, round } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (!gameId || payloadGameId !== gameId) return null

  if (!Number.isInteger(payloadDayIndex)) return null
  if (!Number.isInteger(dayIndex) || payloadDayIndex !== dayIndex) return null

  if (dayPhase !== "DAY_VOTE") return null
  if (!Number.isInteger(round) || round < 1) return null

  let dayPhaseDeadline
  if (Object.hasOwn(payload, "dayPhaseDeadline")) {
    if (!Number.isFinite(payload.dayPhaseDeadline) || payload.dayPhaseDeadline <= 0) return null
    dayPhaseDeadline = payload.dayPhaseDeadline
  }

  return {
    gameId: payloadGameId,
    dayIndex: payloadDayIndex,
    dayPhase,
    round,
    ...(dayPhaseDeadline !== undefined ? { dayPhaseDeadline } : {}),
  }
}
