// 인게임 채팅 칸: 데스크톱 채팅 틀 그림 안에 메시지 목록 + 입력 줄(세로 폰은 화면 바닥 자리) + 크게 보기 시트
// InGamePage가 props 없이 씀, 값은 데스크톱 채팅 세션 컨텍스트(InGameChatSessionProvider)·인게임 스토어
import { useCallback, useState } from "react"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import { useInGameChatSessionContext } from "@/domains/game/ingame/components/chat/InGameChatSessionContext.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { useWideChat } from "@m/domains/game/ingame/hooks/chat/useWideChat.js"
import CloseupSheet from "./CloseupSheet.jsx"
import Composer from "./Composer.jsx"
import ExpandButton from "./ExpandButton.jsx"
import FrameSlice from "./FrameSlice.jsx"
import MessageList from "./MessageList.jsx"
import StatusLine from "./StatusLine.jsx"
import { dividerStyle, FRAME_ROOT_CLASS, FRAME_SLICE, listInsetStyle } from "./chatStyle.js"

// 재판 연출이 떠 있는지 (데스크톱 InGameChatShell과 같은 조건, 연출이 자기 채팅을 띄움)
function selectTribunalPresentationOpen(s) {
    const state = s.state
    return state?.phase === "TRIBUNAL"
        && Boolean(state?.tribunal?.defendantUuid)
        && state.tribunal.resolved !== true
}

// 세로 폰: 틀은 목록만(아래 나무 띠까지), 입력 줄은 바닥 자리(행동 줄 아래)
// 넓은 배치: 목록 + 입력 줄 이어 붙여 데스크톱 틀 한 장 모양 (타이머는 진행 바만 보여 줘서 없음)
export default function ChatPanel() {
    const session = useInGameChatSessionContext()
    const wide = useWideChat()
    const tribunalOpen = useInGameStore(selectTribunalPresentationOpen)
    const [closeupOpen, setCloseupOpen] = useState(false)
    const openCloseup = useCallback(() => setCloseupOpen(true), [])
    const closeCloseup = useCallback(() => setCloseupOpen(false), [])

    // 재판 연출이 자기 채팅을 띄우므로 겹치지 않게 숨김
    if (tribunalOpen) return null

    const slice = wide ? FRAME_SLICE.list : FRAME_SLICE.listWithDivider
    const composer = (
        <Composer
            draft={session.draft}
            onDraftChange={session.onDraftChange}
            onSend={session.onSend}
            status={session.status}
            error={session.error}
            withStatus={wide}
        />
    )

    // 틀 빈 곳 누르면 크게 보기, 목록·입력 줄 누름은 제외 (데스크톱 보드 채팅과 같음)
    const handleFrameClick = (event) => {
        if (event.target.closest("[data-chat-interactive]")) return
        openCloseup()
    }

    return (
        <>
            <aside aria-label="채팅" className={`${FRAME_ROOT_CLASS} flex h-full min-h-0 cursor-pointer flex-col`} onClick={handleFrameClick}>
                <div className="relative min-h-0 flex-1 overflow-hidden">
                    <FrameSlice slice={slice} />
                    <MessageList messages={session.messages} insetStyle={listInsetStyle(slice)} />
                    {wide ? null : <StatusLine status={session.status} error={session.error} placeStyle={dividerStyle(slice)} />}
                    <ExpandButton onOpen={openCloseup} />
                </div>
                {wide ? composer : null}
            </aside>
            {wide ? null : <ShellBottom>{composer}</ShellBottom>}
            <CloseupSheet open={closeupOpen} onClose={closeCloseup} session={session} />
        </>
    )
}
