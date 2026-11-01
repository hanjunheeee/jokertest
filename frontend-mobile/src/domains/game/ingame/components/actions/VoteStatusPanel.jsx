// 투표 현황 창: 데스크톱 틀 그림·제목·닫기 버튼·부제 + 낮 투표 집계, 뒤 막·Esc로 닫기
// 행동 줄(ActionRow)의 투표 현황 버튼이 엶, .mobile-shell 틀 밖에 그리려고 body로 포털
import { useEffect } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_VOTE_ASSETS } from "@/domains/game/ingame/constants/vote/ingameVoteAssets.js"
import {
  BACKDROP_CLASS,
  INGAME_VOTE_PANEL_INSET,
  INGAME_VOTE_TITLE_CLASS,
  PANEL_TRANSITION,
  PANEL_WRAP_CLASS,
  SUBTITLE_CLASS,
  VOTE_CLOSE_BTN_CLASS,
  VOTE_CLOSE_BTN_IMG_CLASS,
  VOTE_FRAME_IMG_CLASS,
  VOTE_PANEL_INNER_CLASS,
} from "@/domains/game/ingame/constants/vote/ingameVoteLayout.js"
import { useVotePanelFit } from "../../hooks/actions/useVotePanelFit.js"
import VoteStatusContent from "./VoteStatusContent.jsx"

const TITLE = "투표 현황"

// 닫기 그림은 폰에서 작아지니 보이지 않는 누름 칸을 넓힘 (44px 이상)
const CLOSE_HIT_CLASS = "before:absolute before:-inset-3 before:content-['']"

// 창은 데스크톱 폭으로 그리고 배율만 줄임 (틀 그림 위 글 자리가 데스크톱과 같게)
export default function VoteStatusPanel({ open, onClose, nameOf }) {
  const fit = useVotePanelFit(open)

  // 열렸을 때만 Esc로 닫기 (닫는 소리 같이 냄)
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
        <div key="vote-status" className="fixed inset-0 z-[60]">
          <motion.button
            type="button"
            aria-label={`${TITLE} 닫기`}
            className={BACKDROP_CLASS}
            data-sfx-kind="ui-cancel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={PANEL_TRANSITION}
            onClick={onClose}
          />
          <div className={PANEL_WRAP_CLASS}>
            <div className="shrink-0" style={{ width: fit.width, transform: `scale(${fit.scale})` }}>
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={TITLE}
                className={VOTE_PANEL_INNER_CLASS}
                initial={{ opacity: 0, scale: 0.94, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={PANEL_TRANSITION}
                onClick={(event) => event.stopPropagation()}
              >
                <PublicAsset src={INGAME_VOTE_ASSETS.panelFrame} alt="" className={VOTE_FRAME_IMG_CLASS} />
                <h2 className={INGAME_VOTE_TITLE_CLASS}>{TITLE}</h2>
                <button
                  type="button"
                  aria-label={`${TITLE} 닫기`}
                  onClick={onClose}
                  data-sfx-kind="ui-cancel"
                  className={`${VOTE_CLOSE_BTN_CLASS} ${CLOSE_HIT_CLASS}`}
                  style={{ outline: "none" }}
                >
                  <PublicAsset src={INGAME_VOTE_ASSETS.closeButton} alt="" className={VOTE_CLOSE_BTN_IMG_CLASS} />
                </button>
                <div className="absolute inset-0 z-[2] flex min-h-0 flex-col" style={INGAME_VOTE_PANEL_INSET}>
                  <p className={SUBTITLE_CLASS}>각 플레이어가 받은 투표 수입니다.</p>
                  <VoteStatusContent nameOf={nameOf} />
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
