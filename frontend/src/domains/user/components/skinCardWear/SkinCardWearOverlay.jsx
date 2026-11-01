// 스킨·카드 장착 창 (배경 + 대화상자, Esc·배경 누르면 닫힘)
// MyPageLayout·시험이 씀
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

// 열 때마다 적용값으로 초안을 새로 시작, 닫히면 옛 결과가 안 들어오게 lifecycle 번호를 씀
export default function SkinCardWearOverlay({ open, onClose }) {
  // 열고 닫을 때마다 올리는 번호, 고쳤는지 표시, 늘 최신 닫기 함수
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

  // 열림: 초안 다시 시작 → 지갑 받기 → 안 고쳤으면 받은 값으로 초안 한 번 더 맞춤, Esc 닫기 등록
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

  // 닫기: 취소 소리 뒤 닫음
  const handleClose = () => {
    dispatchUiSfx("ui-cancel")
    onCloseRef.current()
  }

  // 적용: 저장 성공하고 그사이 안 닫혔으면 닫음
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
