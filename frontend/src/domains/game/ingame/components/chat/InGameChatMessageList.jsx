// 채팅 메시지 목록: 끌어서 스크롤, 새 메시지 오면 맨 아래로
// 채팅 내용 틀(InGameChatContent)이 사용
import { useEffect, useRef } from "react"
import { useDragScroll } from "../../hooks/useDragScroll.js"
import {
  MSG_LIST_INNER_CLASS,
  MSG_LIST_SCROLL_CLASS,
  MSG_LIST_SCROLL_WRAP_CLASS,
  MSG_LIST_SPACER_CLASS,
} from "../../constants/chat/ingameChatLayout.js"
import InGameChatMessageRow from "./InGameChatMessageRow.jsx"

// 메시지 줄 묶음, 맨 위 빈 칸이 늘어나 적은 메시지도 아래부터 쌓임
export default function InGameChatMessageList({
  messages,
  textFieldWidth = 0,
  className = "",
}) {
  const scrollRef = useRef(null)
  useDragScroll(scrollRef)

  // 메시지 바뀌면 다음 프레임에 맨 아래로 (그려진 뒤 높이로)
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    requestAnimationFrame(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight
    })
  }, [messages])

  return (
    <div className={MSG_LIST_SCROLL_WRAP_CLASS}>
      <div
        ref={scrollRef}
        className={`${MSG_LIST_SCROLL_CLASS} ${className}`.trim()}
      >
        <ul
          className={MSG_LIST_INNER_CLASS}
          aria-readonly="true"
          role="log"
          aria-label="채팅 내역"
        >
          <li aria-hidden className={MSG_LIST_SPACER_CLASS} />
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
