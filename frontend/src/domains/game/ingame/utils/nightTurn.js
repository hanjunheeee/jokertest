// 밤 차례 알림 검사와 지금 차례 직업 고르기 (상태를 안 건드리는 순수 계산)
// 밤 이벤트 훅·밤 관찰·행동 패널·카드 메뉴·차례 안내·시간 바·차례 마감 시각 계산이 사용
import { INGAME_NIGHT_TURN_ANNOUNCEMENTS } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"

const KNOWN_NIGHT_TURN_ROLES = new Set(INGAME_NIGHT_TURN_ANNOUNCEMENTS.map((turn) => turn.role))

// 밤 차례 시작 알림 검사: 지금 판·날짜·아는 직업·마감 시각이 맞을 때만 돌려줌
export function parseNightTurnStartedPayload({ payload, gameId, dayIndex }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  const { gameId: payloadGameId, dayIndex: payloadDayIndex, role, deadline } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (!gameId || payloadGameId !== gameId) return null

  if (!Number.isInteger(payloadDayIndex)) return null
  if (!Number.isInteger(dayIndex) || payloadDayIndex !== dayIndex) return null

  if (typeof role !== "string" || !KNOWN_NIGHT_TURN_ROLES.has(role)) return null

  if (!Number.isFinite(deadline) || deadline <= 0) return null

  return { gameId: payloadGameId, dayIndex: payloadDayIndex, role, deadline }
}

// 밤 차례 끝 알림 검사: 지금 판·날짜·지금 차례 직업과 같을 때만 돌려줌
export function parseNightTurnEndedPayload({ payload, gameId, dayIndex, nightTurnRole }) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null

  const { gameId: payloadGameId, dayIndex: payloadDayIndex, role } = payload
  if (typeof payloadGameId !== "string" || payloadGameId.trim().length === 0) return null
  if (typeof gameId !== "string" || payloadGameId !== gameId) return null
  if (!Number.isInteger(payloadDayIndex) || !Number.isInteger(dayIndex) || payloadDayIndex !== dayIndex) return null
  if (typeof role !== "string" || !KNOWN_NIGHT_TURN_ROLES.has(role)) return null
  if (typeof nightTurnRole !== "string" || role !== nightTurnRole) return null

  return { gameId: payloadGameId, dayIndex: payloadDayIndex, role }
}

// 밤이고 날짜가 맞을 때 지금 차례 직업 (모르는 직업이면 null)
export function selectInGameNightTurnRole(state) {
  if (state === null || typeof state !== "object") return null
  if (state.phase !== "NIGHT") return null

  const dayIndex = state.dayIndex
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null

  const declared = state.nightTurnRole
  return typeof declared === "string" && KNOWN_NIGHT_TURN_ROLES.has(declared) ? declared : null
}

// 차례 직업의 화면 이름
export function getInGameNightTurnRoleLabel(role) {
  if (typeof role !== "string" || role.length === 0) return null
  return INGAME_NIGHT_TURN_ANNOUNCEMENTS.find((turn) => turn.role === role)?.label ?? null
}

// 지금 차례가 내 직업인지
export function isInGameNightTurnActor(nightTurnRole, myRole) {
  if (typeof nightTurnRole !== "string" || nightTurnRole.length === 0) return false
  if (typeof myRole !== "string" || myRole.length === 0) return false
  return nightTurnRole === myRole
}
