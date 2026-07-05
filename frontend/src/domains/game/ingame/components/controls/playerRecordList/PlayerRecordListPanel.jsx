/**
 * 인게임 플레이어별 전적목록 패널.
 *
 * 햄버거 버튼으로 열리며, 로비 친구목록 탭과 동일 프레임·위치 체계를 사용합니다.
 */
import { AnimatePresence, motion } from "framer-motion"
import { INGAME_PLAYER_RECORD_LIST_ASSETS } from "../../../constants/ingamePlayerRecordListAssets.js"
import {
  INGAME_PLAYER_RECORD_LIST_BACKDROP_CLASS,
  INGAME_PLAYER_RECORD_LIST_CLOSE_BTN_CLASS,
  INGAME_PLAYER_RECORD_LIST_CLOSE_BTN_IMG_CLASS,
  INGAME_PLAYER_RECORD_LIST_FRAME_IMAGE_CLASS,
  INGAME_PLAYER_RECORD_LIST_PANEL_CLASS,
  INGAME_PLAYER_RECORD_LIST_PANEL_INSET,
  INGAME_PLAYER_RECORD_LIST_PANEL_TRANSITION,
} from "../../../constants/ingamePlayerRecordListLayout.js"
import PlayerRecordListContent from "./PlayerRecordListContent.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function PlayerRecordListPanel({ open, onClose }) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="플레이어별 전적목록 닫기"
            className={INGAME_PLAYER_RECORD_LIST_BACKDROP_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={INGAME_PLAYER_RECORD_LIST_PANEL_TRANSITION}
            onClick={onClose}
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="플레이어별 전적목록"
            className={INGAME_PLAYER_RECORD_LIST_PANEL_CLASS}
            initial={{ opacity: 0, x: -28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            transition={INGAME_PLAYER_RECORD_LIST_PANEL_TRANSITION}
            onClick={(event) => event.stopPropagation()}
          >
            <PublicAsset
              src={INGAME_PLAYER_RECORD_LIST_ASSETS.panelFrame}
              alt=""
              className={INGAME_PLAYER_RECORD_LIST_FRAME_IMAGE_CLASS}
            />

            <button
              type="button"
              aria-label="플레이어별 전적목록 닫기"
              onClick={onClose}
              className={INGAME_PLAYER_RECORD_LIST_CLOSE_BTN_CLASS}
              style={{ outline: "none" }}
            >
              <PublicAsset
                src={INGAME_PLAYER_RECORD_LIST_ASSETS.closeButton}
                alt=""
                className={INGAME_PLAYER_RECORD_LIST_CLOSE_BTN_IMG_CLASS}
              />
            </button>

            <div
              className="relative flex h-full min-h-0 flex-col"
              style={INGAME_PLAYER_RECORD_LIST_PANEL_INSET}
            >
              <PlayerRecordListContent />
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
