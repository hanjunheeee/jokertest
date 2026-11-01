import { AnimatePresence, motion } from "framer-motion"
import { PANEL_ASSETS } from "../../constants/controls/ingameSidePanelAssets.js"
import {
  BACKDROP_CLASS,
  CLOSE_BTN_CLASS,
  CLOSE_BTN_IMG_CLASS,
  INGAME_SIDE_PANEL_CLASS,
  FRAME_IMG_CLASS,
  INGAME_SIDE_PANEL_INSET,
  PANEL_TRANSITION,
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
            className={BACKDROP_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={PANEL_TRANSITION}
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
            transition={PANEL_TRANSITION}
            onClick={(event) => event.stopPropagation()}
          >
            <PublicAsset
              src={PANEL_ASSETS.panelFrame}
              alt=""
              className={FRAME_IMG_CLASS}
            />

            <button
              type="button"
              aria-label={closeAriaLabel}
              onClick={onClose}
              className={CLOSE_BTN_CLASS}
              style={{ outline: "none" }}
            >
              <PublicAsset
                src={PANEL_ASSETS.closeButton}
                alt=""
                className={CLOSE_BTN_IMG_CLASS}
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
