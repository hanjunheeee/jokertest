/**
 * 인게임 좌측 슬라이드 패널 shell — 프레임·backdrop·닫기·본문 inset.
 */
import { AnimatePresence, motion } from "framer-motion"
import { INGAME_SIDE_PANEL_ASSETS } from "../../constants/controls/ingameSidePanelAssets.js"
import {
  INGAME_SIDE_PANEL_BACKDROP_CLASS,
  INGAME_SIDE_PANEL_CLOSE_BTN_CLASS,
  INGAME_SIDE_PANEL_CLOSE_BTN_IMG_CLASS,
  INGAME_SIDE_PANEL_CLASS,
  INGAME_SIDE_PANEL_FRAME_IMAGE_CLASS,
  INGAME_SIDE_PANEL_INSET,
  INGAME_SIDE_PANEL_TRANSITION,
} from "../../constants/controls/ingameSidePanelLayout.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

export default function SidePanel({
  open,
  onClose,
  ariaLabel,
  closeAriaLabel = ariaLabel,
  children,
}) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label={closeAriaLabel}
            className={INGAME_SIDE_PANEL_BACKDROP_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={INGAME_SIDE_PANEL_TRANSITION}
            onClick={onClose}
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className={INGAME_SIDE_PANEL_CLASS}
            initial={{ opacity: 0, x: -28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            transition={INGAME_SIDE_PANEL_TRANSITION}
            onClick={(event) => event.stopPropagation()}
          >
            <PublicAsset
              src={INGAME_SIDE_PANEL_ASSETS.panelFrame}
              alt=""
              className={INGAME_SIDE_PANEL_FRAME_IMAGE_CLASS}
            />

            <button
              type="button"
              aria-label={closeAriaLabel}
              onClick={onClose}
              className={INGAME_SIDE_PANEL_CLOSE_BTN_CLASS}
              style={{ outline: "none" }}
            >
              <PublicAsset
                src={INGAME_SIDE_PANEL_ASSETS.closeButton}
                alt=""
                className={INGAME_SIDE_PANEL_CLOSE_BTN_IMG_CLASS}
              />
            </button>

            <div
              className="relative flex h-full min-h-0 flex-col"
              style={INGAME_SIDE_PANEL_INSET}
            >
              {children}
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}
