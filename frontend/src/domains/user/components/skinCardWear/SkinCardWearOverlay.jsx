import { AnimatePresence, motion } from "framer-motion"
import { useEffect } from "react"
import {
  SKIN_CARD_WEAR_BACKDROP_CLASS,
  SKIN_CARD_WEAR_PANEL_WRAP_CLASS,
  SKIN_CARD_WEAR_TRANSITION,
} from "../../constants/skinCardWear/skinCardWearLayout.js"
import { useSkinCardWearSelection } from "../../hooks/useSkinCardWearSelection.js"
import { useSkinCardWearStore } from "../../store/skinCardWear.store.js"
import SkinCardWearPanel from "./SkinCardWearPanel.jsx"

export default function SkinCardWearOverlay({ open, onClose }) {
  const appliedSkinsByJob = useSkinCardWearStore((state) => state.skinsByJob)
  const appliedCardFrameId = useSkinCardWearStore((state) => state.cardFrameId)
  const applyLoadout = useSkinCardWearStore((state) => state.applyLoadout)

  const {
    listItems,
    jobTabs,
    activeJobIndex,
    setActiveJobIndex,
    selectedItemId,
    previewMode,
    preview,
    draftSkinsByJob,
    draftCardFrameId,
    selectItem,
    togglePreviewMode,
    resetDraft,
  } = useSkinCardWearSelection({
    initialSkinsByJob: appliedSkinsByJob,
    initialCardFrameId: appliedCardFrameId,
  })

  useEffect(() => {
    if (!open) return undefined

    resetDraft({
      skinsByJob: appliedSkinsByJob,
      cardFrameId: appliedCardFrameId,
    })

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, appliedSkinsByJob, appliedCardFrameId, onClose, resetDraft])

  const handleConfirm = () => {
    applyLoadout({
      skinsByJob: draftSkinsByJob,
      cardFrameId: draftCardFrameId,
    })
    onClose()
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="스킨&카드 착용 닫기"
            className={SKIN_CARD_WEAR_BACKDROP_CLASS}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={SKIN_CARD_WEAR_TRANSITION}
            onClick={onClose}
          />

          <div className={SKIN_CARD_WEAR_PANEL_WRAP_CLASS} aria-hidden={!open}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="스킨&카드 착용"
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={SKIN_CARD_WEAR_TRANSITION}
              onClick={(event) => event.stopPropagation()}
            >
              <SkinCardWearPanel
                listItems={listItems}
                selectedItemId={selectedItemId}
                appliedSkinsByJob={appliedSkinsByJob}
                appliedCardFrameId={appliedCardFrameId}
                onSelectItem={selectItem}
                jobTabs={jobTabs}
                activeJobIndex={activeJobIndex}
                onJobSelect={setActiveJobIndex}
                preview={preview}
                previewMode={previewMode}
                onTogglePreviewMode={togglePreviewMode}
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
