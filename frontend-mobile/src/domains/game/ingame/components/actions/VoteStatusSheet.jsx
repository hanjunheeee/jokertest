// 투표 현황 바닥 시트: 손잡이·제목·닫기 버튼·안내 글 + 낮 투표 집계, 뒤 막·Esc로 닫기
// 행동 줄(ActionRow)의 투표 현황 버튼이 엶, .mobile-shell 틀 밖에 그리려고 body로 포털
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_VOTE_ASSETS } from "@/domains/game/ingame/constants/vote/ingameVoteAssets.js"
import VoteStatusContent from "./VoteStatusContent.jsx"

const SHEET_SPRING = { type: "spring", stiffness: 380, damping: 38 }
const TITLE = "투표 현황"

// 열렸을 때만 Esc 닫기 (닫는 소리 같이), 내용은 VoteStatusContent
export default function VoteStatusSheet({ open, onClose, nameOf }) {
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
        <div key="vote-status" className="fixed inset-0 z-[60] flex flex-col justify-end" role="presentation">
          <motion.button
            type="button"
            aria-label={`${TITLE} 닫기`}
            data-sfx-kind="ui-cancel"
            className="absolute inset-0 cursor-default border-0 bg-black/65 p-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={TITLE}
            className="relative mx-auto flex max-h-[80dvh] w-full max-w-[34rem] flex-col overflow-hidden rounded-t-2xl border-2 border-b-0 border-[#c9b892]/45 bg-[#1d1611] text-[#f5f0e6] shadow-[0_-10px_30px_rgba(0,0,0,0.6)] md:max-w-[40rem] land:max-h-[96dvh]"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SHEET_SPRING}
          >
            <div className="relative flex shrink-0 items-center justify-center px-12 pt-3 pb-1">
              <span aria-hidden="true" className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-current opacity-30" />
              <h2 className="truncate pt-1 text-center font-display app-text-scaled [--app-text-size:1.3rem] font-bold text-[#f5e8c8]">{TITLE}</h2>
              <button
                type="button"
                aria-label={`${TITLE} 닫기`}
                data-sfx-kind="ui-cancel"
                onClick={onClose}
                className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center border-0 bg-transparent p-0"
                style={{ outline: "none" }}
              >
                <PublicAsset src={INGAME_VOTE_ASSETS.closeButton} alt="" className="block h-8 w-8 select-none object-contain" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4">
              <p className="mb-2 text-center font-subheading app-text-scaled [--app-text-size:0.9rem] font-bold text-white/90">
                각 플레이어가 받은 투표 수입니다.
              </p>
              <VoteStatusContent nameOf={nameOf} />
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
