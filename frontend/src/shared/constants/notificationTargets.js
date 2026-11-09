// 알림을 눌렀을 때 갈 주소와 그 주소에 싣는 쿼리 이름, 대상 이름표
// notifications 알림 항목, lobby 알림 패널·메뉴(문의 창), library 화면이 씀
// 로비·서고가 이 쿼리로 해당 항목을 찾아 엶
export const FRIEND_REQUEST_PARAM = "notificationRequestId"

export const ACHIEVEMENT_PARAM = "achievementId"

export const GAME_INVITE_PARAM = "gameInviteId"

// 문의 답 알림 → 로비 문의 창에서 그 문의를 엶
export const INQUIRY_PARAM = "inquiryId"

// 문의 id는 양의 정수 (서버 BIGINT라 숫자 글자로 와도 받음)
// 예) 7 → "7" / "12" → "12" / 0·"a"·-1 → null
export function toInquiryIdText(value) {
  const text = typeof value === "number" ? String(value) : value
  return typeof text === "string" && /^[1-9]\d{0,18}$/.test(text) ? text : null
}

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

  if (target.kind === "inquiry") {
    const id = toInquiryIdText(target.inquiryId)
    return id === null ? null : `/lobby?${INQUIRY_PARAM}=${id}`
  }

  return null
}

// 이동 버튼 글자, 모르는 대상이면 null
export function notificationTargetLabel(target) {
  if (target?.kind === "friend-request") return "요청 보러 가기"
  if (target?.kind === "game-invite") return "초대 보러 가기"
  if (target?.kind === "achievement") return "기억의 서고에서 보기"
  if (target?.kind === "settings") return "환경설정 열기"
  if (target?.kind === "inquiry") return "문의 답 보기"
  return null
}
