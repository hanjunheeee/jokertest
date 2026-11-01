// 알림 종류 → 일반 설정 체크 키 표
// 보이는 알림 고르기(utils/visibleNotifications.js)와 알림 스토어 입구가 씀
export const NOTIFICATION_SETTING_KEY_BY_TYPE = Object.freeze({
  "friend-request": "friend-invite",
  "game-invite": "game-invite",
  achievement: "system-notification",
  system: "system-notification",
})
