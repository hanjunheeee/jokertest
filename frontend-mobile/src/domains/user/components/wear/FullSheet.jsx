// 화면 전체 시트 틀 (아래에서 올라옴, 위 줄 제목·닫기 그림 버튼, Esc로 닫힘, 안전영역 비킴)
// WearSheet·ProfileEditSheet가 씀
import { motion } from "framer-motion"
import { LIST_TITLE_CLASS } from "@/domains/user/constants/skinCardWear/skinCardWearLayout.js"
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

const CENTERED_MOTION = {
  initial: { opacity: 0, scale: 0.96, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 6 },
  transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
}

const CENTERED_BACKDROP_CLASS =
  "fixed inset-0 z-[59] cursor-default border-0 bg-[#1a0f0a]/58 p-0 backdrop-blur-[3px]"

const CENTERED_WRAP_CLASS =
  "pointer-events-none fixed inset-0 z-[60] flex items-center justify-center p-3 safe-pt safe-pb safe-px"

const CENTERED_PANEL_OUTER_CLASS =
  "pointer-events-auto relative w-full max-w-[min(90vw,18.5rem)] overflow-visible land:max-w-[min(88vw,22rem)]"

const CENTERED_PANEL_INNER_CLASS =
  "flex max-h-[min(72svh,33rem)] min-h-0 w-full flex-col overflow-hidden rounded-[0.85rem] border shadow-[0_12px_36px_rgba(26,15,10,0.38)] land:max-h-[min(70svh,32rem)]"

const CENTERED_CLOSE_BTN_CLASS =
  "interactive-scale absolute z-30 right-[-1.55rem] top-[-1.45rem] flex h-11 w-11 items-center justify-center border-0 bg-transparent p-0 land:right-[-1.35rem] land:top-[-1.25rem] land:h-12 land:w-12"

const CENTERED_CLOSE_ICON_CLASS = "block h-10 w-10 select-none object-contain land:h-11 land:w-11"

// 판 색·테두리(className)와 위 줄 아래 선(headerClassName)은 창마다 데스크톱 값으로 넘김
// 데스크톱 팝업 틀 그림은 가로형이라 세로 화면엔 단색 판 + 테두리로 대신함
export default function FullSheet({
  open,
  onClose,
  label,
  title,
  header,
  className = "border-[#c9a227]/35 bg-[#140c08]",
  headerClassName = "border-[#c9a227]/25",
  variant = "fullscreen",
  children,
}) {
  // 닫기 그림 버튼: 취소 소리 뒤 닫음
  const handleClose = () => {
    dispatchUiSfx("ui-cancel")
    onClose()
  }

  const isCentered = variant === "centered"
  const headerRowClass = isCentered
    ? `flex h-12 shrink-0 items-center gap-1.5 border-b px-3 ${headerClassName}`
    : `flex h-14 shrink-0 items-center gap-2 border-b pl-4 pr-1.5 land:h-12 ${headerClassName}`

  const closeBtnClass =
    "interactive-scale flex h-11 w-11 shrink-0 items-center justify-center border-0 bg-transparent p-0"

  const closeIconClass = "block h-10 w-10 select-none object-contain"

  const closeButton = (
    <CloseButton
      label={`${label} 닫기`}
      onClick={handleClose}
      src={SKIN_CARD_WEAR_ASSETS.popupCloseButton}
      data-sfx-owner="explicit"
      className={isCentered ? CENTERED_CLOSE_BTN_CLASS : closeBtnClass}
      iconClassName={isCentered ? CENTERED_CLOSE_ICON_CLASS : closeIconClass}
    />
  )

  const sheetBody = (
    <>
      <div className={headerRowClass}>
        {title ? <h2 className={`min-w-0 flex-1 truncate ${LIST_TITLE_CLASS}`}>{title}</h2> : null}
        {header ? <div className="flex min-w-0 flex-1 items-center justify-center">{header}</div> : null}
        {isCentered ? null : closeButton}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </>
  )

  return (
    <SheetPortal open={open} onClose={onClose}>
      {isCentered ? (
        <div key="full-sheet-centered">
          <button
            type="button"
            aria-label={`${label} 닫기`}
            className={CENTERED_BACKDROP_CLASS}
            data-sfx-kind="ui-cancel"
            onClick={handleClose}
          />
          <div className={CENTERED_WRAP_CLASS}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={label}
              {...CENTERED_MOTION}
              className={CENTERED_PANEL_OUTER_CLASS}
            >
              {closeButton}
              <div className={`${CENTERED_PANEL_INNER_CLASS} ${className}`}>{sheetBody}</div>
            </motion.div>
          </div>
        </div>
      ) : (
        <motion.div
          key="full-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={label}
          {...SHEET_MOTION}
          className={`fixed inset-0 z-[60] flex flex-col border-t safe-pt safe-pb safe-px ${className}`}
        >
          {sheetBody}
        </motion.div>
      )}
    </SheetPortal>
  )
}
