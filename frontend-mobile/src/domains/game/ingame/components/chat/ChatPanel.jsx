// 인게임 채팅 칸: 채널 표시·타이머·메시지 목록·상태 줄 + 입력 줄(세로 폰은 화면 바닥 자리) + 크게 보기 시트
// InGamePage가 props 없이 씀, 값은 데스크톱 채팅 세션 컨텍스트(InGameChatSessionProvider)·인게임 스토어
import { useCallback, useState } from "react"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import { useInGameChatSessionContext } from "@/domains/game/ingame/components/chat/InGameChatSessionContext.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useChatChannel } from "@m/domains/game/ingame/hooks/chat/useChatChannel.js"
import { useChatTimer } from "@m/domains/game/ingame/hooks/chat/useChatTimer.js"
import { useWideChat } from "@m/domains/game/ingame/hooks/chat/useWideChat.js"
import ChatHeader from "./ChatHeader.jsx"
import ChatTimer from "./ChatTimer.jsx"
import CloseupSheet from "./CloseupSheet.jsx"
import Composer from "./Composer.jsx"
import MessageList from "./MessageList.jsx"
import StatusLine from "./StatusLine.jsx"
import { PANEL_CLASS } from "./chatStyle.js"

// 재판 연출이 떠 있는지 (데스크톱 InGameChatShell과 같은 조건, 연출이 자기 채팅을 띄움)
function selectTribunalPresentationOpen(s) {
    const state = s.state
    return state?.phase === "TRIBUNAL"
        && Boolean(state?.tribunal?.defendantUuid)
        && state.tribunal.resolved !== true
}

// 빈 목록 글: 채널 없으면 까닭, 있으면 아직 없음
function resolveEmptyText(channel) {
    if (!channel.viewChannel) return channel.blockedReason ?? "지금은 채팅을 쓸 수 없음"
    return "아직 메시지가 없음"
}

// 세로 폰: 목록은 칸 안, 입력 줄은 바닥 자리(행동 줄 아래), 넓은 배치: 입력 줄도 칸 안
export default function ChatPanel() {
    const session = useInGameChatSessionContext()
    const channel = useChatChannel()
    const timer = useChatTimer()
    const wide = useWideChat()
    const tribunalOpen = useInGameStore(selectTribunalPresentationOpen)
    const [closeupOpen, setCloseupOpen] = useState(false)
    const closeCloseup = useCallback(() => setCloseupOpen(false), [])

    if (tribunalOpen) return null

    const emptyText = resolveEmptyText(channel)
    const composer = (
        <Composer
            draft={session.draft}
            onDraftChange={session.onDraftChange}
            onSend={session.onSend}
            status={session.status}
            error={session.error}
            canSend={channel.canSend}
            blockedReason={channel.blockedReason}
            className={wide ? "rounded-b-[0.45rem]" : ""}
        />
    )

    return (
        <>
            <section aria-label="채팅" className={PANEL_CLASS}>
                <ChatHeader channel={channel} onExpand={() => setCloseupOpen(true)} />
                {timer.visible ? <ChatTimer deadline={timer.deadline} /> : null}
                <MessageList messages={session.messages} selfId={channel.selfId} emptyText={emptyText} />
                <StatusLine status={session.status} error={session.error} blockedReason={channel.blockedReason} />
                {wide ? composer : null}
            </section>
            {wide ? null : <ShellBottom>{composer}</ShellBottom>}
            <CloseupSheet
                open={closeupOpen}
                onClose={closeCloseup}
                session={session}
                channel={channel}
                timer={timer}
                emptyText={emptyText}
            />
        </>
    )
}
