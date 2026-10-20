/**
 * 인게임 설정 탭·항목 정의 — store 연동 전 UI용.
 */

/** @typedef {"chat" | "sound" | "room"} InGameSettingTabId */

// 사운드 슬라이더 항목은 설정 화면(UI-05)과 같은 정의를 그대로 쓴다 — 인게임 설정과
// 설정 페이지가 서로 다른 기본값·항목을 갖지 않도록 원본을 한 곳(soundSettings.js)에만 둔다.
// 값 자체도 UI-05와 같은 store(settings/store/settingsStore.js)가 보관한다
// (useInGameSettingPanel 참고).
export { SOUND_SETTING_VOLUMES as INGAME_SETTING_SOUND_VOLUMES } from "../../../../../settings/constants/soundSettings.js"

/**
 * F-16(AC-03): 인게임 사운드 탭의 효과음 음소거 항목.
 *
 * 라벨만 이 도메인이 정하고 값은 설정 화면(UI-05)과 같은 store(settingsStore.sfxMuted)에
 * 둔다 — 위 슬라이더와 같은 이유다. 이 항목은 **효과음에만** 적용되며 배경음(Master × 배경음
 * 슬라이더)에는 영향을 주지 않는다.
 */
export const INGAME_SETTING_SFX_MUTE = {
  id: "sfx-muted",
  label: "효과음 음소거",
}

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
  // F-23(AC-01/AC-02): "관전자 허용" 체크박스는 여기서 제거했다. 외부 관전자 입장은 설정·
  // 라우트·서버 권한 어디에도 두지 않는다(GAME-03). 이미 그 판에 참가한 **사망자**가 계속
  // 보는 것은 별도 관전 기능이 아니라 기존 참가자 신분 그대로이므로(InGamePage의 사망 선택),
  // 이 제거가 그 수신을 건드리지 않는다.
  {
    kind: "checkbox",
    id: "keep-settings-next-game",
    title: "다음 게임 동일 설정 유지",
    description: "현재 방 설정을 다음 게임에서도 유지합니다.",
    defaultChecked: false,
  },
]

/** @type {InGameSettingTabId} */
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
