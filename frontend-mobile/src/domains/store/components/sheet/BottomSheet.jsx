// 아래에서 올라오는 시트 (뒤판·제목 줄·닫기·스크롤 몸통)
// 상점 상품 설명·프로필 테두리 크게 보기가 씀 (데스크톱 가운데 겹창 대신)
import { AnimatePresence, motion } from "framer-motion"
import { createPortal } from "react-dom"
import { useEscapeClose } from "../../hooks/useEscapeClose.js"
import SheetCloseButton from "./SheetCloseButton.jsx"
import { BACKDROP_CLASS, PARCHMENT_CLASS, SHEET_TITLE_CLASS, SHEET_TRANSITION } from "./sheetStyle.js"

// 폰은 화면 폭 전체, 태블릿·가로는 가운데 폭 제한
const PANEL_CLASS =
    "fixed inset-x-0 bottom-0 z-[61] mx-auto flex max-h-[88svh] w-full flex-col overflow-hidden rounded-t-[1.1rem] md:max-w-xl land:max-w-lg land:max-h-[94svh]"

// 열렸을 때만 그림, 뒤판·Esc·닫기 버튼으로 닫음
export default function BottomSheet({ open, title, closeLabel, onClose, children }) {
    useEscapeClose(open, onClose)

    return createPortal(
        <AnimatePresence>
            {open ? (
                <>
                    <motion.button
                        key="backdrop"
                        type="button"
                        aria-label={closeLabel}
                        className={BACKDROP_CLASS}
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
                        className={`${PANEL_CLASS} ${PARCHMENT_CLASS} bg-[#f5f0e6]/95`}
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={SHEET_TRANSITION}
                    >
                        {/* 손잡이 모양 (끌기 동작은 없음, 시트라는 표시만) */}
                        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#2a1810]/25" aria-hidden="true" />
                        <header className="flex shrink-0 items-center gap-2 border-b border-[#2a1810]/14 py-1 pl-4 pr-2">
                            <h2 className={SHEET_TITLE_CLASS}>{title}</h2>
                            <SheetCloseButton label={closeLabel} onClose={onClose} />
                        </header>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3">
                            {children}
                        </div>
                    </motion.div>
                </>
            ) : null}
        </AnimatePresence>,
        document.body,
    )
}
