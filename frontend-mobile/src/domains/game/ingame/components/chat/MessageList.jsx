// 채팅 메시지 목록: 아래부터 쌓기, 맨 아래 볼 때만 따라 내림, 빈 목록 안내
// ChatPanel·CloseupSheet가 씀, 글 크기·시각·닉네임 색은 인게임 설정 값
import { useRef } from "react"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useChatDisplaySettings } from "@m/domains/game/ingame/hooks/chat/useChatDisplaySettings.js"
import { useStickToBottom } from "@m/domains/game/ingame/hooks/chat/useStickToBottom.js"
import MessageRow from "./MessageRow.jsx"
import NewMessagePill from "./NewMessagePill.jsx"
import { chatFontSize, LIST_SCROLL_CLASS, TEXT_CLASS } from "./chatStyle.js"

// emptyText는 메시지 없을 때 가운데 글 (채널 없음·아직 없음), fontBase는 크게 보기에서 키움
export default function MessageList({ messages, selfId, emptyText, fontBase = 0.95 }) {
    const scrollRef = useRef(null)
    const { getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
    const { textScale, showTime, nicknameColor } = useChatDisplaySettings()
    const { unread, scrollToBottom } = useStickToBottom(scrollRef, messages)

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div ref={scrollRef} className={LIST_SCROLL_CLASS} style={{ fontSize: chatFontSize(textScale, fontBase) }}>
                {messages.length === 0 ? (
                    <p className={`${TEXT_CLASS} flex h-full items-center justify-center px-4 text-center text-[0.86em] opacity-60`}>
                        {emptyText}
                    </p>
                ) : (
                    // 위 빈 칸이 늘어나 적은 메시지도 아래부터 쌓임
                    <ul className="flex min-h-full flex-col justify-end gap-0.5" role="log" aria-label="채팅 내역" aria-live="polite">
                        {messages.map((message) => (
                            <MessageRow
                                key={message.id}
                                message={message}
                                mine={Boolean(selfId) && message.playerId === selfId}
                                themeStyles={message.playerId ? getThemeStylesByPlayerId(message.playerId) : null}
                                nicknameColor={nicknameColor}
                                showTime={showTime}
                            />
                        ))}
                    </ul>
                )}
            </div>
            <NewMessagePill count={unread} onClick={scrollToBottom} />
        </div>
    )
}
