import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef } from "react"
import {
  BACKDROP_CLASS,
  PANEL_WRAP_CLASS,
  WEAR_TRANSITION,
} from "../../constants/skinCardWear/skinCardWearLayout.js"
import { useSkinCardWearSelection } from "../../hooks/useSkinCardWearSelection.js"
import { useSkinCardWearStore } from "../../store/skinCardWear.store.js"
import { useEconomyStore } from "../../../economy/store/economy.store.js"
import SkinCardWearPanel from "./SkinCardWearPanel.jsx"
import { dispatchUiSfx } from "../../../../shared/hooks/useSfxRuntime.js"

export default function SkinCardWearOverlay({ open, onClose }) {
  const lifecycle = useRef(0)
  const dirty = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const appliedSkinsByJob = useSkinCardWearStore((state) => state.skinsByJob)
  const appliedCardFrameId = useSkinCardWearStore((state) => state.cardFrameId)
  const fetchSummary = useEconomyStore((state) => state.fetchSummary)
  const requestGeneration = useEconomyStore((state) => state.requestGeneration)

  const {
    listItems,
    jobTabs,
    activeJobIndex,
    setActiveJobIndex,
    selectedItemId,
    previewMode,
    preview,
    selectItem,
    togglePreviewMode,
    resetDraft,
    confirmStatus,
    confirmError,
    confirmLoadout,
  } = useSkinCardWearSelection({
    initialSkinsByJob: appliedSkinsByJob,
    initialCardFrameId: appliedCardFrameId,
  })

  useEffect(() => {
    const epoch = ++lifecycle.current
    if (!open) return undefined
    dirty.current = false
    resetDraft({
      skinsByJob: useSkinCardWearStore.getState().skinsByJob,
      cardFrameId: useSkinCardWearStore.getState().cardFrameId,
    })
    fetchSummary().then((result) => {
      if (epoch !== lifecycle.current || dirty.current || !result?.ok) return
      resetDraft({
        skinsByJob: useSkinCardWearStore.getState().skinsByJob,
        cardFrameId: useSkinCardWearStore.getState().cardFrameId,
      })
    })
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      dispatchUiSfx("ui-cancel", event)
      onCloseRef.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      lifecycle.current += 1
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open, requestGeneration, resetDraft, fetchSummary])

  const handleClose = () => {
    dispatchUiSfx("ui-cancel")
    onCloseRef.current()
  }

  const handleConfirm = async () => {
    const epoch = lifecycle.current
    dirty.current = true
    const result = await confirmLoadout({
      appliedSkinsByJob,
      appliedCardFrameId,
      onChanged: () => dispatchUiSfx("ui-confirm"),
      isActive: () => epoch === lifecycle.current,
    })
    if (result.ok && epoch === lifecycle.current) onCloseRef.current()
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="스킨&카드 착용 닫기"
            className={BACKDROP_CLASS}
            data-sfx-owner="explicit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={WEAR_TRANSITION}
            onClick={handleClose}
          />

          <div className={PANEL_WRAP_CLASS} aria-hidden={!open}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="스킨&카드 착용"
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={WEAR_TRANSITION}
              onClick={(event) => event.stopPropagation()}
            >
              <SkinCardWearPanel
                listItems={listItems}
                selectedItemId={selectedItemId}
                appliedSkinsByJob={appliedSkinsByJob}
                appliedCardFrameId={appliedCardFrameId}
                onSelectItem={(item) => { dirty.current = true; selectItem(item) }}
                jobTabs={jobTabs}
                activeJobIndex={activeJobIndex}
                onJobSelect={setActiveJobIndex}
                preview={preview}
                previewMode={previewMode}
                onTogglePreviewMode={togglePreviewMode}
                onClose={handleClose}
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
