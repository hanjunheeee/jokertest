/**
 * 공개 방 목록 행에 보여줄 **설정 요약** 문자열을 만듭니다.
 *
 * 서버가 목록에 싣는 값은 "승인된 방 구성 수치"뿐이다 — 개인별 배정 역할이 아니고, 코드·
 * 신원·준비 상태도 들어 있지 않다(backend/socket/matchmaking.js의 buildPublicRoomList).
 * 이 함수는 그 요약을 표시 문자열로 바꾸기만 하며, 없는 값을 지어내지 않는다.
 *
 * React에 의존하지 않는 순수 함수라 JSX 없이 node:test로 검증된다.
 *
 * @param {object|undefined} settings - 목록 응답의 room.settings(편집 가능한 필드만 담긴 요약)
 * @returns {{roles:string|null, times:string|null, ariaText:string|null}}
 *   각 항목은 표시할 값이 없으면 null이다(빈 배지를 그리지 않기 위함).
 */
const ROLE_LABELS = Object.freeze({
  JOKER: "광대",
  DOCTOR: "의사",
  GUARD: "경비원",
  WITCH_HUNTER: "마녀사냥꾼",
})

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function summarizeRoomListSettings(settings) {
  if (!isPlainObject(settings)) return { roles: null, times: null, ariaText: null }

  let roles = null
  if (settings.roleCompositionMode === "custom" && isPlainObject(settings.roleCounts)) {
    // 0명인 역할은 적지 않는다 — 없는 직업을 "0명"으로 늘어놓으면 행이 읽기 어려워진다.
    const parts = Object.keys(ROLE_LABELS)
      .filter((role) => Number.isInteger(settings.roleCounts[role]) && settings.roleCounts[role] > 0)
      .map((role) => `${ROLE_LABELS[role]} ${settings.roleCounts[role]}`)
    if (parts.length > 0) roles = parts.join(" · ")
  } else if (Number.isInteger(settings.jokerCount)) {
    roles = `${ROLE_LABELS.JOKER} ${settings.jokerCount}`
  }

  const timeParts = []
  if (Number.isInteger(settings.dayDiscussionTime)) timeParts.push(`토론 ${settings.dayDiscussionTime}초`)
  if (Number.isInteger(settings.dayVoteTime)) timeParts.push(`투표 ${settings.dayVoteTime}초`)
  if (Number.isInteger(settings.nightActionTime)) timeParts.push(`밤 ${settings.nightActionTime}초`)
  const times = timeParts.length > 0 ? timeParts.join(" · ") : null

  const ariaParts = []
  if (roles) ariaParts.push(`직업 구성 ${roles}`)
  if (times) ariaParts.push(times)

  return { roles, times, ariaText: ariaParts.length > 0 ? ariaParts.join(", ") : null }
}
