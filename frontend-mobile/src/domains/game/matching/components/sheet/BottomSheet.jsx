// 바닥에서 올라오는 시트 틀: 어두운 바탕·손잡이·제목·닫기 버튼·바닥 줄, Esc로 닫기
// 대기방 시트들(방장 메뉴·방코드·친구 초대·추방·설정 변경·시작 막힘)이 씀
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { CLOSE_BUTTON_SRC, ICON_BTN_CLASS } from "../../constants/matchingMobileStyles.js"

// 시트 판 모양: 어두운 판(목록 시트) / 양피지 판(방코드·설정)
const TONE_CLASS = {
  dark: "border-[#c9b892]/45 bg-[#1d1611] text-[#f5f0e6]",
  parchment: "border-[#5b4a36] bg-[#cdb68a] text-[#1a1008]",
}

// 높이: 내용만큼(최대 88%) / 거의 꽉 참(설정 편집처럼 긴 폼)
const SIZE_CLASS = {
  auto: "max-h-[88dvh] land:max-h-[96dvh]",
  full: "h-[94dvh] land:h-[96dvh]",
}

const SHEET_SPRING = { type: "spring", stiffness: 380, damping: 38 }

// 바닥 시트 (document.body에 포털로 띄워 바닥 줄보다 위에 그림)
export default function BottomSheet({
  open,
  onClose,
  title,
  tone = "dark",
  size = "auto",
  closeLabel,
  closeDisabled = false,
  footer = null,
  children,
}) {
  // 열려 있을 때만 Esc로 닫음 (닫기 소리 같이)
  useEffect(() => {
    if (!open || closeDisabled) return undefined
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      dispatchUiSfx("ui-cancel", event)
      onClose?.()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose, closeDisabled])

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div key="sheet" className="fixed inset-0 z-[60] flex flex-col justify-end" role="presentation">
          {/* 바깥 어두운 바탕 누르면 닫힘 */}
          <motion.button
            type="button"
            aria-label={closeLabel ?? `${title} 닫기`}
            data-sfx-kind="ui-cancel"
            disabled={closeDisabled}
            className="absolute inset-0 cursor-default border-0 bg-black/65 p-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`relative mx-auto flex w-full max-w-[34rem] flex-col overflow-hidden rounded-t-2xl border-2 border-b-0 shadow-[0_-10px_30px_rgba(0,0,0,0.6)] md:max-w-[40rem] ${TONE_CLASS[tone]} ${SIZE_CLASS[size]}`}
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SHEET_SPRING}
          >
            {/* 손잡이 + 제목 + 닫기 */}
            <div className="relative flex shrink-0 items-center justify-center px-12 pt-3 pb-1">
              <span aria-hidden="true" className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-current opacity-30" />
              <h2 className="truncate pt-1 text-center font-display app-text-scaled [--app-text-size:1.3rem] font-bold text-inherit">
                {title}
              </h2>
              <button
                type="button"
                aria-label={closeLabel ?? `${title} 닫기`}
                data-sfx-kind="ui-cancel"
                disabled={closeDisabled}
                onClick={onClose}
                className={`${ICON_BTN_CLASS} absolute right-1 top-1.5`}
              >
                <PublicAsset src={CLOSE_BUTTON_SRC} alt="" className="block h-8 w-8 select-none object-contain" />
              </button>
            </div>

            {/* 본문 (길면 이 안에서만 스크롤) */}
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-3">
              {children}
            </div>

            {/* 바닥 고정 줄 (저장·취소 같은 버튼) */}
            {footer ? (
              <div className="shrink-0 border-t border-current/15 px-4 pt-2 pb-3">{footer}</div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
