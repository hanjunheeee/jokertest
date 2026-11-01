// 재판 '최후의 반론' 채팅 칸: 메시지 목록 + 바닥 입력칸·보내기 (양피지 색 판)
// 재판 연출 창(TribunalOverlay)이 씀, 값은 채팅 세션 컨텍스트(InGameChatSessionProvider)
import { useEffect, useRef } from "react"
import { INPUT_MAX_LENGTH } from "@/domains/game/ingame/constants/chat/ingameChatAssets.js"
import TribunalChatRow from "./TribunalChatRow.jsx"

const PANEL_CLASS =
    "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border-2 border-[#6b4321] bg-gradient-to-b from-[#f3e5bd] via-[#e7d19f] to-[#c9a05f] shadow-[0_20px_60px_rgba(0,0,0,0.55)]"

const SEND_BTN_CLASS =
    "min-h-11 shrink-0 rounded border border-[#d8b982]/60 bg-[#2b1c15] px-4 font-subheading text-sm font-bold text-[#e9b582] active:bg-[#53321f] disabled:opacity-50"

// 오류 먼저, 보내는 중이면 전송 중 (데스크톱 상태 줄과 같음)
function statusText(status, error) {
    if (error) return error
    if (status === "sending") return "전송 중"
    return null
}

// Enter 보내기 (한글 조합 중·Shift+Enter는 제외), 새 메시지 오면 맨 아래로
export default function TribunalChat({ draft = "", messages = [], onDraftChange, onSend, status = null, error = null }) {
    const listRef = useRef(null)

    useEffect(() => {
        const el = listRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [messages])

    const send = () => onSend?.()
    const handleKeyDown = (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        send()
    }
    const line = statusText(status, error)

    return (
        <section className={PANEL_CLASS} aria-label="최후의 반론 채팅">
            <p className="shrink-0 border-b border-[#6b4321]/40 py-1.5 text-center font-subheading text-sm font-bold text-[#5b3a20]">
                최후의 반론
            </p>
            <ul
                ref={listRef}
                role="log"
                aria-label="채팅 내역"
                className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-2"
            >
                <li aria-hidden className="mt-auto" />
                {messages.map((m) => (
                    <TribunalChatRow key={m.id} playerId={m.playerId} senderName={m.senderName} text={m.text} sentAt={m.sentAt} />
                ))}
            </ul>
            {line ? <p className="shrink-0 px-3 text-[11px] text-[#7a2a12]">{line}</p> : null}
            <div className="flex shrink-0 items-end gap-2 border-t border-[#6b4321]/40 bg-[#2b1c15]/10 p-2">
                <textarea
                    rows={1}
                    value={draft}
                    maxLength={INPUT_MAX_LENGTH}
                    onChange={(e) => onDraftChange?.(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="TYPE HERE..."
                    aria-label="채팅 입력"
                    enterKeyHint="send"
                    className="min-h-11 flex-1 resize-none rounded border border-[#6b4321]/50 bg-[#fbf3dc]/80 px-2.5 py-2 font-subheading leading-snug text-[#3a1a0c] placeholder:text-[#8a6a4a] focus:outline-none focus:ring-2 focus:ring-[#6b4321]/50"
                />
                <button type="button" className={SEND_BTN_CLASS} onClick={send} disabled={!onSend}>보내기</button>
            </div>
        </section>
    )
}
