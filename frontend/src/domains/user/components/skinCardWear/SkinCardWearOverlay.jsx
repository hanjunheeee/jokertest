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

  // F-14(AC-01/AC-03, R-IMPL P1 수정): 열림·계정 전환 생명주기의 조회/초기화를 서버
  // loadout 갱신 자체와 분리한다 — 이 effect는 open 또는 requestGeneration이 바뀔 때만
  // 실행되고, resetDraft·fetchSummary는 그때 정확히 한 번(+fetch 완료 시 authoritative
  // 값으로 한 번 더)만 수행한다. appliedSkinsByJob/appliedCardFrameId는 더 이상 의존성이
  // 아니다 — 이전에는 이 값들이 바뀔 때마다(매 fetchSummary 응답이 만드는 새 객체 참조
  // 포함) effect가 재실행되어 GET→resetDraft가 무한 반복되고, 부분 성공 뒤 아직 저장되지
  // 않은 다른 슬롯의 초안까지 지워졌다.
  useEffect(() => {
    if (!open) return undefined

    let cancelled = false

    // 마지막으로 알려진 applied 값으로 즉시 초기화해 첫 프레임부터 빈 화면이 뜨지 않게 한다.
    resetDraft({
      skinsByJob: useSkinCardWearStore.getState().skinsByJob,
      cardFrameId: useSkinCardWearStore.getState().cardFrameId,
    })

    // 열 때마다 서버 확정값을 다시 조회한다 — 다른 기기·탭에서 바뀐 구매·장착이 있어도
    // 목록·미리보기가 낡은 값으로 열리지 않는다. 조회가 끝난 뒤 딱 한 번 더
    // authoritative 값으로 초안을 맞춘다(그 사이 사용자가 편집을 시작했다면 이 open 시점
    // 기준으로는 최신 서버 값을 우선한다 — 열자마자의 일회성 동기화이지, 편집 중 반복
    // 동기화가 아니다).
    fetchSummary().then(() => {
      if (cancelled) return
      resetDraft({
        skinsByJob: useSkinCardWearStore.getState().skinsByJob,
        cardFrameId: useSkinCardWearStore.getState().cardFrameId,
      })
    })

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      cancelled = true
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open, requestGeneration, onClose, resetDraft, fetchSummary])

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
