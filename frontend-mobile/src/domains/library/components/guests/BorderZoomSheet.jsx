// 프로필 테두리 크게 보기 바닥 시트 (어두운 뒤판 + 아래서 올라오는 양피지 판)
// guests/ChallengeList.jsx가 씀, 데스크톱 ProfileBorderZoomOverlay(화면 UI라 못 부름)를 모바일 시트로
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { SECTION_TITLE_CLASS, SHEET_CLOSE_SRC, TAP_CLASS } from "@m/domains/library/constants/libraryStyle.js"

const SHEET_TRANSITION = { duration: 0.32, ease: [0.22, 1, 0.36, 1] }

// item = { icon, label }, 비면 닫힘, 뒤판·닫기·Esc로 닫음
export default function BorderZoomSheet({ item, onClose }) {
  const open = Boolean(item)

  // 열려 있을 때만 Esc 받음, 닫을 때 취소 소리 (데스크톱과 같음)
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

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" key="border-zoom">
          <motion.button
            type="button"
            aria-label="프로필 테두리 확대 보기 닫기"
            data-sfx-kind="ui-cancel"
            className="absolute inset-0 cursor-default border-0 bg-[#1a0f0a]/65 p-0 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SHEET_TRANSITION}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${item.label} 프로필 테두리 보기`}
            className="relative flex max-h-[90svh] w-full flex-col items-center rounded-t-2xl border border-[#b83232]/40 bg-[#f5f0e6]/95 px-4 pb-4 pt-2 safe-pb shadow-[0_-10px_30px_rgba(0,0,0,0.45)] md:w-[26rem] md:rounded-2xl land:max-w-md"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SHEET_TRANSITION}
          >
            <div className="h-1.5 w-12 rounded-full bg-[#2a1810]/25" aria-hidden="true" />
            <button type="button" aria-label="프로필 테두리 확대 보기 닫기" onClick={onClose} className={`${TAP_CLASS} absolute right-2 top-2`}>
              <PublicAsset src={SHEET_CLOSE_SRC} alt="" className="block h-9 w-9 select-none object-contain" />
            </button>
            <PublicAsset
              src={item.icon}
              alt={item.label}
              className="mt-6 block aspect-square w-[min(16rem,62vw)] select-none object-contain land:w-[min(12rem,45svh)]"
            />
            <p className={`m-0 mt-3 text-center ${SECTION_TITLE_CLASS}`}>{item.label}</p>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
