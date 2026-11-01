/**
 * 상단 day/phase 인디케이터(InGameTimebar)에 함께 띄울 "지금 무슨 상태인가" 문구를
 * canonical state 하나에서만 파생하는 순수 함수.
 *
 * 이 함수 자체에는 소켓 구독도 타이머도 없고, 밤 턴 안내 오버레이의 열림/닫힘과는 완전히
 * 무관하다. 그래서 안내를 닫아도 인디케이터의 문구는 그 자리에 그대로 남는다.
 *
 * NIGHT 역할 턴 태그는 밤 안내 사전의 label(광대·의사 등)을 `[밤-{label}]`로 포맷한다.
 * 오버레이용 message(「○○의 시간입니다」)와는 구분한다 — label 출처는 getInGameNightTurnAnnouncement.
 * 어느 역할을 띄울지는 selectInGameNightTurnRole(canonical state)에서만 읽는다.
 *
 * 남은 초는 확대 타이머바에서 시각적으로만 표시한다 — 이 함수는 문구(초 미포함)만 돌려준다.
 */
import { getInGameNightTurnAnnouncement } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"
import {
  INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  INGAME_TIMEBAR_NIGHT_STATUS_MESSAGE,
  INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
} from "../constants/timebar/ingameTimebarAssets.js"
import { formatInGameTimebarPhaseTag } from "./formatInGameTimebarPhaseTag.js"
import { selectInGameNightTurnRole } from "./selectInGameNightTurnRole.js"

/**
 * canonical state에서 인디케이터 상태 문구를 파생한다(표시할 것이 없으면 null).
 * @flow NIGHT면 canonical 역할 턴의 안내 문구를 재사용한다. DAY/TRIBUNAL은 고정 문구.
 */
export function selectInGameTimebarStatusLabel(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return null

  if (state.phase === "NIGHT") {
    const dayIndex = state.dayIndex
    if (!Number.isInteger(dayIndex) || dayIndex < 0) return null

    const role = selectInGameNightTurnRole(state)
    const roleLabel = getInGameNightTurnAnnouncement(role, dayIndex)?.label
    if (typeof roleLabel === "string" && roleLabel.length > 0) {
      return formatInGameTimebarPhaseTag("밤", roleLabel)
    }

    return INGAME_TIMEBAR_NIGHT_STATUS_MESSAGE
  }

  if (state.phase === "DAY") return INGAME_TIMEBAR_DAY_STATUS_MESSAGE
  if (state.phase === "TRIBUNAL") return INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE

  return null
}

/** @deprecated selectInGameTimebarStatusLabel — 호환용 별칭 */
export function selectInGameTimebarStatusMessage(state) {
  return selectInGameTimebarStatusLabel(state)
}
