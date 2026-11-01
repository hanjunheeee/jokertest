// 낮 세부 단계(토론·투표) 고르기와 낮 단계 바뀜 알림 검사
// 낮 이벤트 처리·행동 패널·카드 메뉴가 사용

// 낮 세부 단계 이름
export const INGAME_DAY_PHASES = Object.freeze({
  DISCUSSION: "DAY_DISCUSSION",
  VOTE: "DAY_VOTE",
})

// 낮이면 투표/토론, 낮이 아니면 null
export function resolveInGameDayPhase(gameState) {
  if (!gameState || gameState.phase !== "DAY") return null
  if (gameState.dayPhase === INGAME_DAY_PHASES.VOTE) return INGAME_DAY_PHASES.VOTE
  return INGAME_DAY_PHASES.DISCUSSION
}

// 낮 투표 시작 알림 검사: 지금 판·날짜·라운드가 맞을 때만 돌려줌
export function parseDayPhaseChangedPayload({ payload, gameId, dayIndex }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  const { gameId: payloadGameId, dayIndex: payloadDayIndex, dayPhase, round } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (!gameId || payloadGameId !== gameId) return null

  if (!Number.isInteger(payloadDayIndex)) return null
  if (!Number.isInteger(dayIndex) || payloadDayIndex !== dayIndex) return null

  if (dayPhase !== "DAY_VOTE") return null
  if (!Number.isInteger(round) || round < 1) return null

  return { gameId: payloadGameId, dayIndex: payloadDayIndex, dayPhase, round }
}
