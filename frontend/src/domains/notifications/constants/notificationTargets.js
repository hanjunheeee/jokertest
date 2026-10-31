export const NOTIFICATION_FRIEND_REQUEST_PARAM = "notificationRequestId"

export const NOTIFICATION_ACHIEVEMENT_PARAM = "achievementId"

export const NOTIFICATION_GAME_INVITE_PARAM = "gameInviteId"

export function buildNotificationTargetPath(target) {
  if (target === null || typeof target !== "object" || Array.isArray(target)) return null

  if (target.kind === "friend-request") {
    if (!Number.isInteger(target.requestId)) return null
    return `/lobby?${NOTIFICATION_FRIEND_REQUEST_PARAM}=${encodeURIComponent(String(target.requestId))}`
  }

  if (target.kind === "game-invite") {
    if (typeof target.inviteId !== "string" || target.inviteId.length === 0) return null
    return `/lobby?${NOTIFICATION_GAME_INVITE_PARAM}=${encodeURIComponent(target.inviteId)}`
  }

  if (target.kind === "achievement") {
    if (typeof target.achievementId !== "string" || target.achievementId.length === 0) return null
    return `/library?${NOTIFICATION_ACHIEVEMENT_PARAM}=${encodeURIComponent(target.achievementId)}`
  }

  if (target.kind === "settings") return "/setting"

  return null
}

export function notificationTargetLabel(target) {
  if (target?.kind === "friend-request") return "요청 보러 가기"
  if (target?.kind === "game-invite") return "초대 보러 가기"
  if (target?.kind === "achievement") return "기억의 서고에서 보기"
  if (target?.kind === "settings") return "환경설정 열기"
  return null
}
