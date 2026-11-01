// 스킨·카드 장착 창 선택 훅 (목록·미리보기·고르기·탭·초기화)
// 스킨·카드 장착 창(SkinCardWearOverlay.jsx)이 씀, 초안 상태는 skinCardWear/useWearDraft.js, 저장은 skinCardWear/useWearConfirm.js
import { useCallback, useMemo } from "react"
import {
  SKIN_CARD_WEAR_JOB_TABS,
  getDefaultSkinIdForJob,
  getPlayerCardItems,
  getSkinCardWearItemById,
  getSkinItemsForJob,
  resolveSkinCardWearPreview,
} from "../constants/skinCardWear/skinCardWearCatalog.js"
import {
  SKIN_CARD_WEAR_PREVIEW_MODE_CARD,
  SKIN_CARD_WEAR_PREVIEW_MODE_SKIN,
} from "../constants/skinCardWear/skinCardWearLayout.js"
import { SKIN_CARD_WEAR_CONFIRM_STATUS } from "../constants/skinCardWear/skinCardWearConfirm.js"
import { useEconomyStore } from "../../economy/store/economy.store.js"
import { isItemOwned, resolveInitialSkinSelection } from "../utils/skinCardWear/wearSelection.js"
import { useWearDraft } from "./skinCardWear/useWearDraft.js"
import { useWearConfirm } from "./skinCardWear/useWearConfirm.js"

export { SKIN_CARD_WEAR_CONFIRM_STATUS }

// 저장 중에는 고르기·탭·미리보기 전환을 모두 막음
export function useSkinCardWearSelection({ initialSkinsByJob, initialCardFrameId }) {
  const {
    activeJobIndex, setActiveJobIndex,
    selectedItemId, setSelectedItemId,
    previewMode, setPreviewMode,
    draftSkinsByJob, setDraftSkinsByJob,
    draftCardFrameId, setDraftCardFrameId,
    edited,
  } = useWearDraft(initialSkinsByJob, initialCardFrameId)
  const {
    confirmStatus, setConfirmStatus,
    confirmError, setConfirmError,
    savingRef, saveGeneration,
    confirmLoadout,
  } = useWearConfirm(draftSkinsByJob, draftCardFrameId, edited)

  const entitlements = useEconomyStore((state) => state.entitlements)

  const activeJobId = SKIN_CARD_WEAR_JOB_TABS[activeJobIndex]?.id ?? SKIN_CARD_WEAR_JOB_TABS[0].id
  const selectedItem = getSkinCardWearItemById(selectedItemId)

  // 카드 미리보기면 카드 틀 목록, 아니면 지금 직업 스킨 목록에 보유 여부를 붙임
  const listItems = useMemo(() => {
    const rawItems = previewMode === SKIN_CARD_WEAR_PREVIEW_MODE_CARD
      ? getPlayerCardItems()
      : getSkinItemsForJob(activeJobId)

    return rawItems.map((item) => ({ ...item, owned: isItemOwned(item, entitlements) }))
  }, [previewMode, activeJobId, entitlements])

  const preview = useMemo(
    () =>
      resolveSkinCardWearPreview({
        selectedItem,
        activeJobId,
        previewMode,
        draftSkinsByJob,
        draftCardFrameId,
      }),
    [selectedItem, activeJobId, previewMode, draftSkinsByJob, draftCardFrameId],
  )

  // 안 가진 항목은 못 고름, 고른 칸은 손댄 칸으로 기록
  const selectItem = useCallback((item) => {
    if (savingRef.current || item.owned === false) return
    setSelectedItemId(item.id)

    if (item.itemType === "skin" && item.jobId) {
      edited.current.add(item.jobId)
      setDraftSkinsByJob((prev) => ({ ...prev, [item.jobId]: item.id }))
      return
    }

    if (item.itemType === "card") {
      edited.current.add("card")
      setDraftCardFrameId(item.id)
    }
  }, [savingRef, edited, setSelectedItemId, setDraftSkinsByJob, setDraftCardFrameId])

  // 스킨 미리보기 중 탭을 바꾸면 그 직업 초안 스킨을 고른 것으로 보임
  const handleJobSelect = useCallback(
    (index) => {
      if (savingRef.current) return
      setActiveJobIndex(index)

      if (previewMode !== SKIN_CARD_WEAR_PREVIEW_MODE_SKIN) return

      const jobId = SKIN_CARD_WEAR_JOB_TABS[index]?.id
      if (!jobId) return

      const skinId = draftSkinsByJob[jobId] ?? getDefaultSkinIdForJob(jobId)
      if (skinId) setSelectedItemId(skinId)
    },
    [savingRef, setActiveJobIndex, setSelectedItemId, previewMode, draftSkinsByJob],
  )

  // 스킨↔카드 미리보기 전환, 바뀐 쪽의 초안 항목을 고른 것으로 보임
  const togglePreviewMode = useCallback(() => {
    if (savingRef.current) return
    setPreviewMode((prev) => {
      const nextMode =
        prev === SKIN_CARD_WEAR_PREVIEW_MODE_SKIN
          ? SKIN_CARD_WEAR_PREVIEW_MODE_CARD
          : SKIN_CARD_WEAR_PREVIEW_MODE_SKIN

      if (nextMode === SKIN_CARD_WEAR_PREVIEW_MODE_CARD) {
        setSelectedItemId(draftCardFrameId)
      } else {
        setSelectedItemId(resolveInitialSkinSelection(draftSkinsByJob, activeJobId))
      }

      return nextMode
    })
  }, [savingRef, setPreviewMode, setSelectedItemId, draftCardFrameId, draftSkinsByJob, activeJobId])

  // 받은 장착값으로 처음부터 다시 시작, 저장 세대를 올려 진행 중 저장 결과를 버림
  const resetDraft = useCallback(({ skinsByJob, cardFrameId }) => {
    edited.current.clear()
    saveGeneration.current += 1
    savingRef.current = false
    setActiveJobIndex(0)
    setPreviewMode(SKIN_CARD_WEAR_PREVIEW_MODE_SKIN)
    setDraftSkinsByJob(skinsByJob)
    setDraftCardFrameId(cardFrameId)
    setSelectedItemId(resolveInitialSkinSelection(skinsByJob))
    setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.IDLE)
    setConfirmError(null)
  }, [edited, saveGeneration, savingRef, setActiveJobIndex, setPreviewMode, setDraftSkinsByJob, setDraftCardFrameId, setSelectedItemId, setConfirmStatus, setConfirmError])

  return {
    listItems,
    jobTabs: SKIN_CARD_WEAR_JOB_TABS,
    activeJobIndex,
    setActiveJobIndex: handleJobSelect,
    activeJobId,
    selectedItemId,
    selectedItem,
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
  }
}
