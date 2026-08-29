/**
 * 밤(NIGHT) 역할 턴 안내 문구.
 *
 * 이 파일은 "역할 턴 → 문구" 사전일 뿐이다 — 안내 순서를 프런트에서 진행시키는 큐가 아니다.
 * 지금 어느 역할 턴인지는 언제나 canonical 상태에서만 읽고(selectInGameNightTurnRole.js),
 * 안내를 닫아도 그 값은 조금도 움직이지 않는다. 예전에는 이 배열을 로컬 커서로 훑으며
 * 광대→의사→경비원→마녀사냥꾼을 프런트 혼자 순차 재생했는데, 그게 서버 턴과 무관하게
 * 안내가 줄줄이 뜨던 회귀의 원인이었다.
 *
 * 서버가 night_turn_started로 선언한 알려진 역할은 로컬 행동 가능 여부와 무관하게 안내한다.
 * 역할의 생존·행동 가능 여부를 여기서 다시 추정하면 서버 턴과 화면이 어긋날 수 있다.
 */
/**
 * 역할 턴별 안내 문구. 배열 순서는 표시 사전의 정렬일 뿐이며 현재 턴을 결정하지 않는다.
 */
// label은 안내 문구에서 "○○" 부분만 떼어낸 같은 표기다. 상태바(InGameTimebar)가 지금 턴을
// 상시로 표시할 때 쓰며, 안내 오버레이와 상태바가 같은 역할을 다른 이름으로 부르지 않도록
// message와 한 줄에 붙여 둔다 — 표기를 바꾸려면 이 한 곳만 고치면 된다.
export const INGAME_NIGHT_TURN_ANNOUNCEMENTS = Object.freeze([
  Object.freeze({ role: "JOKER", label: "광대", message: "광대의 시간입니다" }),
  Object.freeze({ role: "DOCTOR", label: "의사", message: "의사의 시간입니다" }),
  Object.freeze({ role: "GUARD", label: "경비원", message: "경비원의 시간입니다" }),
  Object.freeze({ role: "WITCH_HUNTER", label: "마녀사냥꾼", message: "마녀사냥꾼의 시간입니다" }),
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

/** 서버가 선언할 수 있는 알려진 역할 턴인가. */
export function isInGameAnnounceableNightTurnRole(role, dayIndex) {
  if (typeof role !== "string" || role.length === 0) return false
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return false
  return INGAME_NIGHT_TURN_ANNOUNCEMENTS.some((turn) => turn.role === role)
}

/**
 * 역할 턴 하나에 대응하는 안내를 돌려준다(없으면 null).
 * 안내 문구가 없는 역할이면 null이다.
 */
export function getInGameNightTurnAnnouncement(role, dayIndex) {
  if (!isInGameAnnounceableNightTurnRole(role, dayIndex)) return null
  return INGAME_NIGHT_TURN_ANNOUNCEMENTS.find((turn) => turn.role === role) ?? null
}
