export const SETTING_SECTIONS = {
  screen: "화면 모드",
  notification: "알림",
}

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

export const GENERAL_SETTING_TEXT_SIZE = {
  id: "text-size",
  label: "텍스트 크기",
  min: 1,
  max: 5,
  defaultValue: 3,
}

export const GENERAL_SETTING_ACTIONS = [
  { id: "replay-tutorial", label: "튜토리얼/도움말 다시 보기", buttonLabel: "다시 보기" },
  { id: "reset-settings", label: "설정 초기화", buttonLabel: "초기화" },
]
