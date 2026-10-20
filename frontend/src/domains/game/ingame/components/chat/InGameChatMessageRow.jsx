// 파일 역할: InGameChatMessageRow.jsx - 화면을 구성하는 컴포넌트입니다.
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

/** F-15(AC-02): sentAt(서버 now()가 만든 ms epoch 정수)을 "HH:MM" 24시간 표기로 바꾼다 —
 *  렌더 시점의 Date.now()가 아니라 메시지가 실제로 전송된 시각만 쓴다. */
function formatChatMessageTime(sentAt) {
  if (!Number.isFinite(sentAt)) return null
  const date = new Date(sentAt)
  if (Number.isNaN(date.getTime())) return null

  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

/**
 * 인게임 채팅 메시지 — 입력창과 동일 CSS wrap (textarea와 같은 클래스·폭)
 */
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

  // F-15: 이 세 값을 훅으로 구독해야(getState() 스냅샷이 아니라) 이미 마운트된 메시지
  // 행이 설정 변경에 반응해 다시 그려진다.
  const nicknameColorEnabled = useSettingsStore(selectChatNicknameColorEnabled)
  const showTimeEnabled = useSettingsStore(selectChatShowTimeEnabled)
  const chatTextSize = useSettingsStore(selectChatTextSize)

  const { style: themedTextStyle, className: themedTextClass } = resolveInGameChatPlayerColor(
    themeStyles,
    nicknameColorEnabled,
  )

  // 배율은 행에 CSS 변수로 한 번만 얹고, 발신자·본문·시각 span의 타이포 클래스가 그
  // 변수를 clamp 세 항에 곱해 쓴다 — font-size를 인라인으로 덮어써 clamp 경계를 버리지
  // 않기 위해서다(ingameChatLayout.js 주석 참고).
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
