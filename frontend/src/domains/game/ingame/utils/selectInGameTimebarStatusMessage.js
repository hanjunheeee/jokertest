import { getInGameNightTurnAnnouncement } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"
import {
  INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
} from "../constants/timebar/ingameTimebarAssets.js"
import { selectInGameNightTurnRole } from "./selectInGameNightTurnRole.js"

export function selectInGameTimebarStatusMessage(state, nightTurnRemainingSec = null) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null

  if (state.phase === "NIGHT") {
    const role = selectInGameNightTurnRole(state)
    const message = getInGameNightTurnAnnouncement(role, state.dayIndex)?.message ?? null
    if (message === null) return null
    return Number.isFinite(nightTurnRemainingSec) && nightTurnRemainingSec >= 0
      ? `${message} · ${nightTurnRemainingSec}초`
      : message
  }

  if (state.phase === "DAY") return INGAME_TIMEBAR_DAY_STATUS_MESSAGE
  if (state.phase === "TRIBUNAL") return INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE

  return null
}
