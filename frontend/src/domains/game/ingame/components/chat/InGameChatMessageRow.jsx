// 파일 역할: InGameChatMessageRow.jsx - 화면을 구성하는 컴포넌트입니다.
import {
  getInGameChatMessageBodyClass,
  getInGameChatMessageSenderClass,
  INGAME_CHAT_MESSAGE_ROW_CLASS,
} from "../../constants/chat/ingameChatLayout.js"
import { INGAME_PLAYER_THEME_TEXT_RENDER_CLASS } from "../../constants/ingamePlayerTheme.js"
import { useInGamePlayerSessionContext } from "../InGamePlayerSessionContext.js"
import { useInGameChatVariant } from "./InGameChatVariantContext.jsx"

/**
 * 인게임 채팅 메시지 — 입력창과 동일 CSS wrap (textarea와 같은 클래스·폭)
 */
export default function InGameChatMessageRow({
  playerId = null,
  senderName,
  text,
  textFieldWidth = 0,
}) {
  const variant = useInGameChatVariant()
  const { getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
  const themeStyles = playerId ? getThemeStylesByPlayerId(playerId) : null

  const themedTextStyle = themeStyles ? { color: themeStyles.color } : undefined

  const themedTextClass = themeStyles ? INGAME_PLAYER_THEME_TEXT_RENDER_CLASS : ""

  const messageMaxWidth =
    textFieldWidth > 0
      ? variant === "closeup"
        ? textFieldWidth * 0.92
        : textFieldWidth
      : 0

  return (
    <li className={INGAME_CHAT_MESSAGE_ROW_CLASS}>
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
