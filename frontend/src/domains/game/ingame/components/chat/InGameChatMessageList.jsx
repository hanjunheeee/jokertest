import { useEffect, useRef } from "react"
import { pickInGameChatProfile } from "../../utils/pickInGameChatProfile.js"
import InGameChatMessageRow from "./InGameChatMessageRow.jsx"

/**
 * 인게임 채팅 메시지 목록 (프레임 본문 영역)
 */
export default function InGameChatMessageList({ messages, className = "" }) {
  const listRef = useRef(null)

  // justify-end + overflow-y-auto 조합은 초기 scrollTop=0이라 목록이 어긋나 보일 수 있음
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    list.scrollTop = list.scrollHeight
  }, [messages])

  return (
    <ul
      ref={listRef}
      className={`flex h-full min-h-0 flex-col items-start justify-end gap-[0.38em] overflow-x-hidden overflow-y-auto overscroll-contain pl-[clamp(0.08rem,0.75cqi,0.18rem)] pr-[clamp(0.35rem,2.2cqi,0.55rem)] pt-0 pb-[clamp(0.22rem,1.15cqi,0.34rem)] ${className}`}
    >
      {messages.map((message) => (
        <InGameChatMessageRow
          key={message.id}
          senderName={message.senderName}
          text={message.text}
          profileSrc={
            message.profileSrc ?? pickInGameChatProfile(message.senderName)
          }
        />
      ))}
    </ul>
  )
}
