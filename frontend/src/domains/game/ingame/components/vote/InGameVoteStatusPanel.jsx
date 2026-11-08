// 투표 현황 창: 틀 그림·제목·닫기 버튼과 낮 투표 집계 내용
// 인게임 화면이 사용, 여는 버튼은 구석 행동 패널의 투표 현황 버튼
import { AnimatePresence, motion } from "framer-motion"
import { useRef } from "react"
import { INGAME_VOTE_ASSETS } from "../../constants/vote/ingameVoteAssets.js"
import {
  BACKDROP_CLASS,
  VOTE_CLOSE_BTN_CLASS,
  VOTE_CLOSE_BTN_IMG_CLASS,
  VOTE_FRAME_IMG_CLASS,
  VOTE_PANEL_INNER_CLASS,
  INGAME_VOTE_PANEL_INSET,
  PANEL_TRANSITION,
  PANEL_WRAP_CLASS,
  SUBTITLE_CLASS,
  INGAME_VOTE_TITLE_CLASS,
  getVotePanelStyle,
} from "../../constants/vote/ingameVoteLayout.js"
import InGameVoteStatusContent from "./InGameVoteStatusContent.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { useInGameModalLayer } from "../../hooks/useInGameModalLayer.js"

// 키보드로 왔을 때만 보이는 초점 테두리
const FOCUS_RING_CLASS = "outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f3d28d]"

// 뒤 막·닫기 버튼·Esc 모두 onClose, 집계 내용은 InGameVoteStatusContent
export default function InGameVoteStatusPanel({ open, onClose }) {
  // 열렸을 때 맨 위 창이면 Esc로 닫기(닫는 소리 같이), 초점은 창 안으로 옮기고 가둠
  const dialogRef = useRef(null)
  useInGameModalLayer({ open, onClose, containerRef: dialogRef })

  // 창 안 누름은 뒤 막 닫기로 번지지 않게 막음
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="투표 현황 닫기"
            className={BACKDROP_CLASS}
            data-sfx-kind="ui-cancel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={PANEL_TRANSITION}
            onClick={onClose}
          />

          <div className={PANEL_WRAP_CLASS}>
            <motion.div
              ref={dialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="투표 현황"
              className={VOTE_PANEL_INNER_CLASS}
              style={getVotePanelStyle()}
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={PANEL_TRANSITION}
              onClick={(event) => event.stopPropagation()}
            >
              <PublicAsset
                src={INGAME_VOTE_ASSETS.panelFrame}
                alt=""
                className={VOTE_FRAME_IMG_CLASS}
              />

              <h2 className={INGAME_VOTE_TITLE_CLASS}>투표 현황</h2>

              <button
                type="button"
                aria-label="투표 현황 닫기"
                onClick={onClose}
                data-sfx-kind="ui-cancel"
                className={`${VOTE_CLOSE_BTN_CLASS} ${FOCUS_RING_CLASS}`}
              >
                <PublicAsset
                  src={INGAME_VOTE_ASSETS.closeButton}
                  alt=""
                  className={VOTE_CLOSE_BTN_IMG_CLASS}
                />
              </button>

              <div
                className="absolute inset-0 z-[2] flex min-h-0 flex-col"
                style={INGAME_VOTE_PANEL_INSET}
              >
                <p className={SUBTITLE_CLASS}>
                  오늘 낮 투표 집계 결과입니다.
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