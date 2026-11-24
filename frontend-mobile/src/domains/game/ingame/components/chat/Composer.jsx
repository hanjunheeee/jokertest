// 채팅 입력 줄: 데스크톱 틀 아래 입력 띠 그림 위에 입력칸 + 보내기, Enter 보내기·Shift+Enter 줄바꿈, 밤에 산 시민은 까닭 한 줄, 역할 확인 동안은 꺼짐
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

// 밤 시민 입력칸 닫힘 까닭 (어두운 바탕에 밝은 글자, 입력 띠 그림 위에서도 보이게)
const NIGHT_CLOSED_TEXT_CLASS =
    "mr-[clamp(0.6rem,4cqi,1.4rem)] w-full truncate rounded bg-black/75 px-2 py-1.5 text-center text-[0.8rem] font-semibold text-[#f2e6cf]"

// lift가 꺼지면 키보드 비킴은 부르는 쪽이 맡음, withStatus면 상태 줄도 여기 그림
// locked: 화면 잠금(연출·사망 선택·밤 대기) 동안 입력 막기 (바닥 자리로 portal 돼 화면 inert 밖이라 따로 막음)
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
    // 밤에 산 시민은 보낼 채널이 없음 → 입력칸 닫음 (서버도 거절)
    const closed = useInGameStore((s) => isNightChatInputClosed(s.state))
    // 역할 확인 10초 동안은 채팅을 못 씀 → 입력칸·보내기를 끔 (PC와 같음)
    const roleRevealLocked = useInGameStore((s) => isRoleRevealChatLocked(s.state))

    // 잠기면 치던 키보드도 내림
    useEffect(() => {
        if (locked) textareaRef.current?.blur()
    }, [locked])

    // 보낸 뒤에도 초점 유지 (키보드 그대로), 못 보낼 때 거르기는 세션 훅이 함
    const send = () => {
        if (locked || closed || roleRevealLocked) return
        onSend()
        textareaRef.current?.focus({ preventScroll: true })
    }

    // Enter는 보내기, Shift+Enter·한글 조합 중이면 그대로
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
                {closed ? (
                    <p role="status" className={NIGHT_CLOSED_TEXT_CLASS} data-night-chat-closed="">
                        {NIGHT_CHAT_CLOSED_TEXT}
                    </p>
                ) : (
                    <>
                        <div
                            className={isTalk ? TALK_CHAT_TEXTAREA_WRAP_CLASS : "relative min-w-0 flex-1"}
                            onClick={() => textareaRef.current?.focus()}
                        >
                            <textarea
                                ref={textareaRef}
                                rows={1}
                                value={draft}
                                onChange={(event) => onDraftChange(event.target.value)}
                                onKeyDown={handleKeyDown}
                                enterKeyHint="send"
                                autoComplete="off"
                                placeholder={roleRevealLocked ? ROLE_REVEAL_CHAT_LOCKED_TEXT : "TYPE HERE..."}
                                aria-label="채팅 입력"
                                className={
                                    isTalk ? `${TEXTAREA_CLASS} ${TALK_CHAT_TEXTAREA_OFFSET_CLASS}` : TEXTAREA_CLASS
                                }
                                disabled={roleRevealLocked}
                            />
                        </div>
                        <SendButton onSend={send} variant={variant} disabled={roleRevealLocked} />
                    </>
                )}
            </div>
        </div>
    )
}
