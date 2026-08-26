/**
 * 밤(NIGHT) 역할 턴 안내 문구와, 그 밤에 재생할 연출 릴(reel)의 재료.
 *
 * 이 파일은 두 가지를 담는다:
 *   1. "역할 턴 → 문구" 사전. 판정(행동 패널의 턴 게이트)이 읽는 canonical 역할 턴의 문구도
 *      여기서 나온다(selectInGameNightTurnRole.js).
 *   2. 밤 연출 릴의 조립(buildInGameNightTurnReel) — 그 밤에 어떤 역할 안내를 어떤 순서로
 *      재생할지만 정하는 연출 전용 값이다.
 *
 * 릴은 역할 보유자의 생사를 전혀 보지 않는다. 죽은 역할의 안내가 사라지면 관찰자가 "안내가
 * 사라짐 = 그 역할 사망"을 추론할 수 있어 사망자의 역할이 누출되기 때문이다. 예전처럼 프런트가
 * 이 배열을 아무 근거 없이 훑던 로컬 큐와는 다르다 — 릴의 구성원은 서버가 내려준 역할 구성
 * (state.nightTurnRoles)이 정하고, 그 순서를 밟는 리듬만 프런트의 고정 타이머가 만든다.
 *
 * 그 밤에 행동 자체가 불가능한 역할(밤 행동이 없는 CITIZEN)은 ingameActionPanel.js의 밤 행동
 * 가능 판정을 그대로 재사용해 걸러낸다(서버 ROLE_DEFINITIONS.nightActionMinDayIndex의 UX
 * 사본과 항상 같은 값). 마녀사냥꾼만은 "시신이 없는 밤에는 턴이 없다"가 원래 규칙이라 릴에서도
 * 그 조건을 지킨다 — 단 시신이 있으면 마녀사냥꾼 보유자가 죽었어도 그 턴 연출은 재생된다.
 */
import { getInGameNightActionType } from "../actions/ingameActionPanel.js"

/**
 * 역할 턴별 안내 문구. 배열 순서는 두 곳에서 쓴다 — "서버가 아직 아무 턴도 지목하지 않았을
 * 때의 그 밤의 시작 턴"(getInGameOpeningNightTurnRole)과 밤 연출 릴의 재생 순서
 * (buildInGameNightTurnReel). 서버의 NIGHT_TURN_ROLE_ORDER와 같은 순서다.
 */
export const INGAME_NIGHT_TURN_ANNOUNCEMENTS = Object.freeze([
  Object.freeze({ role: "JOKER", message: "광대의 시간입니다" }),
  Object.freeze({ role: "DOCTOR", message: "의사의 시간입니다" }),
  Object.freeze({ role: "GUARD", message: "경호원의 시간입니다" }),
  Object.freeze({ role: "WITCH_HUNTER", message: "마녀사냥꾼의 시간입니다" }),
])

/**
 * 릴 한 칸의 길이(ms) — 안내 한 장이 저절로 닫히는 시간이자 릴 커서가 다음 칸으로 넘어가는
 * 시간이다.
 *
 * 이 리듬은 판정과 동기화하지 않는다. canonical 턴은 죽은 역할을 건너뛴 값이라 그것에 맞추면
 * 죽은 역할의 칸이 다시 사라지고(누출이 타이밍 의존으로 되살아난다), 반대로 canonical을 하한으로
 * 쓰면 마지막 생존 역할이 제출하는 순간 밤이 끝나 뒤에 남은 역할의 연출이 통째로 잘린다.
 * 그래서 릴은 모든 창에서 같은 고정 리듬으로만 흐른다.
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

/**
 * 그 밤에 재생할 연출 릴 — 안내할 역할을 canonical 순서(광대→의사→경호원→마녀사냥꾼)로 담은
 * 문자열 배열이다. 역할 보유자의 생사는 어느 조건에도 들어가지 않는다(그 사실 자체가 비밀이다).
 * @param {string[]|undefined|null} nightTurnRoles 서버가 내려준 이 게임의 밤 행동 역할 구성
 *   (state.nightTurnRoles). 배열이 아니거나 비어 있으면 네 역할 전체를 후보로 삼는다 —
 *   구성을 모를 때는 "덜 감추기보다 더 재생"이 안전한 기본값이고, 없는 역할의 안내가 한 번 더
 *   뜰 뿐 누구의 생사도 드러내지 않는다.
 * @param {number} dayIndex 그 밤의 canonical dayIndex
 * @param {object} [options]
 * @param {boolean} [options.hasDeadPlayer] 공개 roster에 사망자가 한 명이라도 있는가
 *   (마녀사냥꾼의 "시신이 없는 밤에는 턴 없음" 규칙 판정에만 쓴다)
 * @flow dayIndex가 유효하지 않으면 빈 배열이다. 그 외에는 문구 사전의 순서를 그대로 밟으며
 *   ① 역할 구성에 있고 ② 그 밤에 안내 가능하고 ③ 마녀사냥꾼이면 시신이 있는 역할만 남긴다.
 */
export function buildInGameNightTurnReel(nightTurnRoles, dayIndex, { hasDeadPlayer = false } = {}) {
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return []

  const composition =
    Array.isArray(nightTurnRoles) && nightTurnRoles.length > 0 ? nightTurnRoles : null

  return INGAME_NIGHT_TURN_ANNOUNCEMENTS.filter(({ role }) => {
    if (composition !== null && !composition.includes(role)) return false
    if (!isInGameAnnounceableNightTurnRole(role, dayIndex)) return false
    // 마녀사냥꾼만은 그 밤의 조건이 따로 있다(서버 isEligibleForNightAction의 UX 사본).
    // roster의 생사는 이미 전원 공개 정보라 이 판정 자체는 아무것도 누출하지 않는다 —
    // 누가 마녀사냥꾼인지·그가 살아 있는지는 여전히 보지 않는다.
    if (role === "WITCH_HUNTER" && hasDeadPlayer !== true) return false
    return true
  }).map(({ role }) => role)
}
