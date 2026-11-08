// 채팅방 (카톡형): 말·알림·이모티콘 줄을 아래부터 쌓아 보여 줌, 밤엔 위에 "밤 · 같은 직업끼리" 표시
// TalkLayout이 화면 대부분 칸에 씀, 값은 useTalkFeed (채팅 세션·참가자 컨텍스트 안)
import { useRef } from "react"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useChatDisplaySettings } from "@m/domains/game/ingame/hooks/chat/useChatDisplaySettings.js"
import { useStickToBottom } from "@m/domains/game/ingame/hooks/talk/useStickToBottom.js"
import { useTalkFeed } from "@m/domains/game/ingame/hooks/talk/useTalkFeed.js"
import { chatFontSize } from "@m/domains/game/ingame/components/chat/chatStyle.js"
import { startsGroup } from "@m/domains/game/ingame/utils/talk/buildTalkFeed.js"
import SystemLine from "./SystemLine.jsx"
import TalkBubble from "./TalkBubble.jsx"

// 채팅방 판: 어두운 반투명 바탕 + 나무색 테두리 (뒤 배경 그림이 살짝 비침)
const PANEL_CLASS =
    "relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#6b4a26]/70 bg-[#120804]/60 shadow-[inset_0_0_18px_rgba(0,0,0,0.7)]"

const SCROLL_CLASS =
    `min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-2 pb-2 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

const JOKER_BANNER_CLASS =
    "flex shrink-0 items-center justify-center gap-1.5 border-b border-[#a33a2a]/50 bg-[#4a1414]/80 py-1 text-[0.72rem] font-semibold tracking-wide text-[#f6c8b0]"

const NEW_BUTTON_CLASS =
    "absolute bottom-2 left-1/2 z-10 h-11 -translate-x-1/2 cursor-pointer rounded-full border border-[#b08a4a]/70 bg-black/80 px-3 text-[0.72rem] text-[#f3dcb0] shadow-[0_2px_8px_rgba(0,0,0,0.6)]"

// 보내기 실패·전송 중 한 줄 (입력칸 바로 위, 말풍선별 표시는 없음)
function StatusLine({ status, error }) {
    const text = error ?? (status === "sending" ? "전송 중" : null)
    if (!text) return null
    return (
        <p className="shrink-0 truncate px-3 pb-1 text-center text-[0.7rem] text-[#ffd2c2]" role={error ? "alert" : "status"}>
            {text}
        </p>
    )
}

export default function TalkList() {
    const scrollRef = useRef(null)
    const { lines, joker, session } = useTalkFeed()
    const { getPlayerById, getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
    const { textScale, showTime, nicknameColor } = useChatDisplaySettings()
    const { unseen, scrollToBottom } = useStickToBottom(scrollRef, lines)

    return (
        <section aria-label="채팅" className={PANEL_CLASS} data-talk-list="">
            {joker ? <p className={JOKER_BANNER_CLASS}>밤 · 같은 직업끼리</p> : null}
            <div ref={scrollRef} className={SCROLL_CLASS} style={{ fontSize: chatFontSize(textScale, 0.95) }}>
                <ul role="log" aria-label="채팅 내역" className="flex min-h-full flex-col justify-end">
                    {lines.map((line, index) => {
                        if (line.kind === "system") return <SystemLine key={line.id} text={line.text} />
                        const themeColor = nicknameColor && line.playerId ? getThemeStylesByPlayerId(line.playerId)?.color : null
                        return (
                            <TalkBubble
                                key={line.id}
                                line={line}
                                groupStart={startsGroup(line, lines[index - 1])}
                                player={line.playerId ? getPlayerById(line.playerId) : null}
                                themeColor={themeColor ?? null}
                                showTime={showTime}
                            />
                        )
                    })}
                </ul>
            </div>
            {unseen ? (
                <button type="button" className={NEW_BUTTON_CLASS} onClick={scrollToBottom}>
                    새 메시지 ↓
                </button>
            ) : null}
            <StatusLine status={session.status} error={session.error} />
        </section>
    )
}
