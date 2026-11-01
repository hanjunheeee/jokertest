// 화면 전체를 덮는 시트 (제목 줄·닫기·몸통·바닥 줄)
// 상점 일괄구매 확인·스킨 전신 보기가 씀 (데스크톱 가운데 겹창 대신)
import { motion } from "framer-motion"
import CloseButton from "@m/shared/ui/button/CloseButton.jsx"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"
import { BACKDROP_CLASS, PARCHMENT_CLASS, SHEET_TITLE_CLASS, SHEET_TRANSITION } from "./sheetStyle.js"

// 폰은 꽉 채움 (안전영역 안쪽), 태블릿은 가운데 큰 창
const PANEL_CLASS =
    "fixed inset-0 z-[61] flex flex-col overflow-hidden pt-[env(safe-area-inset-top,0px)] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)] md:inset-x-auto md:inset-y-[6svh] md:left-1/2 md:w-[36rem] md:-translate-x-1/2 md:rounded-[1.1rem] md:pt-0"

// footer는 몸통 아래 고정 줄 (구매하기 등), 열렸을 때만 그림
export default function FullSheet({ open, title, closeLabel, onClose, footer = null, bodyClassName = "", children }) {
    return (
        <SheetPortal open={open} onClose={onClose}>
            <>
                <motion.button
                    key="backdrop"
                    type="button"
                    aria-label={closeLabel}
                    className={`${BACKDROP_CLASS} hidden md:block`}
                    data-sfx-kind="ui-cancel"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={SHEET_TRANSITION}
                    onClick={onClose}
                />
                <motion.div
                    key="panel"
                    role="dialog"
                    aria-modal="true"
                    aria-label={title}
                    className={`${PANEL_CLASS} ${PARCHMENT_CLASS} bg-[#f3ece0] md:bg-[#f5f0e6]/95`}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 24 }}
                    transition={SHEET_TRANSITION}
                >
                    <header className="flex shrink-0 items-center gap-2 border-b border-[#2a1810]/14 py-1 pl-4 pr-2">
                        <h2 className={SHEET_TITLE_CLASS}>{title}</h2>
                        <CloseButton label={closeLabel} onClick={onClose} data-sfx-kind="ui-cancel" style={{ outline: "none" }} />
                    </header>
                    <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${bodyClassName}`}>
                        {children}
                    </div>
                    {footer ? (
                        <footer className="shrink-0 border-t border-[#2a1810]/14 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
                            {footer}
                        </footer>
                    ) : null}
                </motion.div>
            </>
        </SheetPortal>
    )
}
