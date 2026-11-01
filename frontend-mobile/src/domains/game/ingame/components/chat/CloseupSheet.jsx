// 채팅 크게 보기 시트: 화면 전체에 큰 글씨 목록·상태 줄·입력 줄, Esc·닫기 버튼으로 닫힘
// ChatPanel이 씀 (데스크톱 InGameChatCloseupOverlay 대신), 화면 틀 fixed 갇힘 때문에 body로 portal
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import { INGAME_CHAT_ASSETS } from "@/domains/game/ingame/constants/chat/ingameChatAssets.js"
import { useKeyboardInset } from "@m/domains/game/ingame/hooks/chat/useKeyboardInset.js"
import ChatHeader from "./ChatHeader.jsx"
import ChatTimer from "./ChatTimer.jsx"
import Composer from "./Composer.jsx"
import MessageList from "./MessageList.jsx"
import StatusLine from "./StatusLine.jsx"
import { ICON_BTN_CLASS, PANEL_CLASS, SHEET_TRANSITION } from "./chatStyle.js"

// 폰은 꽉 채움(안전영역 안쪽), 태블릿은 가운데 큰 창
const SHEET_CLASS =
    "fixed inset-0 z-[70] flex flex-col bg-[#1a0f0a]/80 pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-[3px] md:items-center md:justify-center md:p-[5svh]"

// 닫기 그림 버튼 (데스크톱 크게 보기 닫기 그림)
function CloseButton({ onClose }) {
    return (
        <button type="button" aria-label="채팅 크게 보기 닫기" data-sfx-kind="ui-cancel" onClick={onClose} className={ICON_BTN_CLASS}>
            <PublicAsset src={INGAME_CHAT_ASSETS.closeButton} alt="" className="block h-9 w-9 select-none object-contain" />
        </button>
    )
}

// session은 채팅 세션 값, channel은 useChatChannel 값, timer는 useChatTimer 값
export default function CloseupSheet({ open, onClose, session, channel, timer, emptyText }) {
    const keyboardInset = useKeyboardInset()

    // 열렸을 때만 Esc로 닫기 (닫는 소리 같이)
    useEffect(() => {
        if (!open) return undefined
        const onKeyDown = (event) => {
            if (event.key !== "Escape") return
            dispatchUiSfx("ui-cancel", event)
            onClose()
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [open, onClose])

    // 키보드가 덮은 만큼 아래를 비워 입력 줄이 키보드 바로 위에 옴
    return createPortal(
        <AnimatePresence>
            {open ? (
                <motion.div
                    key="chat-closeup"
                    role="dialog"
                    aria-modal="true"
                    aria-label="채팅 크게 보기"
                    className={SHEET_CLASS}
                    style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 18 }}
                    transition={SHEET_TRANSITION}
                >
                    <div className={`${PANEL_CLASS} rounded-none border-x-0 md:h-full md:max-w-[40rem] md:rounded-[0.9rem] md:border-x-[3px]`}>
                        <ChatHeader channel={channel} action={<CloseButton onClose={onClose} />} className="py-1" />
                        {timer.visible ? <ChatTimer deadline={timer.deadline} /> : null}
                        <MessageList messages={session.messages} selfId={channel.selfId} emptyText={emptyText} fontBase={1.12} />
                        <StatusLine status={session.status} error={session.error} blockedReason={channel.blockedReason} />
                        <Composer
                            draft={session.draft}
                            onDraftChange={session.onDraftChange}
                            onSend={session.onSend}
                            status={session.status}
                            error={session.error}
                            canSend={channel.canSend}
                            blockedReason={channel.blockedReason}
                            lift={false}
                        />
                    </div>
                </motion.div>
            ) : null}
        </AnimatePresence>,
        document.body,
    )
}
