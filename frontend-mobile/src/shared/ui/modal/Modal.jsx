// 가운데 겹 창 틀: 덮개·가운데 자리·Esc 닫기 (안쪽 그림 틀·내용은 children)
// 대기방·인게임 방코드 창과 투표 창 틀(VoteFrameModal)이 씀, 데스크톱 창처럼 화면 가운데에 뜸
import { motion } from "framer-motion"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"

// 움직임 없는 창이 쓰는 기본값 (데스크톱 추방·친구 초대 창은 그냥 뜸)
const STILL = { hidden: {}, visible: {} }

// 층은 시트(z-60·61) 위 겹 창 자리 (인게임 SHEET_LAYERS.top과 같은 값)
const LAYER_CLASS = "z-[64]"

// 열렸을 때만 그림 (body로 띄움), 덮개 진하기·움직임은 부르는 쪽 데스크톱 값으로 받음
export default function Modal({
  open,
  onClose,
  closeLabel,
  ariaLabel,
  backdropClassName = "bg-black/45",
  layerClassName = LAYER_CLASS,
  variants = STILL,
  testId,
  className = "",
  style,
  children,
}) {
  return (
    <SheetPortal open={open} onClose={onClose}>
      <div key="modal" className={`fixed inset-0 ${layerClassName}`} role="presentation">
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
    </SheetPortal>
  )
}
