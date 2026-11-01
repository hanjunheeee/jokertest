// 화면 전체 시트 틀 (아래에서 올라옴, 위 줄 제목·닫기 그림 버튼, Esc로 닫힘, 안전영역 비킴)
// WearSheet·ProfileEditSheet가 씀
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { SKIN_CARD_WEAR_ASSETS } from "@/domains/user/constants/skinCardWear/skinCardWearAssets.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

const SHEET_MOTION = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
}

// 데스크톱 팝업 틀 그림은 가로형이라 세로 화면엔 단색 판 + 금색 테두리로 대신함
export default function FullSheet({ open, onClose, label, title, header, className = "bg-[#140c08]", children }) {
  const onCloseRef = useRef(onClose)

  // 늘 최신 닫기 함수 (Esc 등록을 열림 때 한 번만 하려고)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // 열려 있을 때만 Esc로 닫기 (태블릿 키보드)
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      dispatchUiSfx("ui-cancel", event)
      onCloseRef.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  // 닫기 그림 버튼: 취소 소리 뒤 닫음
  const handleClose = () => {
    dispatchUiSfx("ui-cancel")
    onCloseRef.current()
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="full-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          {...SHEET_MOTION}
          className={`fixed inset-0 z-[60] flex flex-col border-t border-[#c9a227]/35 safe-pt safe-pb safe-px ${className}`}
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-[#c9a227]/25 pl-4 pr-1.5 land:h-12">
            {title ? (
              <h2 className="min-w-0 flex-1 truncate font-display text-xl font-medium text-[#d4af37] [text-shadow:0_1px_2px_rgba(0,0,0,0.65)]">
                {title}
              </h2>
            ) : null}
            {header ? <div className="flex min-w-0 flex-1 items-center">{header}</div> : null}
            <button
              type="button"
              aria-label={`${label} 닫기`}
              data-sfx-owner="explicit"
              onClick={handleClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent p-0 active:scale-95"
            >
              <PublicAsset src={SKIN_CARD_WEAR_ASSETS.popupCloseButton} alt="" className="block h-10 w-10 select-none object-contain" />
            </button>
          </div>
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
