// 설정 창 항목 값 (소리·채팅), 방관리 탭은 없앰 (사용자 결정 2026-11-16)
// 설정 탭·채팅 줄·모바일 설정 탭이 같이 씀
export { SOUND_SETTING_VOLUMES as INGAME_SETTING_SOUND_VOLUMES } from "../../../../../../shared/constants/soundSettings.js"

export const INGAME_SETTING_SFX_MUTE = {
  id: "sfx-muted",
  label: "효과음 음소거",
}

export const INGAME_SETTING_TABS = [
  { id: "chat", label: "채팅" },
  { id: "sound", label: "사운드" },
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

/** 채팅 탭 체크 한 줄 — 켜면 타이머:채팅, 끄면 타이머:시간바 */
export const INGAME_SETTING_TIMER_PLACEMENT_CHAT_LABEL = "채팅에 타이머 표시"

/** 임시: 설정 채팅 탭 «채팅에 타이머 표시» 항목 노출 (다시 켤 때 true) */
export const INGAME_SETTING_SHOW_TIMER_PLACEMENT_OPTION = false
