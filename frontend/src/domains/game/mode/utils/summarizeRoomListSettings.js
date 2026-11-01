// 방 목록 줄 설정 요약: 직업 구성·제한 시간 글자, 읽기 문구
// RoomListRow가 씀, 서버가 준 방 설정을 표시만 함
import { isPlainObject } from "../../shared/utils/valueChecks.js"

// 요약에 넣는 직업과 이름 (시민은 뺌)
const ROLE_LABELS = Object.freeze({
  JOKER: "광대",
  DOCTOR: "의사",
  GUARD: "경비원",
  WITCH_HUNTER: "마녀사냥꾼",
})

// 설정 요약 만들기 (설정 없으면 다 null)
export function summarizeRoomListSettings(settings) {
  if (!isPlainObject(settings)) return { roles: null, times: null, ariaText: null }

  // 직업: 직접 구성이면 1명 이상인 직업만, 아니면 광대 수만
  let roles = null
  if (settings.roleCompositionMode === "custom" && isPlainObject(settings.roleCounts)) {
    const parts = Object.keys(ROLE_LABELS)
      .filter((role) => Number.isInteger(settings.roleCounts[role]) && settings.roleCounts[role] > 0)
      .map((role) => `${ROLE_LABELS[role]} ${settings.roleCounts[role]}`)
    if (parts.length > 0) roles = parts.join(" · ")
  } else if (Number.isInteger(settings.jokerCount)) {
    roles = `${ROLE_LABELS.JOKER} ${settings.jokerCount}`
  }

  // 시간: 토론·투표·밤 (숫자인 것만)
  const timeParts = []
  if (Number.isInteger(settings.dayDiscussionTime)) timeParts.push(`토론 ${settings.dayDiscussionTime}초`)
  if (Number.isInteger(settings.dayVoteTime)) timeParts.push(`투표 ${settings.dayVoteTime}초`)
  if (Number.isInteger(settings.nightActionTime)) timeParts.push(`밤 ${settings.nightActionTime}초`)
  const times = timeParts.length > 0 ? timeParts.join(" · ") : null

  // 읽기 프로그램용 한 줄
  const ariaParts = []
  if (roles) ariaParts.push(`직업 구성 ${roles}`)
  if (times) ariaParts.push(times)

  return { roles, times, ariaText: ariaParts.length > 0 ? ariaParts.join(", ") : null }
}
