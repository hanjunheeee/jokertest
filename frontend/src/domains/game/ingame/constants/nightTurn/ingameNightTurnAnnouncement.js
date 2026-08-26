/**
 * 밤(NIGHT) 역할 턴 안내 문구.
 *
 * 이 파일은 "역할 턴 → 문구" 사전일 뿐이다 — 안내 순서를 프런트에서 진행시키는 큐가 아니다.
 * 지금 어느 역할 턴인지는 언제나 canonical 상태에서만 읽고(selectInGameNightTurnRole.js),
 * 안내를 닫아도 그 값은 조금도 움직이지 않는다. 예전에는 이 배열을 로컬 커서로 훑으며
 * 광대→의사→경호원→마녀사냥꾼을 프런트 혼자 순차 재생했는데, 그게 서버 턴과 무관하게
 * 안내가 줄줄이 뜨던 회귀의 원인이었다.
 *
 * 그 밤에 행동 자체가 불가능한 역할 턴(밤 행동이 없는 CITIZEN)은 ingameActionPanel.js의 밤
 * 행동 가능 판정을 그대로 재사용해 걸러낸다 — canonical하게 건너뛰는 역할은 한 프레임도 뜨지
 * 않는다(서버 ROLE_DEFINITIONS.nightActionMinDayIndex의 UX 사본과 항상 같은 값). 마녀사냥꾼은
 * 시신이 없는 밤에 서버가 아예 턴을 만들지 않으므로 애초에 canonical 턴으로 오지 않는다.
 */
import { getInGameNightActionType } from "../actions/ingameActionPanel.js"

/**
 * 역할 턴별 안내 문구. 배열 순서는 "서버가 아직 아무 턴도 지목하지 않았을 때의 그 밤의
 * 시작 턴"을 고르는 데에만 쓰인다(getInGameOpeningNightTurnRole) — 안내가 이 순서대로
 * 자동으로 넘어간다는 뜻이 아니다.
 */
export const INGAME_NIGHT_TURN_ANNOUNCEMENTS = Object.freeze([
  Object.freeze({ role: "JOKER", message: "광대의 시간입니다" }),
  Object.freeze({ role: "DOCTOR", message: "의사의 시간입니다" }),
  Object.freeze({ role: "GUARD", message: "경호원의 시간입니다" }),
  Object.freeze({ role: "WITCH_HUNTER", message: "마녀사냥꾼의 시간입니다" }),
])

/**
 * 안내 한 장이 저절로 닫히기까지의 시간(ms).
 *
 * "다음 턴으로 넘기는" 시간이 아니라 지금 떠 있는 안내 한 장이 스스로 사라지는 시간이다 —
 * 이 타이머가 만료돼도 다음 역할 턴은 열리지 않는다(다음 안내는 canonical 턴이 실제로
 * 바뀔 때만 열린다).
 */
export const INGAME_NIGHT_TURN_ANNOUNCEMENT_DURATION_MS = 2600

/** 안내 오버레이의 닫기 버튼 문구 */
export const INGAME_NIGHT_TURN_ANNOUNCEMENT_CLOSE_LABEL = "확인"

/** 그 밤에 실제로 안내할 수 있는 역할 턴인가(행동 불가 = canonical하게 건너뛰는 턴). */
export function isInGameAnnounceableNightTurnRole(role, dayIndex) {
  if (typeof role !== "string" || role.length === 0) return false
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return false
  return getInGameNightActionType(role, dayIndex) !== null
}

/**
 * 역할 턴 하나에 대응하는 안내를 돌려준다(없으면 null).
 * 그 밤에 건너뛰는 역할이거나 안내 문구가 없는 역할이면 null이다.
 */
export function getInGameNightTurnAnnouncement(role, dayIndex) {
  if (!isInGameAnnounceableNightTurnRole(role, dayIndex)) return null
  return INGAME_NIGHT_TURN_ANNOUNCEMENTS.find((turn) => turn.role === role) ?? null
}

/**
 * 그 밤의 시작 역할 턴 — canonical 상태가 역할 턴을 따로 지목하지 않을 때 쓰는 값이다.
 *
 * 서버는 밤을 역할별로 쪼개 진행하지 않고 NIGHT 한 구간에서 자격 있는 역할의 제출을 모두
 * 받는다(game-core submitNightAction). 그래서 그 밤의 canonical 역할 턴은 "그 밤에 행동
 * 가능한 첫 역할" 하나로 고정되며, 안내를 닫아도 프런트가 이 값을 다음 역할로 옮기지 않는다.
 * 유효하지 않은 dayIndex거나 행동 가능한 역할이 하나도 없으면 null이다.
 */
export function getInGameOpeningNightTurnRole(dayIndex) {
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return null
  const opening = INGAME_NIGHT_TURN_ANNOUNCEMENTS.find((turn) =>
    isInGameAnnounceableNightTurnRole(turn.role, dayIndex),
  )
  return opening?.role ?? null
}
