import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"
import {
  PROFILE_EDIT_BACKDROP_CLASS,
  PROFILE_EDIT_PANEL_WRAP_CLASS,
  PROFILE_EDIT_TAB_PHOTO,
  PROFILE_EDIT_TRANSITION,
} from "@/domains/user/constants/profileEditLayout.js"
import { useProfileCustomizationStore } from "@/domains/user/store/profileCustomization.store.js"
import ProfileEditPanel from "./ProfileEditPanel.jsx"

export default function ProfileEditOverlay({ open, onClose }) {
  const appliedPhoto = useProfileCustomizationStore((state) => state.photoSrc)
  const appliedFrame = useProfileCustomizationStore((state) => state.frameSrc)
  const applyCustomization = useProfileCustomizationStore((state) => state.applyCustomization)

  const [activeTab, setActiveTab] = useState(PROFILE_EDIT_TAB_PHOTO)
  const [draftPhoto, setDraftPhoto] = useState(appliedPhoto)
  const [draftFrame, setDraftFrame] = useState(appliedFrame)

  useEffect(() => {
    if (!open) return undefined

    setActiveTab(PROFILE_EDIT_TAB_PHOTO)
    setDraftPhoto(appliedPhoto)
    setDraftFrame(appliedFrame)

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, appliedPhoto, appliedFrame, onClose])

  const handleConfirm = () => {
    applyCustomization({ photoSrc: draftPhoto, frameSrc: draftFrame })
    onClose()
  }

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
                draftPhoto={draftPhoto}
                draftFrame={draftFrame}
                onSelectPhoto={setDraftPhoto}
                onSelectFrame={setDraftFrame}
                onClose={onClose}
                onConfirm={handleConfirm}
              />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
