// 설정 창 항목 값 (소리·채팅·방)
// 설정 탭·채팅 줄·모바일 설정 탭이 같이 씀
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

export const PREVIEW_AS_HOST = false

// 방관리 탭 안내 (판이 끝나면 늘 같은 방으로 돌아가 유지 스위치가 필요 없음)
export const INGAME_SETTING_ROOM_NOTICE = "게임이 끝나면 같은 방 코드·같은 설정으로 대기방이 다시 열립니다."

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
