// 알림 창 보이는 목록 계산 (설정에서 끈 종류 빼기·안 읽은 수·본문 상태)
// 알림 창·알림 버튼·자동 읽음 훅·모두 읽음 액션이 씀
import { SETTING_KEY_BY_TYPE } from "../constants/notificationSettingKeys.js"

// 설정 키가 없는 종류는 늘 보임, 체크를 끈 종류만 숨김
export function selectVisibleNotifications(items, generalChecks) {
  const checks = generalChecks ?? {}
  return items.filter((item) => {
    const key = SETTING_KEY_BY_TYPE[item.type]
    if (key === undefined) return true
    return checks[key] !== false
  })
}

// 보이는 알림 중 안 읽은 수
export function selectUnreadCount(items, generalChecks) {
  return selectVisibleNotifications(items, generalChecks).filter((item) => !item.readAt).length
}

// 알림 창 본문 상태 정하기 (오류·불러오는 중·비어 있음·목록)
export function resolveBodyState(status, visibleCount) {
  if (status === "error") return "error"
  // 아직 한 번도 안 받았으면 불러오는 중으로 보임
  if (status === "idle" || status === "loading") return "loading"
  if (visibleCount === 0) return "empty"
  return "list"
}
