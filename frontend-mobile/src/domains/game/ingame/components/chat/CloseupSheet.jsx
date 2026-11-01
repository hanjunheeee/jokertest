// 채팅 크게 보기(클로즈업) 창: 뒤 막 + 틀 한 장 모양 큰 글씨 목록·입력 줄, Esc·뒤 막·닫기 그림으로 닫힘
// ChatPanel이 씀 (데스크톱 InGameChatCloseupOverlay 대신), 화면 틀 fixed 갇힘 때문에 body로 portal
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import { INGAME_CHAT_ASSETS } from "@/domains/game/ingame/constants/chat/ingameChatAssets.js"
import { PANEL_TRANSITION } from "@/domains/game/ingame/constants/chat/ingameChatCloseupLayout.js"
import { useKeyboardInset } from "@m/domains/game/ingame/hooks/chat/useKeyboardInset.js"
import Composer from "./Composer.jsx"
import FrameSlice from "./FrameSlice.jsx"
import MessageList from "./MessageList.jsx"
import { FRAME_ROOT_CLASS, FRAME_SLICE, listInsetStyle } from "./chatStyle.js"

// 뒤 막은 데스크톱과 같은 검은 45%, 창 자리는 폰은 꽉 채움(안전영역 안쪽), 태블릿은 가운데
const BACKDROP_CLASS = "fixed inset-0 z-[70] cursor-default border-0 bg-black/45 p-0"
const WRAP_CLASS =
    "pointer-events-none fixed inset-0 z-[71] flex flex-col items-stretch justify-center px-[max(0.4rem,env(safe-area-inset-left,0px))] pt-[max(0.6rem,env(safe-area-inset-top,0px))] pb-[max(0.6rem,env(safe-area-inset-bottom,0px))] md:items-center md:p-[5svh]"
const PANEL_CLASS = `${FRAME_ROOT_CLASS} pointer-events-auto flex min-h-0 flex-1 flex-col overflow-visible md:w-[min(44rem,84vw)]`
const LIST_INSET = listInsetStyle(FRAME_SLICE.list)

// session은 채팅 세션 값
export default function CloseupSheet({ open, onClose, session }) {
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
                <>
                    <motion.button
                        key="chat-closeup-backdrop"
                        type="button"
                        aria-label="채팅 클로즈업 닫기"
                        className={BACKDROP_CLASS}
                        data-sfx-kind="ui-cancel"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={PANEL_TRANSITION}
                        onClick={onClose}
                    />
                    <div
                        key="chat-closeup-wrap"
                        className={WRAP_CLASS}
                        style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
                    >
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-label="채팅 클로즈업"
                            className={PANEL_CLASS}
                            initial={{ opacity: 0, scale: 0.94, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 8 }}
                            transition={PANEL_TRANSITION}
                        >
                            <button
                                type="button"
                                aria-label="채팅 클로즈업 닫기"
                                onClick={onClose}
                                data-sfx-kind="ui-cancel"
                                className="absolute -top-1 -right-1 z-20 block w-[3.4rem] cursor-pointer border-0 bg-transparent p-0 leading-none transition-transform duration-200 ease-out active:scale-[0.99]"
                            >
                                <PublicAsset src={INGAME_CHAT_ASSETS.closeButton} alt="" className="block h-auto w-full select-none" />
                            </button>
                            <div className="relative min-h-0 flex-1 overflow-hidden">
                                <FrameSlice slice={FRAME_SLICE.list} />
                                <MessageList messages={session.messages} insetStyle={LIST_INSET} fontBase={1.12} />
                            </div>
                            <Composer
                                draft={session.draft}
                                onDraftChange={session.onDraftChange}
                                onSend={session.onSend}
                                status={session.status}
                                error={session.error}
                                withStatus
                                lift={false}
                            />
                        </motion.div>
                    </div>
                </>
            ) : null}
        </AnimatePresence>,
        document.body,
    )
}
