// 글 위주 가운데 창 (어두운 뒤판·밝은 양피지 창·제목, closable이 거짓이면 뒤판·Esc로 못 닫음)
// 약관 전체 보기·재동의·탈퇴 확인·쿠폰 입력·새 버전 안내 창이 씀 (모바일)
import { motion } from "framer-motion"
import SheetPortal from "@m/shared/ui/sheet/SheetPortal.jsx"
import { BACKDROP_CLASS, PANEL_MOTION, WRAP_CLASS } from "./centerModalStyle.js"

const PANEL_CLASS =
  "pointer-events-auto relative flex max-h-[calc(100svh-2rem)] w-[min(30rem,92vw)] flex-col gap-3 overflow-hidden rounded-[1rem] border border-[#8b6a3e]/60 bg-[#f5f0e6] p-4 text-[#2b1d10] [box-shadow:0_16px_42px_rgba(26,15,10,0.36)]"
const TITLE_CLASS = "font-subheading font-bold app-text-scaled [--app-text-size:1.05rem]"

export default function TextDialog({ open, title, onClose, closable = true, children }) {
  const close = closable ? onClose : null
  return (
    <SheetPortal open={open} onClose={close}>
      <>
        <motion.div
          key="backdrop"
          aria-hidden="true"
          className={BACKDROP_CLASS}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close ?? undefined}
        />
        <div key="wrap" className={WRAP_CLASS}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={PANEL_CLASS}
            {...PANEL_MOTION}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className={TITLE_CLASS}>{title}</h2>
            {children}
          </motion.div>
        </div>
      </>
    </SheetPortal>
  )
}
