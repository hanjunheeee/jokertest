// 화면 전체 시트 틀 (아래에서 올라옴, 위 줄 제목·닫기 그림 버튼, Esc로 닫힘, 안전영역 비킴)
// WearSheet·ProfileEditSheet가 씀
import { motion } from "framer-motion"
import { SKIN_CARD_WEAR_ASSETS } from "@/domains/user/constants/skinCardWear/skinCardWearAssets.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import CloseButton from "@m/shared/ui/button/CloseButton.jsx"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"

const SHEET_MOTION = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
}

// 데스크톱 팝업 틀 그림은 가로형이라 세로 화면엔 단색 판 + 금색 테두리로 대신함
export default function FullSheet({ open, onClose, label, title, header, className = "bg-[#140c08]", children }) {
  // 닫기 그림 버튼: 취소 소리 뒤 닫음
  const handleClose = () => {
    dispatchUiSfx("ui-cancel")
    onClose()
  }

  return (
    <SheetPortal open={open} onClose={onClose}>
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
          <CloseButton
            label={`${label} 닫기`}
            onClick={handleClose}
            src={SKIN_CARD_WEAR_ASSETS.popupCloseButton}
            data-sfx-owner="explicit"
            className="flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent p-0 active:scale-95"
            iconClassName="block h-10 w-10 select-none object-contain"
          />
        </div>
        {children}
      </motion.div>
    </SheetPortal>
  )
}
