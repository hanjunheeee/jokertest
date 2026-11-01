// 채팅 입력 줄: 늘어나는 입력칸 + 보내기, Enter 보내기·Shift+Enter 줄바꿈, 키보드 위로 올라감
// ChatPanel(바닥 자리 또는 칸 안)·CloseupSheet가 씀, 보내기·검사는 데스크톱 채팅 세션 훅
import { useRef } from "react"
import { INPUT_MAX_LENGTH } from "@/domains/game/ingame/constants/chat/ingameChatAssets.js"
import { useAutoGrow } from "@m/domains/game/ingame/hooks/chat/useAutoGrow.js"
import { useKeyboardLift } from "@m/domains/game/ingame/hooks/chat/useKeyboardLift.js"
import SendButton from "./SendButton.jsx"
import { COMPOSER_BAR_CLASS, TEXTAREA_CLASS } from "./chatStyle.js"

// 글자 수 표시를 띄우기 시작하는 길이
const COUNTER_FROM = INPUT_MAX_LENGTH - 30

// lift가 꺼지면 키보드 비킴은 부르는 쪽이 맡음, className으로 바깥 여백 더함
export default function Composer({
    draft,
    onDraftChange,
    onSend,
    status = null,
    error = null,
    canSend,
    blockedReason = null,
    lift = true,
    className = "",
}) {
    const barRef = useRef(null)
    const textareaRef = useRef(null)
    const keyboardLift = useKeyboardLift(barRef, lift)
    useAutoGrow(textareaRef, draft)

    const sending = status === "sending"
    const tooLong = draft.length > INPUT_MAX_LENGTH
    const showCounter = draft.length >= COUNTER_FROM

    // 못 보낼 땐 안 부름, 보낸 뒤에도 초점 유지 (키보드 그대로)
    const send = () => {
        if (!canSend) return
        onSend()
        textareaRef.current?.focus({ preventScroll: true })
    }

    // Enter는 보내기, Shift+Enter·한글 조합 중이면 그대로
    const handleKeyDown = (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        send()
    }

    return (
        <div
            ref={barRef}
            className={`${COMPOSER_BAR_CLASS} ${className}`.trim()}
            style={keyboardLift > 0 ? { transform: `translateY(-${keyboardLift}px)` } : undefined}
            data-chat-composer
            data-error={error ? "true" : undefined}
        >
            <div className="relative min-w-0 flex-1">
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={draft}
                    disabled={!canSend}
                    onChange={(event) => onDraftChange(event.target.value)}
                    onKeyDown={handleKeyDown}
                    enterKeyHint="send"
                    autoComplete="off"
                    placeholder={canSend ? "TYPE HERE..." : (blockedReason ?? "채팅을 쓸 수 없음")}
                    aria-label="채팅 입력"
                    aria-invalid={error || tooLong ? "true" : undefined}
                    className={`${TEXTAREA_CLASS} ${error || tooLong ? "border-[#c0392b]! ring-2! ring-[#c0392b]/45!" : ""} ${showCounter ? "pb-4!" : ""}`.trim()}
                />
                {showCounter ? (
                    <span
                        className={`pointer-events-none absolute right-2 bottom-0.5 font-subheading text-[0.66rem] font-bold ${tooLong ? "text-[#c0392b]" : "text-[#6a4526]/80"}`}
                        aria-live="polite"
                    >
                        {draft.length}/{INPUT_MAX_LENGTH}
                    </span>
                ) : null}
            </div>
            <SendButton onSend={send} disabled={!canSend} sending={sending} />
        </div>
    )
}
