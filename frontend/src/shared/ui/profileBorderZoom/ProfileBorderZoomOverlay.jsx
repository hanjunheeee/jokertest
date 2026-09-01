import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import ProfileBorderZoomPanel from "@/shared/ui/profileBorderZoom/ProfileBorderZoomPanel.jsx"
import {
  PROFILE_BORDER_ZOOM_BACKDROP_CLASS,
  PROFILE_BORDER_ZOOM_PANEL_WRAP_CLASS,
  PROFILE_BORDER_ZOOM_TRANSITION,
} from "@/shared/ui/profileBorderZoom/profileBorderZoomLayout.js"

/** 프로필 테두리 클로즈업 — 전역 오버레이 */
export default function ProfileBorderZoomOverlay({ open, item, onClose }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && item ? (
        <>
          <motion.button
            type="button"
            aria-label="프로필 테두리 확대 보기 닫기"
            className={PROFILE_BORDER_ZOOM_BACKDROP_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={PROFILE_BORDER_ZOOM_TRANSITION}
            onClick={onClose}
          />

          <div className={PROFILE_BORDER_ZOOM_PANEL_WRAP_CLASS} aria-hidden={!open}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`${item.label} 프로필 테두리 보기`}
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={PROFILE_BORDER_ZOOM_TRANSITION}
              onClick={(event) => event.stopPropagation()}
            >
              <ProfileBorderZoomPanel item={item} onClose={onClose} />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
