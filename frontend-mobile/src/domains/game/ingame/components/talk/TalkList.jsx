// 채팅방 (카톡형): 말·알림·이모티콘 줄을 아래부터 쌓아 보여 줌, 죽은 뒤엔 "죽은 사람끼리" 표시
// TalkLayout이 화면 대부분 칸에 씀, 값은 useTalkFeed (채팅 세션·참가자 컨텍스트 안)
import { useContext, useMemo, useRef } from "react"
import { InGameActionContext } from "@/domains/game/ingame/context/InGameActionContext.jsx"
import { MOBILE_INGAME_CONTROLS_ASSETS } from "@m/domains/game/ingame/constants/mobileInGameControlsAssets.js"
import { CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS } from "@/shared/constants/customScrollbarStyles.js"
import { useInGamePlayerSessionContext } from "@/domains/game/ingame/components/InGamePlayerSessionContext.js"
import { useChatDisplaySettings } from "@m/domains/game/ingame/hooks/chat/useChatDisplaySettings.js"
import { useStickToBottom } from "@m/domains/game/ingame/hooks/talk/useStickToBottom.js"
import { useTalkFeed } from "@m/domains/game/ingame/hooks/talk/useTalkFeed.js"
import { chatFontSize } from "@m/domains/game/ingame/components/chat/chatStyle.js"
import { MOBILE_TALK_CHAT_ASSETS } from "@m/domains/game/ingame/constants/chat/mobileTalkChatAssets.js"
import {
    TALK_CHAT_FRAME_IMAGE_CLASS,
    TALK_CHAT_FRAME_ROOT_CLASS,
    TALK_CHAT_LIST_INSET_CLASS,
    TALK_CHAT_ROSTER_BTN_CLASS,
    TALK_CHAT_TRIBUNAL_BTN_CLASS,
    TALK_CHAT_TRIBUNAL_BTN_IMG_CLASS,
    TALK_CHAT_TRIBUNAL_BTN_LABEL_CLASS,
} from "@m/domains/game/ingame/constants/chat/mobileTalkChatLayout.js"
import { startsGroup } from "@m/domains/game/ingame/utils/talk/buildTalkFeed.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import SystemLine from "./SystemLine.jsx"
import TalkBubble from "./TalkBubble.jsx"
import { DEAD_BANNER_CLASS, DEAD_BANNER_TEXT } from "./talkStyle.js"

const SCROLL_CLASS =
    `relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-0 pb-1 ${CUSTOM_SCROLLBAR_HIDE_NATIVE_CLASS}`

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

function talkRosterControl(ctx) {
    const phase = ctx?.gameState?.phase ?? null
    if (phase === "NIGHT") {
        return {
            src: MOBILE_INGAME_CONTROLS_ASSETS.nightJobAction,
            label: "직업 행동",
        }
    }
    return {
        src: MOBILE_INGAME_CONTROLS_ASSETS.playerList,
        label: "플레이어 목록",
    }
}

export default function TalkList({ onPlayerRoster = null, onTribunalOpen = null }) {
    const actionCtx = useContext(InGameActionContext)
    const rosterControl = useMemo(() => talkRosterControl(actionCtx), [actionCtx])
    const rosterOpenable = Boolean(onPlayerRoster && rosterControl.src)
    const scrollRef = useRef(null)
    const { lines, dead, session } = useTalkFeed()
    const { players, getPlayerById, getThemeStylesByPlayerId } = useInGamePlayerSessionContext()
    const { textScale, showTime, nicknameColor } = useChatDisplaySettings()
    const { unseen, scrollToBottom } = useStickToBottom(scrollRef, lines)

    return (
        <section aria-label="채팅" className={TALK_CHAT_FRAME_ROOT_CLASS} data-talk-list="">
            <PublicAsset
                src={MOBILE_TALK_CHAT_ASSETS.frame}
                alt=""
                className={TALK_CHAT_FRAME_IMAGE_CLASS}
            />
            {typeof onTribunalOpen === "function" ? (
                <button
                    type="button"
                    aria-label="최후의 변론 열기"
                    data-testid="tribunal-presentation-open"
                    className={TALK_CHAT_TRIBUNAL_BTN_CLASS}
                    onClick={onTribunalOpen}
                    style={{ outline: "none" }}
                >
                    <PublicAsset
                        src={MOBILE_INGAME_CONTROLS_ASSETS.tribunalOpen}
                        alt=""
                        className={TALK_CHAT_TRIBUNAL_BTN_IMG_CLASS}
                    />
                    <span className={TALK_CHAT_TRIBUNAL_BTN_LABEL_CLASS}>최후의 변론</span>
                </button>
            ) : null}
            {rosterOpenable ? (
                <button
                    type="button"
                    aria-label={rosterControl.label}
                    data-testid="player-roster-open"
                    data-roster-mode={actionCtx?.gameState?.phase === "NIGHT" ? "night" : "day"}
                    className={TALK_CHAT_ROSTER_BTN_CLASS}
                    onClick={onPlayerRoster}
                    style={{ outline: "none" }}
                >
                    <PublicAsset src={rosterControl.src} alt="" className="block h-14 w-14 select-none object-contain" />
                </button>
            ) : null}
            <div className={TALK_CHAT_LIST_INSET_CLASS}>
                {dead ? <p className={DEAD_BANNER_CLASS} data-dead-chat-banner="">{DEAD_BANNER_TEXT}</p> : null}
                <div ref={scrollRef} className={SCROLL_CLASS} style={{ fontSize: chatFontSize(textScale, 0.95) }}>
                    <ul role="log" aria-label="채팅 내역" className="flex min-h-full flex-col justify-end">
                        {lines.map((line, index) => {
                            if (line.kind === "system") return <SystemLine key={line.id} text={line.text} />
                            const themeColor =
                                nicknameColor && line.playerId ? getThemeStylesByPlayerId(line.playerId)?.color : null
                            const player = line.playerId ? getPlayerById(line.playerId) : null
                            const playerIndex = line.playerId
                                ? players.findIndex((entry) => entry.id === line.playerId)
                                : 0
                            return (
                                <TalkBubble
                                    key={line.id}
                                    line={line}
                                    groupStart={startsGroup(line, lines[index - 1])}
                                    player={player}
                                    playerIndex={playerIndex >= 0 ? playerIndex : 0}
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
            </div>
        </section>
    )
}
