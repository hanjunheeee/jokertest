// 시간 바 상태 문구 고르기: 밤엔 차례 안내(+남은 초), 낮·재판엔 고정 문구
// 인게임 화면(InGamePage)이 시간 바에 넘김
import { getInGameNightTurnAnnouncement } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"
import {
  INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
} from "../constants/timebar/ingameTimebarAssets.js"
import { selectInGameNightTurnRole } from "./nightTurn.js"

// 단계별 문구 (상태가 없거나 다른 단계면 null)
export function selectInGameTimebarStatusMessage(state, nightTurnRemainingSec = null) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null

  // 밤: 차례 직업 안내 문구, 남은 초를 알면 뒤에 붙임
  if (state.phase === "NIGHT") {
    const role = selectInGameNightTurnRole(state)
    const message = getInGameNightTurnAnnouncement(role, state.dayIndex)?.message ?? null
    if (message === null) return null
    return Number.isFinite(nightTurnRemainingSec) && nightTurnRemainingSec >= 0
      ? `${message} · ${nightTurnRemainingSec}초`
      : message
  }

  // 낮·재판: 고정 문구
  if (state.phase === "DAY") return INGAME_TIMEBAR_DAY_STATUS_MESSAGE
  if (state.phase === "TRIBUNAL") return INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE

  return null
}
