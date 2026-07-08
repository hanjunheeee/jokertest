import { useEffect, useRef } from "react"
import { useDragScroll } from "../../hooks/useDragScroll.js"
import {
  INGAME_CHAT_MESSAGE_LIST_INNER_CLASS,
  INGAME_CHAT_MESSAGE_LIST_SCROLL_CLASS,
  INGAME_CHAT_MESSAGE_LIST_SCROLL_WRAP_CLASS,
  INGAME_CHAT_MESSAGE_LIST_SPACER_CLASS,
} from "../../constants/chat/ingameChatLayout.js"
import InGameChatMessageRow from "./InGameChatMessageRow.jsx"

/**
 * 인게임 채팅 메시지 목록 (프레임 본문 영역)
 */
export default function InGameChatMessageList({
  // messages: 렌더링할 채팅 메시지 배열 ({ id, senderName, text, profileSrc? })
  messages,
  textFieldWidth = 0,
  // className: 부모가 목록 영역에 추가 스타일을 얹을 때 사용
  className = "",
}) {
  const scrollRef = useRef(null)
  useDragScroll(scrollRef)

  // useEffect(콜백, 의존성배열)는 렌더링 후에 실행되는 부수효과(DOM 조작, 구독 등)를 등록합니다.
  // 의존성 배열의 값이 바뀔 때만 콜백이 다시 실행됩니다.
  // 여기서는 messages가 바뀔 때마다(새 메시지가 추가될 때마다) 목록을 맨 아래로 스크롤합니다.
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
              playerId={message.playerId}
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
