// 낮 세부 단계(토론·투표) 고르기와 낮 단계 바뀜 알림·낮 마감 시각 칸 검사
// 낮 이벤트 처리·행동 패널·카드 메뉴·밤 결과 검사·투표 판정 검사·단계 진행 액션이 사용
import { isPublicProgress } from "./store/gamePayload.js"

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

// 방송·스냅샷의 낮 마감 시각 칸: 칸 없으면 undefined, 틀린 값이면 null (부르는 쪽이 거절), 맞으면 시각
export function parseDayPhaseDeadlineField(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return undefined
  if (!Object.hasOwn(payload, "dayPhaseDeadline")) return undefined
  const deadline = payload.dayPhaseDeadline
  if (!Number.isFinite(deadline) || deadline <= 0) return null
  return deadline
}

// 낮 투표 시작 알림 검사: 지금 판·날짜이고 투표 단계·회차 모양이 맞을 때만 돌려줌 (마감 시각·진행 수는 있을 때만)
// 진행 수는 낮 투표 것(0 / 산 사람 수)만 받음, 모양이 틀리면 칸만 버림 (알림은 그대로 받음)
export function parseDayPhaseChangedPayload({ payload, gameId, dayIndex }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  const { gameId: payloadGameId, dayIndex: payloadDayIndex, dayPhase, round } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (!gameId || payloadGameId !== gameId) return null

  if (!Number.isInteger(payloadDayIndex)) return null
  if (!Number.isInteger(dayIndex) || payloadDayIndex !== dayIndex) return null

  if (dayPhase !== "DAY_VOTE") return null
  if (!Number.isInteger(round) || round < 1) return null

  const dayPhaseDeadline = parseDayPhaseDeadlineField(payload)
  if (dayPhaseDeadline === null) return null

  // 진행 수 모양 검사는 다른 알림과 같은 isPublicProgress, 여기선 종류만 더 봄
  const progress = isPublicProgress(payload.progress) && payload.progress.kind === "DAY_VOTE"
    ? { ...payload.progress }
    : null

  return {
    gameId: payloadGameId,
    dayIndex: payloadDayIndex,
    dayPhase,
    round,
    ...(dayPhaseDeadline !== undefined ? { dayPhaseDeadline } : {}),
    ...(progress ? { progress } : {}),
  }
}
