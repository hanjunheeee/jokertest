export { SOUND_SETTING_VOLUMES as INGAME_SETTING_SOUND_VOLUMES } from "../../../../../../shared/constants/soundSettings.js"

export const INGAME_SETTING_SFX_MUTE = {
  id: "sfx-muted",
  label: "효과음 음소거",
}

export const INGAME_SETTING_TABS = [
  { id: "chat", label: "채팅" },
  { id: "sound", label: "사운드" },
  { id: "room", label: "방관리", hostOnly: true },
]

export const INGAME_SETTING_PREVIEW_AS_HOST = false

export const INGAME_SETTING_ROOM_ROWS = [
  {
    kind: "action",
    id: "kick-player",
    title: "플레이어 추방",
    description: "추방할 플레이어를 선택 후 추방할 수 있습니다.",
    actionLabel: "추방하기",
  },
  {
    kind: "checkbox",
    id: "keep-settings-next-game",
    title: "다음 게임 동일 설정 유지",
    description: "현재 방 설정을 다음 게임에서도 유지합니다.",
    defaultChecked: false,
  },
]

export const INGAME_SETTING_DEFAULT_TAB = "chat"

export const INGAME_SETTING_CHAT_SLIDER = {
  id: "chat-text-size",
  label: "채팅 글자 크기",
  min: 0,
  max: 100,
  defaultValue: 100,
}

export const INGAME_SETTING_CHAT_CHECKBOXES = [
  {
    id: "show-time",
    label: "채팅 시간 표시",
    defaultChecked: false,
  },
  {
    id: "nickname-color",
    label: "닉네임 색상 표시",
    defaultChecked: true,
  },
]
