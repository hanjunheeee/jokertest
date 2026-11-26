// 인게임 채팅 칸: 데스크톱 채팅 틀 그림 안에 메시지 목록 + 죽은 사람끼리 배지 + 입력 줄 + 크게 보기 시트
// InGamePage가 props 없이 씀, 값은 데스크톱 채팅 세션 컨텍스트(InGameChatSessionProvider)·인게임 스토어
import { useCallback, useState } from "react"
import { useInGameChatSessionContext } from "@/domains/game/ingame/components/chat/InGameChatSessionContext.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { selectOverlayOpen, useOverlayBridge } from "@m/domains/game/ingame/hooks/overlays/overlayBridge.js"
import CloseupSheet from "./CloseupSheet.jsx"
import Composer from "./Composer.jsx"
import ExpandButton from "./ExpandButton.jsx"
import FrameSlice from "./FrameSlice.jsx"
import MessageList from "./MessageList.jsx"
import { selectTribunalPresentationOpen } from "@m/domains/game/ingame/utils/tribunalOpen.js"
import {
    DEAD_CHAT_BADGE_CLASS,
    DEAD_CHAT_BADGE_TEXT,
    FRAME_ROOT_CLASS,
    FRAME_SLICE,
    listInsetStyle,
} from "./chatStyle.js"

// 넓은 배치(폰 가로·태블릿) 전용: 목록 + 입력 줄 이어 붙여 데스크톱 틀 한 장 모양 (폰 세로는 TalkLayout)
export default function ChatPanel() {
    const session = useInGameChatSessionContext()
    const tribunalOpen = useInGameStore(selectTribunalPresentationOpen)
    const overlayOpen = useOverlayBridge(selectOverlayOpen)
    const [closeupOpen, setCloseupOpen] = useState(false)
    const openCloseup = useCallback(() => setCloseupOpen(true), [])
    const closeCloseup = useCallback(() => setCloseupOpen(false), [])

    // 재판·전면 연출이 뜨면 크게 보기 창을 닫아 연출 위를 덮지 않게 막음
    if ((tribunalOpen || overlayOpen) && closeupOpen) setCloseupOpen(false)

    // 재판 연출이 자기 채팅을 띄우므로 겹치지 않게 숨김
    if (tribunalOpen) return null

    const slice = FRAME_SLICE.list
    const insetStyle = listInsetStyle(slice)

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
                    <MessageList messages={session.messages} insetStyle={insetStyle} />
                    {session.isDeadChat ? (
                        <div className="pointer-events-none absolute" style={insetStyle}>
                            <p className={DEAD_CHAT_BADGE_CLASS} data-dead-chat-badge="" data-dead-chat-banner="">
                                {DEAD_CHAT_BADGE_TEXT}
                            </p>
                        </div>
                    ) : null}
                    <ExpandButton onOpen={openCloseup} />
                </div>
                <Composer
                    draft={session.draft}
                    onDraftChange={session.onDraftChange}
                    onSend={session.onSend}
                    status={session.status}
                    error={session.error}
                    withStatus
                />
            </aside>
            <CloseupSheet open={closeupOpen} onClose={closeCloseup} session={session} />
        </>
    )
}
