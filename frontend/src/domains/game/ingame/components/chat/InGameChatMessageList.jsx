// 채팅 메시지 목록: 끌어서 스크롤, 새 메시지 오면 바닥 근처일 때만 맨 아래로
// 채팅 내용 틀(InGameChatContent)이 사용
import { useEffect, useLayoutEffect, useRef } from "react"
import { useDragScroll } from "../../hooks/useDragScroll.js"
import {
  MSG_LIST_INNER_CLASS,
  MSG_LIST_SCROLL_CLASS,
  MSG_LIST_SCROLL_WRAP_CLASS,
  MSG_LIST_SPACER_CLASS,
} from "../../constants/chat/ingameChatLayout.js"
import InGameChatMessageRow from "./InGameChatMessageRow.jsx"

// 바닥에서 이 정도(px) 안이면 바닥에 있는 것으로 봄
const STICK_TO_BOTTOM_PX = 48

// 메시지 줄 묶음, 맨 위 빈 칸이 늘어나 적은 메시지도 아래부터 쌓임
export default function InGameChatMessageList({
  messages,
  textFieldWidth = 0,
  className = "",
}) {
  const scrollRef = useRef(null)
  useDragScroll(scrollRef)

  // 새 메시지 그리기 직전에 바닥 근처였는지 적어 둠 (위로 올려 옛 메시지 읽는 중이면 안 끌어내림)
  const stickToBottomRef = useRef(true)
  const isFirstScrollRef = useRef(true)
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return undefined
    const onScroll = () => {
      const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight
      stickToBottomRef.current = distance <= STICK_TO_BOTTOM_PX
    }
    scrollEl.addEventListener("scroll", onScroll, { passive: true })
    return () => scrollEl.removeEventListener("scroll", onScroll)
  }, [])

  // 메시지 바뀌면 다음 프레임에 맨 아래로 (처음이거나 바닥 근처였을 때만, 그려진 뒤 높이로)
  useEffect(() => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return undefined
    if (!isFirstScrollRef.current && !stickToBottomRef.current) return undefined
    isFirstScrollRef.current = false

    const frame = requestAnimationFrame(() => {
      scrollEl.scrollTop = scrollEl.scrollHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [messages])

  return (
    <div className={MSG_LIST_SCROLL_WRAP_CLASS}>
      {/* 새 글 알림은 바깥 칸(role=log)이 맡고 목록은 목록 구조 그대로 */}
      <div
        ref={scrollRef}
        className={`${MSG_LIST_SCROLL_CLASS} ${className}`.trim()}
        role="log"
        aria-label="채팅 내역"
      >
        <ul className={MSG_LIST_INNER_CLASS}>
          <li aria-hidden className={MSG_LIST_SPACER_CLASS} />
          {messages.map((message) => (
            <InGameChatMessageRow
              key={message.id}
              playerId={message.playerId}
              senderName={message.senderName}
              text={message.text}
              textFieldWidth={textFieldWidth}
              sentAt={message.sentAt}
              channel={message.channel ?? null}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}
