import {
  INGAME_PLAYER_THEME_TEXT_RENDER_CLASS,
  INGAME_PLAYER_THEME_TEXT_SHADOW,
} from "../../constants/ingamePlayerTheme.js"
import { INGAME_SETTING_CHAT_CHECKBOXES } from "../../constants/controls/ingameSetting/ingameSettingData.js"
import { useSettingsStore } from "../../../../settings/store/settingsStore.js"

const NICKNAME_COLOR_SETTING_ID = "nickname-color"

const NICKNAME_COLOR_DEFAULT_CHECKED =
  INGAME_SETTING_CHAT_CHECKBOXES.find(({ id }) => id === NICKNAME_COLOR_SETTING_ID)
    ?.defaultChecked ?? false

/** useSettingsStore 구독용 selector — InGameChatMessageRow처럼 이미 마운트된 행이 설정
 *  변경에 반응해 다시 그려지게 하려면(F-15) 이 값 자체를 useSettingsStore(selector)로
 *  구독해야 한다. resolveInGameChatPlayerColor 내부의 getState() 스냅샷 읽기만으로는
 *  아무 구독도 만들지 않아, 이미 마운트된 메시지 행은 설정이 바뀌어도 다시 그려지지
 *  않는다. */
export function selectChatNicknameColorEnabled(state) {
  return state.chatChecks?.[NICKNAME_COLOR_SETTING_ID] ?? NICKNAME_COLOR_DEFAULT_CHECKED
}

/**
 * 채팅 행이 발신자·본문에 실제로 쓰는 색 스타일·클래스 — themeStyles(세션이 colorIndex를
 * 해석한 결과)가 없으면(구세션 등) 색 없이 기본색으로 그리고, "닉네임 색상 표시" 설정이
 * 꺼져 있어도 같은 기본색으로 그린다(F-15 AC-02/AC-04). 색의 유일한 입력은 공개
 * colorIndex뿐이라(비밀 진영·직업을 전혀 참조하지 않는다) 이 설정은 표시 여부만 가릴 뿐
 * 노출 위험이 있는 값을 추가로 다루지 않는다.
 * @param {{ color: string } | null | undefined} themeStyles
 * @param {boolean} [nicknameColorEnabledOverride] 호출부가 이미 useSettingsStore(
 *   selectChatNicknameColorEnabled)로 구독한 최신 값. 생략하면(기존 호출부 호환)
 *   getState()로 스냅샷을 읽는다 — 이 경우 호출부가 별도로 구독하지 않으면 설정이
 *   바뀌어도 다시 렌더되지 않으니 주의한다.
 */
export function resolveInGameChatPlayerColor(themeStyles, nicknameColorEnabledOverride) {
  const nicknameColorEnabled =
    nicknameColorEnabledOverride !== undefined
      ? nicknameColorEnabledOverride
      : selectChatNicknameColorEnabled(useSettingsStore.getState())
  const applyColor = Boolean(themeStyles) && nicknameColorEnabled

  return {
    style: applyColor
      ? { color: themeStyles.color, textShadow: INGAME_PLAYER_THEME_TEXT_SHADOW }
      : undefined,
    className: applyColor ? INGAME_PLAYER_THEME_TEXT_RENDER_CLASS : "",
  }
}
