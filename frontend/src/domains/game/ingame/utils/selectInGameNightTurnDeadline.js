// 밤 차례 마감 시각 고르기와 남은 초 계산
// 남은 초 계산은 단계 타이머 진행 훅(useTurnProgress)·옛 남은 초 훅이 사용, 마감 고르기는 시험만 사용
import { selectInGameNightTurnRole } from "./nightTurn.js"

// 밤 차례 중일 때만 마감 시각 (없거나 틀리면 null)
export function selectInGameNightTurnDeadline(state) {
  if (selectInGameNightTurnRole(state) === null) return null

  const deadline = state.nightTurnDeadline
  if (!Number.isFinite(deadline) || deadline <= 0) return null
  return deadline
}

// 남은 초 (올림, 0 밑으로 안 감), 값이 틀리면 null
export function computeInGameNightTurnRemainingSec(deadline, now) {
  if (!Number.isFinite(deadline) || deadline <= 0) return null
  if (!Number.isFinite(now)) return null
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}
