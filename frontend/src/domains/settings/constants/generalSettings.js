/** 일반 탭 — 섹션 구분 */
export const GENERAL_SETTING_SECTIONS = {
  screen: "화면 모드",
  notification: "알림",
}

/** 일반 탭 — 체크박스 항목 */
export const GENERAL_SETTING_CHECKBOXES = [
  {
    id: "fullscreen",
    section: "screen",
    label: "전체화면 전환",
    defaultChecked: false,
  },
  {
    id: "friend-invite",
    section: "notification",
    label: "친구 초대",
    defaultChecked: true,
  },
  {
    id: "game-invite",
    section: "notification",
    label: "게임 초대",
    defaultChecked: true,
  },
  {
    id: "whisper",
    section: "notification",
    label: "귓속말",
    defaultChecked: true,
  },
  {
    id: "system-notification",
    section: "notification",
    label: "시스템 알림",
    defaultChecked: true,
  },
]

/** 일반 탭 — 텍스트 크기 슬라이더 */
export const GENERAL_SETTING_TEXT_SIZE = {
  id: "text-size",
  label: "텍스트 크기",
  min: 1,
  max: 5,
  defaultValue: 3,
}

/** 일반 탭 — 하단 액션 버튼 */
export const GENERAL_SETTING_ACTIONS = [
  { id: "replay-tutorial", label: "튜토리얼/도움말 다시 보기", buttonLabel: "다시 보기" },
  { id: "reset-settings", label: "설정 초기화", buttonLabel: "초기화" },
]
