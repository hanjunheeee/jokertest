// 채팅 메시지 목록: 맨 위 빈 칸이 늘어나 아래부터 쌓기, 메시지 오면 맨 아래로, 위쪽 흐림
// ChatPanel·CloseupSheet가 씀, 줄 간격·여백은 데스크톱 목록 상수 그대로, 글 크기는 인게임 설정 값
import { useRef } from "react"
import {
    MSG_LIST_CONTAINER_CLASS,
    MSG_LIST_INNER_CLASS,
    MSG_LIST_SPACER_CLASS,
} from "@/domains/game/ingame/constants/chat/ingameChatLayout.js"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useChatDisplaySettings } from "@m/domains/game/ingame/hooks/chat/useChatDisplaySettings.js"
import { useScrollToLatest } from "@m/domains/game/ingame/hooks/chat/useScrollToLatest.js"
import MessageRow from "./MessageRow.jsx"
import { chatFontSize } from "./chatStyle.js"

// 목록 칸은 데스크톱 MSG_LIST_CONTAINER_CLASS 그대로 (위 5% 흐림), 안쪽 칸은 손가락 스크롤이라 touch-none·grab 뺌
const LIST_SCROLL_CLASS =
    `h-full min-h-0 select-none overflow-x-hidden overflow-y-auto overscroll-contain ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

// insetStyle은 틀 나무 안쪽 자리, fontBase는 크게 보기에서 키움
export default function MessageList({ messages, insetStyle, fontBase = 0.92 }) {
    const scrollRef = useRef(null)
    const { getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
    const { textScale, showTime, nicknameColor } = useChatDisplaySettings()
    useScrollToLatest(scrollRef, messages)

    return (
        <div className={MSG_LIST_CONTAINER_CLASS} style={insetStyle} data-chat-interactive>
            <div ref={scrollRef} className={LIST_SCROLL_CLASS} style={{ fontSize: chatFontSize(textScale, fontBase) }}>
                <ul className={MSG_LIST_INNER_CLASS} aria-readonly="true" role="log" aria-label="채팅 내역">
                    <li aria-hidden className={MSG_LIST_SPACER_CLASS} />
                    {messages.map((message) => (
                        <MessageRow
                            key={message.id}
                            message={message}
                            themeStyles={message.playerId ? getThemeStylesByPlayerId(message.playerId) : null}
                            nicknameColor={nicknameColor}
                            showTime={showTime}
                        />
                    ))}
                </ul>
            </div>
        </div>
    )
}
