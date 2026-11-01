// 스킨 전신 보기 창 바깥 틀 (어두운 뒤판·Esc로 닫기·열고 닫는 움직임)
// StorePanelOverlays가 씀
import { AnimatePresence, motion } from "framer-motion"
import { useEffect } from "react"
import {
  BACKDROP_CLASS,
  PANEL_WRAP_CLASS,
  ZOOM_TRANSITION,
} from "../../constants/storeSkinZoomLayout.js"
import StoreSkinZoomPanel from "./StoreSkinZoomPanel.jsx"
import { dispatchUiSfx } from "../../../../shared/hooks/useSfxRuntime.js"

// 열렸고 보일 스킨이 있을 때만 보임
export default function StoreSkinZoomOverlay({ open, item, onClose }) {
  // 열려 있을 때만 Esc 듣기, 닫히면 떼어 냄
  useEffect(() => {
    if (!open) return undefined

    // Esc면 취소 소리 내고 닫음
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
          {/* 뒤판 누르면 닫음 */}
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

          {/* 창 안 클릭은 바깥으로 번지지 않게 막음 */}
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
