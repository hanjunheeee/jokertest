// 채팅 메시지 한 줄: 시각·보낸 사람·글, 설정 따라 시각·닉네임 색·글자 크기
// 채팅 메시지 목록(InGameChatMessageList)이 사용
import {
  getInGameChatMessageBodyClass,
  getInGameChatMessageSenderClass,
  getInGameChatMessageTimeClass,
  getInGameChatTextScaleStyle,
  MSG_ROW_CLASS,
} from "../../constants/chat/ingameChatLayout.js"
import {
  INGAME_SETTING_CHAT_CHECKBOXES,
  INGAME_SETTING_CHAT_SLIDER,
} from "../../constants/controls/ingameSetting/ingameSettingData.js"
import { useSettingsStore } from "../../../../settings/store/settingsStore.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import { useChatVariant } from "./InGameChatVariantContext.jsx"
import {
  resolveInGameChatPlayerColor,
  selectNicknameColorEnabled,
} from "./resolveInGameChatPlayerColor.js"

// 시각 보이기 설정 id와 기본값 (설정 화면 목록 값 그대로)
const SHOW_TIME_SETTING_ID = "show-time"
const SHOW_TIME_DEFAULT_CHECKED =
  INGAME_SETTING_CHAT_CHECKBOXES.find(({ id }) => id === SHOW_TIME_SETTING_ID)?.defaultChecked ??
  false

// 시각 보이기 켜짐 여부 (안 건드렸으면 기본값)
function selectShowTimeEnabled(state) {
  return state.chatChecks?.[SHOW_TIME_SETTING_ID] ?? SHOW_TIME_DEFAULT_CHECKED
}

// 채팅 글자 크기 (없으면 기본값, 입력칸에도 같은 함수 있음)
function selectChatTextSize(state) {
  return state.chatTextSize ?? INGAME_SETTING_CHAT_SLIDER.defaultValue
}

// 받은 시각을 시:분으로, 이상한 값이면 시각 안 보임
function formatChatMessageTime(sentAt) {
  if (!Number.isFinite(sentAt)) return null
  const date = new Date(sentAt)
  if (Number.isNaN(date.getTime())) return null

  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

// 보낸 사람 색은 테마 색 (닉네임 색 설정 끄면 기본색)
export default function InGameChatMessageRow({
  playerId = null,
  senderName,
  text,
  textFieldWidth = 0,
  sentAt = null,
}) {
  const variant = useChatVariant()
  const { getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
  const themeStyles = playerId ? getThemeStylesByPlayerId(playerId) : null

  const nicknameColorEnabled = useSettingsStore(selectNicknameColorEnabled)
  const showTimeEnabled = useSettingsStore(selectShowTimeEnabled)
  const chatTextSize = useSettingsStore(selectChatTextSize)

  const { style: themedTextStyle, className: themedTextClass } = resolveInGameChatPlayerColor(
    themeStyles,
    nicknameColorEnabled,
  )

  const chatTextScaleStyle = getInGameChatTextScaleStyle(chatTextSize)

  const formattedTime = showTimeEnabled ? formatChatMessageTime(sentAt) : null

  // 글 최대 너비는 입력칸 너비 기준, 크게 보기·재판 모양은 조금 좁게
  const messageMaxWidth =
    textFieldWidth > 0
      ? variant === "closeup" || variant === "tribunal"
        ? textFieldWidth * 0.92
        : textFieldWidth
      : 0

  return (
    <li className={MSG_ROW_CLASS} style={chatTextScaleStyle}>
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
