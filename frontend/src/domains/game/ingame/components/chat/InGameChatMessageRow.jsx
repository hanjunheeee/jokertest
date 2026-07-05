import {
  INGAME_CHAT_MESSAGE_BODY_CLASS,
  INGAME_CHAT_MESSAGE_ROW_CLASS,
  INGAME_CHAT_MESSAGE_SENDER_CLASS,
} from "../../constants/ingameChatLayout.js"

/**
 * 인게임 채팅 메시지 — 입력창과 동일 CSS wrap (textarea와 같은 클래스·폭)
 */
export default function InGameChatMessageRow({
  // senderName: 메시지를 보낸 사람 이름 — 아바타 옆 라벨로 표시
  senderName,
  // text: 실제 채팅 내용
  text,
  textFieldWidth = 0,
}) {
  return (
    <li className={INGAME_CHAT_MESSAGE_ROW_CLASS}>
      <span className={INGAME_CHAT_MESSAGE_SENDER_CLASS}>{senderName}:</span>
      <span
        className={INGAME_CHAT_MESSAGE_BODY_CLASS}
        aria-readonly="true"
        style={
          textFieldWidth > 0 ? { maxWidth: textFieldWidth } : undefined
        }
      >
        &quot;{text}&quot;
      </span>
    </li>
  )
}
