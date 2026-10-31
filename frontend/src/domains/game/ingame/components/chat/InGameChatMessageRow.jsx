import {
  getInGameChatMessageBodyClass,
  getInGameChatMessageSenderClass,
  getInGameChatMessageTimeClass,
  getInGameChatTextScaleStyle,
  INGAME_CHAT_MESSAGE_ROW_CLASS,
} from "../../constants/chat/ingameChatLayout.js"
import {
  INGAME_SETTING_CHAT_CHECKBOXES,
  INGAME_SETTING_CHAT_SLIDER,
} from "../../constants/controls/ingameSetting/ingameSettingData.js"
import { useSettingsStore } from "../../../../settings/store/settingsStore.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import { useInGameChatVariant } from "./InGameChatVariantContext.jsx"
import {
  resolveInGameChatPlayerColor,
  selectChatNicknameColorEnabled,
} from "./resolveInGameChatPlayerColor.js"

const SHOW_TIME_SETTING_ID = "show-time"
const SHOW_TIME_DEFAULT_CHECKED =
  INGAME_SETTING_CHAT_CHECKBOXES.find(({ id }) => id === SHOW_TIME_SETTING_ID)?.defaultChecked ??
  false

function selectChatShowTimeEnabled(state) {
  return state.chatChecks?.[SHOW_TIME_SETTING_ID] ?? SHOW_TIME_DEFAULT_CHECKED
}

function selectChatTextSize(state) {
  return state.chatTextSize ?? INGAME_SETTING_CHAT_SLIDER.defaultValue
}

function formatChatMessageTime(sentAt) {
  if (!Number.isFinite(sentAt)) return null
  const date = new Date(sentAt)
  if (Number.isNaN(date.getTime())) return null

  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

export default function InGameChatMessageRow({
  playerId = null,
  senderName,
  text,
  textFieldWidth = 0,
  sentAt = null,
}) {
  const variant = useInGameChatVariant()
  const { getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
  const themeStyles = playerId ? getThemeStylesByPlayerId(playerId) : null

  const nicknameColorEnabled = useSettingsStore(selectChatNicknameColorEnabled)
  const showTimeEnabled = useSettingsStore(selectChatShowTimeEnabled)
  const chatTextSize = useSettingsStore(selectChatTextSize)

  const { style: themedTextStyle, className: themedTextClass } = resolveInGameChatPlayerColor(
    themeStyles,
    nicknameColorEnabled,
  )

  const chatTextScaleStyle = getInGameChatTextScaleStyle(chatTextSize)

  const formattedTime = showTimeEnabled ? formatChatMessageTime(sentAt) : null

  const messageMaxWidth =
    textFieldWidth > 0
      ? variant === "closeup" || variant === "tribunal"
        ? textFieldWidth * 0.92
        : textFieldWidth
      : 0

  return (
    <li className={INGAME_CHAT_MESSAGE_ROW_CLASS} style={chatTextScaleStyle}>
      {formattedTime ? (
        <span className={getInGameChatMessageTimeClass(variant)}>{formattedTime}</span>
      ) : null}
      <span
        className={`${getInGameChatMessageSenderClass(variant)} ${themedTextClass}`.trim()}
        style={themedTextStyle}
      >
        {senderName}:
      </span>
      <span
        className={`${getInGameChatMessageBodyClass(variant)} ${themedTextClass}`.trim()}
        aria-readonly="true"
        style={{
          ...themedTextStyle,
          ...(messageMaxWidth > 0 ? { maxWidth: messageMaxWidth } : undefined),
        }}
      >
        &quot;{text}&quot;
      </span>
    </li>
  )
}
