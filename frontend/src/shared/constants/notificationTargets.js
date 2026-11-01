// 알림을 눌렀을 때 갈 주소와 그 주소에 싣는 쿼리 이름, 대상 이름표
// notifications 알림 항목, lobby 알림 패널, library 화면이 씀
// 로비·서고가 이 쿼리로 해당 항목을 찾아 엶
export const FRIEND_REQUEST_PARAM = "notificationRequestId"

export const ACHIEVEMENT_PARAM = "achievementId"

export const GAME_INVITE_PARAM = "gameInviteId"

// 모르는 대상·빈 id면 null (주소에 엉뚱한 값 안 싣기)
export function buildNotificationTargetPath(target) {
  if (target === null || typeof target !== "object" || Array.isArray(target)) return null

  if (target.kind === "friend-request") {
    if (!Number.isInteger(target.requestId)) return null
    return `/lobby?${FRIEND_REQUEST_PARAM}=${encodeURIComponent(String(target.requestId))}`
  }

  if (target.kind === "game-invite") {
    if (typeof target.inviteId !== "string" || target.inviteId.length === 0) return null
    return `/lobby?${GAME_INVITE_PARAM}=${encodeURIComponent(target.inviteId)}`
  }

  if (target.kind === "achievement") {
    if (typeof target.achievementId !== "string" || target.achievementId.length === 0) return null
    return `/library?${ACHIEVEMENT_PARAM}=${encodeURIComponent(target.achievementId)}`
  }

  if (target.kind === "settings") return "/setting"

  return null
}

// 이동 버튼 글자, 모르는 대상이면 null
export function notificationTargetLabel(target) {
  if (target?.kind === "friend-request") return "요청 보러 가기"
  if (target?.kind === "game-invite") return "초대 보러 가기"
  if (target?.kind === "achievement") return "기억의 서고에서 보기"
  if (target?.kind === "settings") return "환경설정 열기"
  return null
}
