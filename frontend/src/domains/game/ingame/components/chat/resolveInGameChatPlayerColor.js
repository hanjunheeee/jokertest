import {
  THEME_TEXT_RENDER_CLASS,
  THEME_TEXT_SHADOW,
} from "../../../../../shared/constants/ingamePlayerTheme.js"
import { INGAME_SETTING_CHAT_CHECKBOXES } from "../../constants/controls/ingameSetting/ingameSettingData.js"
import { useSettingsStore } from "../../../../settings/store/settingsStore.js"

const NICKNAME_COLOR_SETTING_ID = "nickname-color"

const NICKNAME_COLOR_DEFAULT_CHECKED =
  INGAME_SETTING_CHAT_CHECKBOXES.find(({ id }) => id === NICKNAME_COLOR_SETTING_ID)
    ?.defaultChecked ?? false

export function selectNicknameColorEnabled(state) {
  return state.chatChecks?.[NICKNAME_COLOR_SETTING_ID] ?? NICKNAME_COLOR_DEFAULT_CHECKED
}

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
