// 채팅 입력 줄: 입력 띠 그림 위에 입력칸 + 보내기, 밤에 산 귀족은 잠금 안내, 역할 확인 10초 동안은 비활성
// ChatPanel(넓은 배치)·TalkLayout(폰 세로 바닥 자리)·CloseupSheet가 씀, 보내기·검사·오류 문구는 데스크톱 채팅 세션 훅
import { useEffect, useRef } from "react"
import { useKeyboardLift } from "@m/domains/game/ingame/hooks/chat/useKeyboardLift.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import {
    isNightChatInputClosed,
    isRoleRevealChatLocked,
    NIGHT_CHAT_CLOSED_TEXT,
    ROLE_REVEAL_CHAT_LOCKED_TEXT,
} from "@/domains/game/ingame/utils/inGameChatChannel.js"
import { MOBILE_TALK_CHAT_ASSETS } from "@m/domains/game/ingame/constants/chat/mobileTalkChatAssets.js"
import {
    TALK_CHAT_COMPOSER_BAR_CLASS,
    TALK_CHAT_COMPOSER_ROW_CLASS,
    TALK_CHAT_TEXTAREA_OFFSET_CLASS,
    TALK_CHAT_TEXTAREA_WRAP_CLASS,
} from "@m/domains/game/ingame/constants/chat/mobileTalkChatLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import FrameSlice from "./FrameSlice.jsx"
import SendButton from "./SendButton.jsx"
import StatusLine from "./StatusLine.jsx"
import { COMPOSER_BAR_CLASS, COMPOSER_ROW_CLASS, dividerStyle, FRAME_SLICE, TEXTAREA_CLASS } from "./chatStyle.js"

// 상태 줄은 입력 띠 위 나무 띠에 얹음
const DIVIDER_PLACE = dividerStyle(FRAME_SLICE.composer)

// 밤 귀족 입력칸 닫힘 까닭 (어두운 바탕 위 밝은 글자로 입력 띠 그림 위에서도 선명하게)
const NIGHT_CLOSED_TEXT_CLASS =
    "mr-[clamp(0.6rem,4cqi,1.4rem)] w-full truncate rounded bg-black/80 px-2 py-1.5 text-center text-[0.8rem] font-semibold text-[#f2e6cf]"

// 역할 확인 동안 안내 글이 한 줄 입력칸을 넘치지 않게 글자 크기 축소
const ROLE_LOCKED_PLACEHOLDER_CLASS = "placeholder:text-[0.8rem] placeholder:tracking-normal"

// 밤 귀족 잠금 줄 또는 입력칸·보내기 단추 묶음 표시
function ComposerInputRow({
    closed,
    roleRevealLocked,
    isTalk,
    variant,
    draft,
    onDraftChange,
    onKeyDown,
    onSend,
    textareaRef,
}) {
    if (closed) {
        return (
            <p role="status" className={NIGHT_CLOSED_TEXT_CLASS} data-night-chat-closed="">
                {NIGHT_CHAT_CLOSED_TEXT}
            </p>
        )
    }
    const areaClass = `${isTalk ? `${TEXTAREA_CLASS} ${TALK_CHAT_TEXTAREA_OFFSET_CLASS}` : TEXTAREA_CLASS}${
        roleRevealLocked ? ` ${ROLE_LOCKED_PLACEHOLDER_CLASS}` : ""
    }`

    return (
        <>
            <div
                className={isTalk ? TALK_CHAT_TEXTAREA_WRAP_CLASS : "relative min-w-0 flex-1"}
                onClick={() => {
                    if (!roleRevealLocked) textareaRef.current?.focus()
                }}
            >
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={draft}
                    onChange={(event) => onDraftChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    enterKeyHint="send"
                    autoComplete="off"
                    placeholder={roleRevealLocked ? ROLE_REVEAL_CHAT_LOCKED_TEXT : "TYPE HERE..."}
                    title={roleRevealLocked ? ROLE_REVEAL_CHAT_LOCKED_TEXT : undefined}
                    aria-label="채팅 입력"
                    disabled={roleRevealLocked}
                    className={areaClass}
                />
            </div>
            <SendButton onSend={onSend} variant={variant} disabled={roleRevealLocked} />
        </>
    )
}

// lift가 꺼지면 키보드 비킴은 부르는 쪽이 맡음, withStatus면 상태 줄도 여기 그림
export default function Composer({
    draft,
    onDraftChange,
    onSend,
    status = null,
    error = null,
    withStatus = false,
    lift = true,
    locked = false,
    variant = "classic",
}) {
    const barRef = useRef(null)
    const textareaRef = useRef(null)
    const keyboardLift = useKeyboardLift(barRef, lift)
    const closed = useInGameStore((s) => isNightChatInputClosed(s.state))
    const roleRevealLocked = useInGameStore((s) => isRoleRevealChatLocked(s.state))
    const inputBlocked = locked || closed || roleRevealLocked

    useEffect(() => {
        if (inputBlocked) textareaRef.current?.blur()
    }, [inputBlocked])

    const send = () => {
        if (inputBlocked) return
        onSend()
        textareaRef.current?.focus({ preventScroll: true })
    }

    const handleKeyDown = (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        send()
    }

    const isTalk = variant === "talk"
    const barClass = isTalk ? TALK_CHAT_COMPOSER_BAR_CLASS : COMPOSER_BAR_CLASS
    const rowClass = isTalk ? TALK_CHAT_COMPOSER_ROW_CLASS : COMPOSER_ROW_CLASS

    return (
        <div
            ref={barRef}
            className={barClass}
            style={keyboardLift > 0 ? { transform: `translateY(-${keyboardLift}px)` } : undefined}
            data-chat-composer
            data-chat-composer-variant={variant}
            data-chat-interactive
            inert={locked || undefined}
        >
            {isTalk ? (
                <PublicAsset
                    src={MOBILE_TALK_CHAT_ASSETS.composerBar}
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
                />
            ) : (
                <>
                    <FrameSlice slice={FRAME_SLICE.composer} />
                    {withStatus ? <StatusLine status={status} error={error} placeStyle={DIVIDER_PLACE} /> : null}
                </>
            )}
            <div className={rowClass}>
                <ComposerInputRow
                    closed={closed}
                    roleRevealLocked={roleRevealLocked}
                    isTalk={isTalk}
                    variant={variant}
                    draft={draft}
                    onDraftChange={onDraftChange}
                    onKeyDown={handleKeyDown}
                    onSend={send}
                    textareaRef={textareaRef}
                />
            </div>
        </div>
    )
}
