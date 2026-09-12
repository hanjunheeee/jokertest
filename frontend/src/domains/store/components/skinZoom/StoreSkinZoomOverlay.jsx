import { AnimatePresence, motion } from "framer-motion"
import { useEffect } from "react"
import {
  STORE_SKIN_ZOOM_BACKDROP_CLASS,
  STORE_SKIN_ZOOM_PANEL_WRAP_CLASS,
  STORE_SKIN_ZOOM_TRANSITION,
} from "../../constants/storeSkinZoomLayout.js"
import StoreSkinZoomPanel from "./StoreSkinZoomPanel.jsx"
// 다른 상점 오버레이와 달리 이 파일에는 `@/` 별칭 import가 없었다 — node:test에서 그대로
// 로드될 수 있도록 상대 경로를 유지한다.
import { dispatchUiSfx } from "../../../../shared/hooks/useSfxRuntime.js"

/** 스킨 상품 전신 확대 — 상점 UI 위 오버레이 */
export default function StoreSkinZoomOverlay({ open, item, onClose }) {
  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      // F-16(AC-01): 열린 상태에서 실제로 닫는 경로만 취소음.
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
            className={STORE_SKIN_ZOOM_BACKDROP_CLASS}
            data-sfx-kind="ui-cancel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STORE_SKIN_ZOOM_TRANSITION}
            onClick={onClose}
          />

          <div className={STORE_SKIN_ZOOM_PANEL_WRAP_CLASS} aria-hidden={!open}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`${item.name} 스킨 전신 보기`}
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={STORE_SKIN_ZOOM_TRANSITION}
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
