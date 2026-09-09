/**
 * 상단 day/phase 인디케이터(InGameTimebar)에 함께 띄울 "지금 무슨 상태인가" 문구를
 * canonical state 하나에서만 파생하는 순수 함수.
 *
 * 이 함수 자체에는 소켓 구독도 타이머도 없고, 밤 턴 안내 오버레이의 열림/닫힘과는 완전히
 * 무관하다. 그래서 안내를 닫아도 인디케이터의 문구는 그 자리에 그대로 남는다.
 *
 * NIGHT 문구는 새로 만들지 않고 밤 턴 안내가 쓰는 것을 그대로 재사용한다 — 그 턴의 문구는
 * getInGameNightTurnAnnouncement이 유일한 출처다. 어느 역할을 띄울지는 언제나 로컬 canonical
 * 턴(selectInGameNightTurnRole)에서만 읽는다 — 프런트에는 역할 턴을 앞으로 미는 연출 릴도
 * 커서도 없고, 서버가 명시한 알려진 역할 외에는 무엇도 지어내지 않는다.
 *
 * 남은 시간은 화면 쪽 타이머(useInGameNightTurnCountdown)가 계산해 넘겨주는 초 하나만 받는다.
 * 계산할 수 없으면(deadline 없음) 역할 문구만 남고 초 표기는 사라진다.
 */
import { getInGameNightTurnAnnouncement } from "../constants/nightTurn/ingameNightTurnAnnouncement.js"
import {
  INGAME_TIMEBAR_DAY_STATUS_MESSAGE,
  INGAME_TIMEBAR_TRIBUNAL_STATUS_MESSAGE,
} from "../constants/timebar/ingameTimebarAssets.js"
import { selectInGameNightTurnRole } from "./selectInGameNightTurnRole.js"

/**
 * canonical state에서 인디케이터 상태 문구를 파생한다(표시할 것이 없으면 null).
 * @param {object|null|undefined} state ingameStore의 서버 세션 미러(state.phase·dayIndex·nightTurnRole)
 * @param {number|null} [nightTurnRemainingSec] 그 턴의 deadline까지 남은 초(0에서 멈춤).
 *   유한한 0 이상의 수가 아니면 초 표기를 붙이지 않는다.
 * @flow NIGHT면 canonical 역할 턴의 안내 문구를 재사용하고(남은 초가 있으면 뒤에 덧붙인다),
 *   DAY/TRIBUNAL은 고정 문구를 쓰며, ENDED·ROLE_REVEAL·알 수 없는 phase는 null이다. NIGHT인데
 *   서버가 지목한 알려진 역할이 없으면(아직 턴 방송 전 · 턴 종료 후 · 무효한 dayIndex) 문구를
 *   지어내지 않고 null이다 — 다른 플레이어의 비공개 역할은 이 문구에 절대 들어가지 않는다.
 */
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

  // ENDED·ROLE_REVEAL과 알 수 없는 phase는 문구를 붙이지 않는다 — 인디케이터의 기존 표시
  // ("제 N일" + phase 아이콘)만 그대로 남는다.
  return null
}
