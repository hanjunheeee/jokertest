import { selectInGameNightTurnRole } from "./selectInGameNightTurnRole.js"

export function selectInGameNightTurnDeadline(state) {
  if (selectInGameNightTurnRole(state) === null) return null

  const deadline = state.nightTurnDeadline
  if (!Number.isFinite(deadline) || deadline <= 0) return null
  return deadline
}

export function computeInGameNightTurnRemainingSec(deadline, now) {
  if (!Number.isFinite(deadline) || deadline <= 0) return null
  if (!Number.isFinite(now)) return null
  return Math.max(0, Math.ceil((deadline - now) / 1000))
}
