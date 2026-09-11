import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useRef } from "react"
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
  const lifecycle = useRef(0)
  const dirty = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const appliedSkinsByJob = useSkinCardWearStore((state) => state.skinsByJob)
  const appliedCardFrameId = useSkinCardWearStore((state) => state.cardFrameId)
  const fetchSummary = useEconomyStore((state) => state.fetchSummary)
  // F-14(AC-03, R-IMPL P1 수정): 열려 있는 동안의 "계정 생명주기" 신호로만 쓴다 — 매
  // fetchSummary/equip 응답마다 바뀌는 loadout 내용과 달리, requestGeneration은 로그인·
  // 로그아웃·계정 전환에서만 바뀐다(economy.store.js reset()). 아래 effect가 이 값에만
  // 반응해야, 열려 있는 도중 서버 loadout이 갱신될 때마다(성공한 슬롯의 반영 등) 아직
  // 저장되지 않은 다른 슬롯의 초안까지 resetDraft로 지워버리는 일이 없다.
  const requestGeneration = useEconomyStore((state) => state.requestGeneration)

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

  // Each opening/account owns its async work; background reads cannot replace edits.
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
      if (event.key === "Escape") onCloseRef.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      lifecycle.current += 1
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open, requestGeneration, resetDraft, fetchSummary])

  // F-14(AC-01/AC-02/AC-05): 로컬 낙관적 반영 없음 — confirmLoadout이 실제로 서버 확정
  // 성공(ok:true)을 보고했을 때만 닫는다. 명시적 거부·전송 불확실은 열린 채로 남아 Panel이
  // confirmStatus/confirmError로 오류·재시도 수단을 보여준다. 저장 도중 계정이 전환된
  // stale 결과는 성공도 실패도 아니므로 그대로 무시한다 — 이미 무효한 이전 계정 컨텍스트라
  // 닫기·오류 표시 어느 쪽도 하지 않는다(그 계정 화면은 auth store 전환으로 별도 정리된다).
  const handleConfirm = async () => {
    const epoch = lifecycle.current
    dirty.current = true
    const result = await confirmLoadout({
      appliedSkinsByJob,
      appliedCardFrameId,
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
                onSelectItem={(item) => { dirty.current = true; selectItem(item) }}
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
