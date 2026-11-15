// 시간 바 상태 글 고르기(밤엔 [밤-차례 직업], 낮·재판엔 고정 글) + 마감 당김 표시 넣기·읽기
// 인게임 화면·시간 바·모바일 진행 바와 단계 줄이 글을 쓰고, 마감 당김은 판 진행 이벤트 손잡이가 넣음
import { getInGameNightTurnAnnouncement } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"
import {
  INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  INGAME_TIMEBAR_NIGHT_STATUS_MESSAGE,
  INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
} from "../constants/timebar/ingameTimebarAssets.js"
import { formatInGameTimebarPhaseTag } from "./timebar/format.js"
import { selectInGameTimebarPhaseDeadline } from "./timebar/phaseDeadline.js"
import { INGAME_DAY_PHASES, resolveInGameDayPhase } from "./dayPhase.js"
import { selectInGameNightTurnRole } from "./nightTurn.js"

// 표가 다 차 마감이 당겨진 동안 쓰는 글
// 모바일 단계 줄이 "-" 앞만 보여 줘서 한 덩어리로 둠 → "제 2일 · 5초 뒤 마감 0:04"
export const INGAME_TIMEBAR_SETTLE_STATUS_MESSAGE = "[5초 뒤 마감]"

// 단계마다 당겨지는 마감 시각 칸 (재판 표·밤 대상이 다 차면 서버가 이 칸을 지금+5초로 바꿈)
const SETTLE_DEADLINE_FIELDS = Object.freeze({
  DAY: "dayPhaseDeadline",
  TRIBUNAL: "tribunalDeadline",
  NIGHT: "nightTurnDeadline",
})

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

// 표시가 지금 단계 것인지: 단계·날짜·밤 차례 직업·마감 시각이 다 같아야 함
// 다음 단계·다음 차례가 되면 저절로 안 맞아 지울 필요 없음
function isSettleForState(settle, state) {
  if (!isPlainObject(settle) || !isPlainObject(state)) return false
  if (!Object.hasOwn(SETTLE_DEADLINE_FIELDS, settle.phase) || settle.phase !== state.phase) return false
  if (settle.dayIndex !== state.dayIndex) return false
  if (settle.phase === "DAY" && resolveInGameDayPhase(state) !== INGAME_DAY_PHASES.VOTE) return false
  if (settle.phase === "NIGHT" && settle.role !== selectInGameNightTurnRole(state)) return false
  return settle.deadline === selectInGameTimebarPhaseDeadline(state)
}

// 마감 당김 알림(phase_settle_started)을 판 상태에 넣은 새 상태 (안 맞거나 바뀔 것 없으면 null)
// 받는 값 예: { gameId, phase: "NIGHT", dayIndex: 2, role: "JOKER", deadline: 1763280005000 }
// 밤은 직업이 있어야 받음 (옛 차례 알림이 다음 차례 마감을 줄이지 않게)
export function applyPhaseSettleStarted(state, gameId, payload) {
  if (!isPlainObject(state) || !isPlainObject(payload)) return null
  if (typeof gameId !== "string" || gameId.length === 0 || payload.gameId !== gameId) return null

  const { phase, dayIndex, deadline } = payload
  if (!Object.hasOwn(SETTLE_DEADLINE_FIELDS, phase) || phase !== state.phase) return null
  if (!Number.isInteger(dayIndex) || dayIndex !== state.dayIndex) return null
  if (!Number.isFinite(deadline) || deadline <= 0) return null
  if (phase === "DAY" && resolveInGameDayPhase(state) !== INGAME_DAY_PHASES.VOTE) return null

  const role = phase === "NIGHT" ? payload.role : null
  if (phase === "NIGHT" && (typeof role !== "string" || role !== selectInGameNightTurnRole(state))) return null

  // 서버는 마감을 앞으로만 당김 → 지금 마감보다 늦은 값은 버림
  const field = SETTLE_DEADLINE_FIELDS[phase]
  const current = state[field]
  if (Number.isFinite(current) && current > 0 && deadline > current) return null

  // 같은 알림이 또 오면 그대로 (다시 그리기 막기)
  if (current === deadline && isSettleForState(state.phaseSettle, state)) return null
  return { ...state, [field]: deadline, phaseSettle: { phase, dayIndex, role, deadline } }
}

// 지금 단계 마감이 당겨진 상태인지 (표시가 지금 단계 것일 때만)
export function selectInGamePhaseSettled(state) {
  return isSettleForState(state?.phaseSettle, state)
}

// 단계별 상태 글 (상태가 없거나 다른 단계면 null), 마감이 당겨졌으면 "[5초 뒤 마감]"
export function selectInGameTimebarStatusLabel(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null
  if (selectInGamePhaseSettled(state)) return INGAME_TIMEBAR_SETTLE_STATUS_MESSAGE

  // 밤: 날짜가 틀리면 글 없음
  if (state.phase === "NIGHT") {
    const dayIndex = state.dayIndex
    if (!Number.isInteger(dayIndex) || dayIndex < 0) return null

    // 아는 직업 차례면 직업 이름, 차례 사이·모르는 직업이면 기본 밤 글 (다른 사람 역할 안 새게)
    const role = selectInGameNightTurnRole(state)
    const roleLabel = getInGameNightTurnAnnouncement(role, dayIndex)?.label
    if (typeof roleLabel === "string" && roleLabel.length > 0) {
      return formatInGameTimebarPhaseTag("밤", roleLabel)
    }

    return INGAME_TIMEBAR_NIGHT_STATUS_MESSAGE
  }

  // 낮·재판: 고정 글
  if (state.phase === "DAY") return INGAME_TIMEBAR_DAY_STATUS_MESSAGE
  if (state.phase === "TRIBUNAL") return INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE

  return null
}
