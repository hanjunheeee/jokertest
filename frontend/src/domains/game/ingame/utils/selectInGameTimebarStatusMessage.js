// 시간 바 상태 글 고르기: 밤엔 [밤-차례 직업], 낮·재판엔 고정 글 (남은 초는 확대 타이머가 따로 보여 줌)
// 인게임 화면(InGamePage)이 시간 바·채팅 타이머에 넘김, 옛 이름은 시험이 씀
import { getInGameNightTurnAnnouncement } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"
import {
  INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  INGAME_TIMEBAR_NIGHT_STATUS_MESSAGE,
  INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
} from "../constants/timebar/ingameTimebarAssets.js"
import { formatInGameTimebarPhaseTag } from "./timebar/format.js"
import { selectInGameNightTurnRole } from "./nightTurn.js"

// 단계별 상태 글 (상태가 없거나 다른 단계면 null)
export function selectInGameTimebarStatusLabel(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null

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

// 옛 이름 (두 번째 인자 남은 초는 안 씀)
export function selectInGameTimebarStatusMessage(state) {
  return selectInGameTimebarStatusLabel(state)
}
