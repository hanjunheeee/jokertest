import { useEffect, useRef } from "react"
import { useDragScroll } from "../../hooks/useDragScroll.js"
import {
  INGAME_CHAT_MESSAGE_LIST_INNER_CLASS,
  INGAME_CHAT_MESSAGE_LIST_SCROLL_CLASS,
  INGAME_CHAT_MESSAGE_LIST_SCROLL_WRAP_CLASS,
  INGAME_CHAT_MESSAGE_LIST_SPACER_CLASS,
} from "../../constants/ingameChatLayout.js"
import InGameChatMessageRow from "./InGameChatMessageRow.jsx"

/**
 * 인게임 채팅 메시지 목록 (프레임 본문 영역)
 */
export default function InGameChatMessageList({
  messages,
  textFieldWidth = 0,
  className = "",
}) {
  const scrollRef = useRef(null)
  useDragScroll(scrollRef)

  // justify-end + overflow-y-auto 조합은 초기 scrollTop=0이라 목록이 어긋나 보일 수 있음
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    requestAnimationFrame(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight
    })
  }, [messages])

  return (
    <div className={INGAME_CHAT_MESSAGE_LIST_SCROLL_WRAP_CLASS}>
      <div
        ref={scrollRef}
        className={`${INGAME_CHAT_MESSAGE_LIST_SCROLL_CLASS} ${className}`.trim()}
      >
        <ul
          className={INGAME_CHAT_MESSAGE_LIST_INNER_CLASS}
          aria-readonly="true"
          role="log"
          aria-label="채팅 내역"
        >
          <li aria-hidden className={INGAME_CHAT_MESSAGE_LIST_SPACER_CLASS} />
          {messages.map((message) => (
            <InGameChatMessageRow
              key={message.id}
              senderName={message.senderName}
              text={message.text}
              textFieldWidth={textFieldWidth}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}
