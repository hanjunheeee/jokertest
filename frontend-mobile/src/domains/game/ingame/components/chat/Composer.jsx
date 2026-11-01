// 채팅 입력 줄: 데스크톱 틀 아래 입력 띠 그림 위에 입력칸 + 보내기, Enter 보내기·Shift+Enter 줄바꿈
// ChatPanel(바닥 자리 또는 칸 안)·CloseupSheet가 씀, 보내기·검사·오류 문구는 데스크톱 채팅 세션 훅
import { useRef } from "react"
import { useKeyboardLift } from "@m/domains/game/ingame/hooks/chat/useKeyboardLift.js"
import FrameSlice from "./FrameSlice.jsx"
import SendButton from "./SendButton.jsx"
import StatusLine from "./StatusLine.jsx"
import { COMPOSER_BAR_CLASS, COMPOSER_ROW_CLASS, dividerStyle, FRAME_SLICE, TEXTAREA_CLASS } from "./chatStyle.js"

// 상태 줄은 입력 띠 위 나무 띠에 얹음
const DIVIDER_PLACE = dividerStyle(FRAME_SLICE.composer)

// lift가 꺼지면 키보드 비킴은 부르는 쪽이 맡음, withStatus면 상태 줄도 여기 그림
export default function Composer({
    draft,
    onDraftChange,
    onSend,
    status = null,
    error = null,
    withStatus = false,
    lift = true,
}) {
    const barRef = useRef(null)
    const textareaRef = useRef(null)
    const keyboardLift = useKeyboardLift(barRef, lift)

    // 보낸 뒤에도 초점 유지 (키보드 그대로), 못 보낼 때 거르기는 세션 훅이 함
    const send = () => {
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
            className={COMPOSER_BAR_CLASS}
            style={keyboardLift > 0 ? { transform: `translateY(-${keyboardLift}px)` } : undefined}
            data-chat-composer
            data-chat-interactive
        >
            <FrameSlice slice={FRAME_SLICE.composer} />
            {withStatus ? <StatusLine status={status} error={error} placeStyle={DIVIDER_PLACE} /> : null}
            <div className={COMPOSER_ROW_CLASS}>
                <div className="relative min-w-0 flex-1" onClick={() => textareaRef.current?.focus()}>
                    <textarea
                        ref={textareaRef}
                        rows={1}
                        value={draft}
                        onChange={(event) => onDraftChange(event.target.value)}
                        onKeyDown={handleKeyDown}
                        enterKeyHint="send"
                        autoComplete="off"
                        placeholder="TYPE HERE..."
                        aria-label="채팅 입력"
                        className={TEXTAREA_CLASS}
                    />
                </div>
                <SendButton onSend={send} />
            </div>
        </div>
    )
}
