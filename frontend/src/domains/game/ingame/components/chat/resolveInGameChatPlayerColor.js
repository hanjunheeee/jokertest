// 채팅 닉네임 색: 플레이어 테마 색을 글에 입힐지와 그 모양
// 채팅 메시지 줄(InGameChatMessageRow)이 사용
import {
  THEME_TEXT_RENDER_CLASS,
  THEME_TEXT_SHADOW,
} from "../../../../../shared/constants/ingamePlayerTheme.js"
import { INGAME_SETTING_CHAT_CHECKBOXES } from "../../constants/controls/ingameSetting/ingameSettingData.js"
import { useSettingsStore } from "../../../../settings/store/settingsStore.js"

// 닉네임 색 설정 id와 기본값 (설정 화면 목록 값 그대로)
const NICKNAME_COLOR_SETTING_ID = "nickname-color"

const NICKNAME_COLOR_DEFAULT_CHECKED =
  INGAME_SETTING_CHAT_CHECKBOXES.find(({ id }) => id === NICKNAME_COLOR_SETTING_ID)
    ?.defaultChecked ?? false

// 닉네임 색 켜짐 여부 (안 건드렸으면 기본값)
export function selectNicknameColorEnabled(state) {
  return state.chatChecks?.[NICKNAME_COLOR_SETTING_ID] ?? NICKNAME_COLOR_DEFAULT_CHECKED
}

// 테마 있고 설정 켜졌을 때만 색·그림자, 설정 값 안 넘기면 스토어에서 바로 읽음
export function resolveInGameChatPlayerColor(themeStyles, nicknameColorEnabledOverride) {
  const nicknameColorEnabled =
    nicknameColorEnabledOverride !== undefined
      ? nicknameColorEnabledOverride
      : selectNicknameColorEnabled(useSettingsStore.getState())
  const applyColor = Boolean(themeStyles) && nicknameColorEnabled

  return {
    style: applyColor
      ? { color: themeStyles.color, textShadow: THEME_TEXT_SHADOW }
      : undefined,
    className: applyColor ? THEME_TEXT_RENDER_CLASS : "",
  }
}
