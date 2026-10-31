import { AnimatePresence, motion } from "framer-motion"
import { useEffect } from "react"
import {
  PROFILE_EDIT_BACKDROP_CLASS,
  PROFILE_EDIT_PANEL_WRAP_CLASS,
  PROFILE_EDIT_TRANSITION,
} from "../../constants/profileEditLayout.js"
import { useProfileBorderEditor } from "./useProfileBorderEditor.js"
import ProfileEditPanel from "./ProfileEditPanel.jsx"
import { dispatchUiSfx } from "../../../../shared/hooks/useSfxRuntime.js"

export default function ProfileEditOverlay({ open, onClose }) {
  const {
    activeTab,
    setActiveTab,
    draftPhotoItemId,
    setDraftPhotoItemId,
    draftBorderItemId,
    setDraftBorderItemId,
    ownedPhotoOptions,
    photoListStatus,
    retryLoadPhotos,
    ownedBorderOptions,
    borderListStatus,
    retryLoadBorders,
    confirmStatus,
    confirmError,
    handleConfirm,
  } = useProfileBorderEditor({ open, onClose })

  const handleClose = () => {
    dispatchUiSfx("ui-cancel")
    onClose()
  }

  const handleConfirmWithSfx = () => handleConfirm({ onChanged: () => dispatchUiSfx("ui-confirm") })

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
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="프로필 수정 닫기"
            className={PROFILE_EDIT_BACKDROP_CLASS}
            data-sfx-owner="explicit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={PROFILE_EDIT_TRANSITION}
            onClick={handleClose}
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
                ownedPhotoOptions={ownedPhotoOptions}
                photoListStatus={photoListStatus}
                onRetryLoadPhotos={retryLoadPhotos}
                ownedBorderOptions={ownedBorderOptions}
                borderListStatus={borderListStatus}
                onRetryLoadBorders={retryLoadBorders}
                onSelectPhoto={setDraftPhotoItemId}
                onSelectBorder={setDraftBorderItemId}
                onClose={handleClose}
                onConfirm={handleConfirmWithSfx}
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
