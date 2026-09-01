/**
 * 인게임 설정 탭·항목 정의 — store 연동 전 UI용.
 */

/** @typedef {"chat" | "sound" | "room"} InGameSettingTabId */

export const INGAME_SETTING_TABS = [
  { id: "chat", label: "채팅" },
  { id: "sound", label: "사운드" },
  { id: "room", label: "방관리", hostOnly: true },
]

/** UI 레이아웃 검증용 — 기본 false. true면 hostUuid 없을 때도 방관리 탭을 노출한다. */
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
    id: "allow-spectators",
    title: "관전자 허용",
    defaultChecked: false,
  },
  {
    kind: "checkbox",
    id: "keep-settings-next-game",
    title: "다음 게임 동일 설정 유지",
    description: "현재 방 설정을 다음 게임에서도 유지합니다.",
    defaultChecked: false,
  },
  {
    kind: "action",
    id: "view-room-code",
    title: "방 코드 복사",
    description: "방 코드를 확인하고 복사할 수 있습니다.",
    actionLabel: "방 코드 보기",
  },
  {
    kind: "action",
    id: "force-end-game",
    title: "게임 강제 종료",
    description: "현재 게임을 강제로 종료합니다.",
    actionLabel: "게임 강제종료",
    actionTone: "danger",
  },
]

/** @type {InGameSettingTabId} */
export const INGAME_SETTING_DEFAULT_TAB = "chat"

export const INGAME_SETTING_SOUND_VOLUMES = [
  {
    id: "master-volume",
    label: "Master Volume",
    min: 0,
    max: 100,
    defaultValue: 80,
  },
  {
    id: "bgm-volume",
    label: "배경음",
    min: 0,
    max: 100,
    defaultValue: 70,
  },
  {
    id: "sfx-volume",
    label: "효과음",
    min: 0,
    max: 100,
    defaultValue: 60,
  },
]

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
    defaultChecked: false,
  },
]
