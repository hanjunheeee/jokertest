// 아래에서 올라오는 시트 (뒤판·손잡이·제목 줄·닫기·스크롤 몸통), body로 portal
// CardSheet가 씀 (panelRef는 데스크톱 카드 메뉴의 바깥 누름 판단에 넘김)
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { STORE_ASSETS } from "@/shared/constants/storeAssets.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { BACKDROP_CLASS, CLOSE_BTN_CLASS, PANEL_CLASS, PARCHMENT_CLASS, SHEET_TITLE_CLASS, SHEET_TRANSITION } from "./sheetStyle.js"

// 열린 동안 Esc로 닫기 (태블릿 키보드 대비)
function useEscape(open, onClose) {
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
}

// 열렸을 때만 그림, 뒤판·Esc·닫기 버튼으로 닫음
export default function Sheet({ open, title, closeLabel = "닫기", onClose, panelRef, children, ...rest }) {
    useEscape(open, onClose)

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
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={title}
                        className={`${PANEL_CLASS} ${PARCHMENT_CLASS}`}
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={SHEET_TRANSITION}
                        {...rest}
                    >
                        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#2a1810]/25" aria-hidden="true" />
                        <header className="flex shrink-0 items-center gap-2 border-b border-[#2a1810]/14 py-1 pl-4 pr-2">
                            <h2 className={SHEET_TITLE_CLASS}>{title}</h2>
                            <button
                                type="button"
                                aria-label={closeLabel}
                                className={CLOSE_BTN_CLASS}
                                data-sfx-kind="ui-cancel"
                                onClick={onClose}
                                style={{ outline: "none" }}
                            >
                                <PublicAsset src={STORE_ASSETS.popupCloseButton} alt="" className="block h-9 w-9 select-none object-contain" />
                            </button>
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
