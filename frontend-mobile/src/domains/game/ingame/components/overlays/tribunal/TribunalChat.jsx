// 재판 '최후의 반론' 채팅 칸: 데스크톱 채팅 틀 그림을 목록 칸·입력 줄로 잘라 깔고 그 안에 메시지 목록·입력칸·보내기
// 재판 연출 창(TribunalOverlay)이 씀, 값은 채팅 세션 컨텍스트, 틀 자르기·입력 줄 모양은 채팅 담당 부품을 불러 씀 (고치지 않음)
import { useEffect, useRef } from "react"
import { INPUT_MAX_LENGTH } from "@/domains/game/ingame/constants/chat/ingameChatAssets.js"
import { MSG_LIST_SPACER_CLASS } from "@/domains/game/ingame/constants/chat/ingameChatLayout.js"
import FrameSlice from "../../chat/FrameSlice.jsx"
import SendButton from "../../chat/SendButton.jsx"
import {
    COMPOSER_ROW_CLASS,
    FRAME_ROOT_CLASS,
    FRAME_SLICE,
    TEXTAREA_CLASS,
    listInsetStyle,
} from "../../chat/chatStyle.js"
import TribunalChatRow from "./TribunalChatRow.jsx"

// 입력 줄 높이 (입력 띠 양피지 안에 입력칸 44px가 들어가는 높이, 채팅 입력 줄과 같음)
const BAR_CLASS = "relative h-[75px] w-full shrink-0 overflow-hidden"

// 오류 먼저, 보내는 중이면 전송 중 (데스크톱 상태 줄과 같은 글)
function statusText(status, error) {
    if (error) return error
    if (status === "sending") return "전송 중"
    return null
}

// 칸 최소 높이는 0: 키보드로 화면이 낮아지면 목록만 줄고 입력 줄은 화면 안에 남게 함
// Enter 보내기 (한글 조합 중·Shift+Enter는 제외), 새 메시지 오면 맨 아래로
export default function TribunalChat({ draft = "", messages = [], onDraftChange, onSend, status = null, error = null }) {
    const listRef = useRef(null)

    useEffect(() => {
        const el = listRef.current
        if (!el) return undefined
        const frame = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
        return () => cancelAnimationFrame(frame)
    }, [messages])

    const send = () => onSend?.()
    const handleKeyDown = (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        send()
    }
    const line = statusText(status, error)

    return (
        <section className={`${FRAME_ROOT_CLASS} flex min-h-0 flex-1 flex-col`} aria-label="최후의 반론 채팅">
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <FrameSlice slice={FRAME_SLICE.list} />
                <div className="absolute flex flex-col" style={listInsetStyle(FRAME_SLICE.list)}>
                    <ul
                        ref={listRef}
                        role="log"
                        aria-label="채팅 내역"
                        aria-readonly="true"
                        className="flex min-h-0 flex-1 flex-col items-start gap-[0.52em] overflow-x-hidden overflow-y-auto overscroll-contain pb-1 pt-2 [scrollbar-width:none]"
                    >
                        <li aria-hidden className={MSG_LIST_SPACER_CLASS} />
                        {messages.map((m) => (
                            <TribunalChatRow key={m.id} playerId={m.playerId} senderName={m.senderName} text={m.text} sentAt={m.sentAt} />
                        ))}
                    </ul>
                    {line ? <p className="shrink-0 px-1 text-[11px] font-bold text-[#7a2a12]">{line}</p> : null}
                </div>
            </div>
            <div className={BAR_CLASS}>
                <FrameSlice slice={FRAME_SLICE.composer} />
                <div className={COMPOSER_ROW_CLASS}>
                    <div className="relative min-w-0 flex-1">
                        <textarea
                            rows={1}
                            value={draft}
                            maxLength={INPUT_MAX_LENGTH}
                            onChange={(e) => onDraftChange?.(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="TYPE HERE..."
                            aria-label="채팅 입력"
                            enterKeyHint="send"
                            autoComplete="off"
                            className={TEXTAREA_CLASS}
                        />
                    </div>
                    <SendButton onSend={send} />
                </div>
            </div>
        </section>
    )
}
