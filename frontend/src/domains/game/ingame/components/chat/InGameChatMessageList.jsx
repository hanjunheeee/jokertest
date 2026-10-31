import { useEffect, useRef } from "react"
import { useDragScroll } from "../../hooks/useDragScroll.js"
import {
  INGAME_CHAT_MESSAGE_LIST_INNER_CLASS,
  INGAME_CHAT_MESSAGE_LIST_SCROLL_CLASS,
  INGAME_CHAT_MESSAGE_LIST_SCROLL_WRAP_CLASS,
  INGAME_CHAT_MESSAGE_LIST_SPACER_CLASS,
} from "../../constants/chat/ingameChatLayout.js"
import InGameChatMessageRow from "./InGameChatMessageRow.jsx"

export default function InGameChatMessageList({
  messages,
  textFieldWidth = 0,
  className = "",
}) {
  const scrollRef = useRef(null)
  useDragScroll(scrollRef)

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
              playerId={message.playerId}
              senderName={message.senderName}
              text={message.text}
              textFieldWidth={textFieldWidth}
              sentAt={message.sentAt}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}
