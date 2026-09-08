import { useCallback, useMemo, useState } from "react"
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

function resolveInitialSkinSelection(skinsByJob, jobId = SKIN_CARD_WEAR_JOB_TABS[0].id) {
  return skinsByJob[jobId] ?? getDefaultSkinIdForJob(jobId) ?? ""
}

/**
 * @param {Object} params
 * @param {Record<string, string>} params.initialSkinsByJob
 * @param {string} params.initialCardFrameId
 */
export function useSkinCardWearSelection({ initialSkinsByJob, initialCardFrameId }) {
  const [activeJobIndex, setActiveJobIndex] = useState(0)
  const [selectedItemId, setSelectedItemId] = useState(() =>
    resolveInitialSkinSelection(initialSkinsByJob),
  )
  const [previewMode, setPreviewMode] = useState(SKIN_CARD_WEAR_PREVIEW_MODE_SKIN)
  const [draftSkinsByJob, setDraftSkinsByJob] = useState(initialSkinsByJob)
  const [draftCardFrameId, setDraftCardFrameId] = useState(initialCardFrameId)

  const activeJobId = SKIN_CARD_WEAR_JOB_TABS[activeJobIndex]?.id ?? SKIN_CARD_WEAR_JOB_TABS[0].id
  const selectedItem = getSkinCardWearItemById(selectedItemId)

  const listItems = useMemo(() => {
    if (previewMode === SKIN_CARD_WEAR_PREVIEW_MODE_CARD) {
      return getPlayerCardItems()
    }

    return getSkinItemsForJob(activeJobId)
  }, [previewMode, activeJobId])

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

  const selectItem = useCallback((item) => {
    setSelectedItemId(item.id)

    if (item.itemType === "skin" && item.jobId) {
      setDraftSkinsByJob((prev) => ({ ...prev, [item.jobId]: item.id }))
      return
    }

    if (item.itemType === "card") {
      setDraftCardFrameId(item.id)
    }
  }, [])

  const handleJobSelect = useCallback(
    (index) => {
      setActiveJobIndex(index)

      if (previewMode !== SKIN_CARD_WEAR_PREVIEW_MODE_SKIN) return

      const jobId = SKIN_CARD_WEAR_JOB_TABS[index]?.id
      if (!jobId) return

      const skinId = draftSkinsByJob[jobId] ?? getDefaultSkinIdForJob(jobId)
      if (skinId) setSelectedItemId(skinId)
    },
    [previewMode, draftSkinsByJob],
  )

  const togglePreviewMode = useCallback(() => {
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
  }, [draftCardFrameId, draftSkinsByJob, activeJobId])

  const resetDraft = useCallback(({ skinsByJob, cardFrameId }) => {
    setActiveJobIndex(0)
    setPreviewMode(SKIN_CARD_WEAR_PREVIEW_MODE_SKIN)
    setDraftSkinsByJob(skinsByJob)
    setDraftCardFrameId(cardFrameId)
    setSelectedItemId(resolveInitialSkinSelection(skinsByJob))
  }, [])

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
  }
}
