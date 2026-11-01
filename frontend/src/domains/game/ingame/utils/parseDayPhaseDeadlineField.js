/** 공개 payload의 dayPhaseDeadline(ms) — 키가 없으면 undefined, 있으면 유한 양수만 허용한다. */
export function parseDayPhaseDeadlineField(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return undefined
  if (!Object.hasOwn(payload, "dayPhaseDeadline")) return undefined
  const deadline = payload.dayPhaseDeadline
  if (!Number.isFinite(deadline) || deadline <= 0) return null
  return deadline
}
