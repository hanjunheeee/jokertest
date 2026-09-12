/**
 * F-17 알림 대상 → 앱 내부 경로(AC-02).
 *
 * 서버가 저장한 target은 허용된 세 형태뿐이다. 임의 URL·외부 주소를 만들지 않는다 —
 * 알림 본문이 임의의 곳으로 데려가는 통로가 되면 안 되므로, **모르는 형태는 null**이고
 * 화면은 이동 버튼 자체를 보여주지 않는다.
 *
 * 이 파일은 순수 함수만 담는다(라우터·store·DOM을 모른다) — 시험이 매핑 자체를 직접
 * 검증할 수 있게 하기 위해서다.
 */

/** 친구 요청 알림이 여는 곳: 로비의 친구 패널 "요청 수락" 탭에서 그 요청 행을 가리킨다. */
export const NOTIFICATION_FRIEND_REQUEST_PARAM = "notificationRequestId"

/** 업적 알림이 여는 곳: 기억의 서고에서 그 업적이 있는 페이지. */
export const NOTIFICATION_ACHIEVEMENT_PARAM = "achievementId"

/**
 * @param {{kind?: string, requestId?: number, achievementId?: string}|null} target
 * @returns {string|null} 앱 내부 경로. 해석할 수 없으면 null.
 */
export function buildNotificationTargetPath(target) {
  if (target === null || typeof target !== "object" || Array.isArray(target)) return null

  if (target.kind === "friend-request") {
    // 원본 요청 행 id만 싣는다. 이 값으로 요청을 새로 만들거나 자동 수락하지 않는다 —
    // 로비는 실제 incomingRequests에서 같은 request_id를 찾아 표시할 뿐이다.
    if (!Number.isInteger(target.requestId)) return null
    return `/lobby?${NOTIFICATION_FRIEND_REQUEST_PARAM}=${encodeURIComponent(String(target.requestId))}`
  }

  if (target.kind === "achievement") {
    if (typeof target.achievementId !== "string" || target.achievementId.length === 0) return null
    return `/library?${NOTIFICATION_ACHIEVEMENT_PARAM}=${encodeURIComponent(target.achievementId)}`
  }

  // 시스템 안내는 확인된 설정 화면으로만 보낸다.
  if (target.kind === "settings") return "/setting"

  return null
}

/** 이동 버튼 문구 — 대상 종류마다 무엇이 열리는지 분명히 한다. */
export function notificationTargetLabel(target) {
  if (target?.kind === "friend-request") return "요청 보러 가기"
  if (target?.kind === "achievement") return "기억의 서고에서 보기"
  if (target?.kind === "settings") return "환경설정 열기"
  return null
}
