import { AnimatePresence, motion } from "framer-motion"
import { useEffect } from "react"
import {
  SKIN_CARD_WEAR_BACKDROP_CLASS,
  SKIN_CARD_WEAR_PANEL_WRAP_CLASS,
  SKIN_CARD_WEAR_TRANSITION,
} from "../../constants/skinCardWear/skinCardWearLayout.js"
import { useSkinCardWearSelection } from "../../hooks/useSkinCardWearSelection.js"
import { useSkinCardWearStore } from "../../store/skinCardWear.store.js"
import { useEconomyStore } from "../../../economy/store/economy.store.js"
import SkinCardWearPanel from "./SkinCardWearPanel.jsx"

export default function SkinCardWearOverlay({ open, onClose }) {
  const appliedSkinsByJob = useSkinCardWearStore((state) => state.skinsByJob)
  const appliedCardFrameId = useSkinCardWearStore((state) => state.cardFrameId)
  const fetchSummary = useEconomyStore((state) => state.fetchSummary)

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
    confirmStatus,
    confirmError,
    confirmLoadout,
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
    // F-14(AC-01): 열 때마다 서버 확정값을 다시 조회한다 — 다른 기기·탭에서 바뀐 구매·장착이
    // 있어도 목록·미리보기가 낡은 값으로 열리지 않는다.
    fetchSummary()

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, appliedSkinsByJob, appliedCardFrameId, onClose, resetDraft, fetchSummary])

  // F-14(AC-01/AC-02/AC-05): 로컬 낙관적 반영 없음 — confirmLoadout이 실제로 서버 확정
  // 성공(ok:true)을 보고했을 때만 닫는다. 명시적 거부·전송 불확실은 열린 채로 남아 Panel이
  // confirmStatus/confirmError로 오류·재시도 수단을 보여준다. 저장 도중 계정이 전환된
  // stale 결과는 성공도 실패도 아니므로 그대로 무시한다 — 이미 무효한 이전 계정 컨텍스트라
  // 닫기·오류 표시 어느 쪽도 하지 않는다(그 계정 화면은 auth store 전환으로 별도 정리된다).
  const handleConfirm = async () => {
    const result = await confirmLoadout({
      appliedSkinsByJob,
      appliedCardFrameId,
    })
    if (result.ok) onClose()
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
