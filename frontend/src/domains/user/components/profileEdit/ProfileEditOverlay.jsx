import { AnimatePresence, motion } from "framer-motion"
import { useEffect } from "react"
import {
  PROFILE_EDIT_BACKDROP_CLASS,
  PROFILE_EDIT_PANEL_WRAP_CLASS,
  PROFILE_EDIT_TRANSITION,
} from "../../constants/profileEditLayout.js"
import { useProfileBorderEditor } from "./useProfileBorderEditor.js"
import ProfileEditPanel from "./ProfileEditPanel.jsx"

export default function ProfileEditOverlay({ open, onClose }) {
  const {
    activeTab,
    setActiveTab,
    draftPhotoItemId,
    setDraftPhotoItemId,
    draftBorderItemId,
    setDraftBorderItemId,
    ownedBorderOptions,
    borderListStatus,
    retryLoadBorders,
    confirmStatus,
    confirmError,
    handleConfirm,
  } = useProfileBorderEditor({ open, onClose })

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
            aria-label="프로필 수정 닫기"
            className={PROFILE_EDIT_BACKDROP_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={PROFILE_EDIT_TRANSITION}
            onClick={onClose}
          />

          <div className={PROFILE_EDIT_PANEL_WRAP_CLASS} aria-hidden={!open}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="프로필 수정"
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={PROFILE_EDIT_TRANSITION}
              onClick={(event) => event.stopPropagation()}
            >
              <ProfileEditPanel
                activeTab={activeTab}
                onTabChange={setActiveTab}
                draftPhotoItemId={draftPhotoItemId}
                draftBorderItemId={draftBorderItemId}
                ownedBorderOptions={ownedBorderOptions}
                borderListStatus={borderListStatus}
                onRetryLoadBorders={retryLoadBorders}
                onSelectPhoto={setDraftPhotoItemId}
                onSelectBorder={setDraftBorderItemId}
                onClose={onClose}
                onConfirm={handleConfirm}
                confirmStatus={confirmStatus}
                confirmError={confirmError}
              />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
