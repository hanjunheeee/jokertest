// 가운데 겹 창 틀: 덮개·가운데 자리·Esc 닫기 (안쪽 그림 틀·내용은 children)
// 추방 창(KickSheet)·방 코드 창(RoomCodeSheet)이 씀, 데스크톱 추방 창·방코드 창처럼 설정 시트 위 가운데에 뜸
import { AnimatePresence, motion } from "framer-motion"
import { createPortal } from "react-dom"
import { useEscapeClose } from "../../../hooks/sheets/useEscapeClose.js"
import { SHEET_LAYERS } from "./sheetStyle.js"

// 움직임 없는 창이 쓰는 기본값 (데스크톱 추방 창은 그냥 뜸)
const STILL = { hidden: {}, visible: {} }

// 열렸을 때만 그림, 덮개 진하기·움직임은 부르는 쪽 데스크톱 값으로 받음
export default function Modal({
  open,
  onClose,
  closeLabel,
  ariaLabel,
  backdropClassName = "bg-black/45",
  variants = STILL,
  testId,
  className = "",
  style,
  children,
}) {
  useEscapeClose(open, onClose)
  const z = SHEET_LAYERS.top

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div key="modal" className={`fixed inset-0 ${z.backdrop}`} role="presentation">
          <motion.button
            type="button"
            aria-label={closeLabel}
            data-sfx-kind="ui-cancel"
            className={`absolute inset-0 cursor-default border-0 p-0 ${backdropClassName}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* 안전영역 안 가운데, 키 낮은 화면은 창 안에서 스크롤 */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={ariaLabel}
              data-testid={testId}
              className={`pointer-events-auto relative ${className}`}
              style={style}
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={variants}
            >
              {children}
            </motion.div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
