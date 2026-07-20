import { AnimatePresence, motion } from "framer-motion"
import { useEffect } from "react"
import { INGAME_VOTE_ASSETS } from "../../constants/vote/ingameVoteAssets.js"
import {
  INGAME_VOTE_BACKDROP_CLASS,
  INGAME_VOTE_CLOSE_BTN_CLASS,
  INGAME_VOTE_CLOSE_BTN_IMG_CLASS,
  INGAME_VOTE_FRAME_IMAGE_CLASS,
  INGAME_VOTE_PANEL_INNER_CLASS,
  INGAME_VOTE_PANEL_INSET,
  INGAME_VOTE_PANEL_TRANSITION,
  INGAME_VOTE_PANEL_WRAP_CLASS,
  INGAME_VOTE_SUBTITLE_CLASS,
  INGAME_VOTE_TITLE_CLASS,
  getInGameVotePanelStyle,
} from "../../constants/vote/ingameVoteLayout.js"
import InGameVoteStatusContent from "./InGameVoteStatusContent.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

/** 인게임 투표현황 팝업 — 중앙 모달 */
export default function InGameVoteStatusPanel({ open, onClose }) {
  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="투표 현황 닫기"
            className={INGAME_VOTE_BACKDROP_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={INGAME_VOTE_PANEL_TRANSITION}
            onClick={onClose}
          />

          <div className={INGAME_VOTE_PANEL_WRAP_CLASS} aria-hidden={!open}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="투표 현황"
              className={INGAME_VOTE_PANEL_INNER_CLASS}
              style={getInGameVotePanelStyle()}
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={INGAME_VOTE_PANEL_TRANSITION}
              onClick={(event) => event.stopPropagation()}
            >
              <PublicAsset
                src={INGAME_VOTE_ASSETS.panelFrame}
                alt=""
                className={INGAME_VOTE_FRAME_IMAGE_CLASS}
              />

              <h2 className={INGAME_VOTE_TITLE_CLASS}>투표 현황</h2>

              <button
                type="button"
                aria-label="투표 현황 닫기"
                onClick={onClose}
                className={INGAME_VOTE_CLOSE_BTN_CLASS}
                style={{ outline: "none" }}
              >
                <PublicAsset
                  src={INGAME_VOTE_ASSETS.closeButton}
                  alt=""
                  className={INGAME_VOTE_CLOSE_BTN_IMG_CLASS}
                />
              </button>

              <div
                className="absolute inset-0 z-[2] flex min-h-0 flex-col"
                style={INGAME_VOTE_PANEL_INSET}
              >
                <p className={INGAME_VOTE_SUBTITLE_CLASS}>
                  각 플레이어가 받은 투표 수입니다.
                </p>
                <InGameVoteStatusContent />
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
