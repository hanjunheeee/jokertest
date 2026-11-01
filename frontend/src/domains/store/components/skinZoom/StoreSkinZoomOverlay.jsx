import { AnimatePresence, motion } from "framer-motion"
import { useEffect } from "react"
import {
  BACKDROP_CLASS,
  PANEL_WRAP_CLASS,
  ZOOM_TRANSITION,
} from "../../constants/storeSkinZoomLayout.js"
import StoreSkinZoomPanel from "./StoreSkinZoomPanel.jsx"
import { dispatchUiSfx } from "../../../../shared/hooks/useSfxRuntime.js"

export default function StoreSkinZoomOverlay({ open, item, onClose }) {
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

  return (
    <AnimatePresence>
      {open && item ? (
        <>
          <motion.button
            type="button"
            aria-label="스킨 확대 보기 닫기"
            className={BACKDROP_CLASS}
            data-sfx-kind="ui-cancel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={ZOOM_TRANSITION}
            onClick={onClose}
          />

          <div className={PANEL_WRAP_CLASS} aria-hidden={!open}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`${item.name} 스킨 전신 보기`}
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={ZOOM_TRANSITION}
              onClick={(event) => event.stopPropagation()}
            >
              <StoreSkinZoomPanel item={item} onClose={onClose} />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
