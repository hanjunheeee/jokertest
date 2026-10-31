import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
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
import { useEconomyStore } from "../../economy/store/economy.store.js"
import { useAuthStore } from "../../auth/store/auth.store.js"

function resolveInitialSkinSelection(skinsByJob, jobId = SKIN_CARD_WEAR_JOB_TABS[0].id) {
  return skinsByJob[jobId] ?? getDefaultSkinIdForJob(jobId) ?? ""
}

const JOB_ID_TO_SKIN_SLOT = Object.freeze({
  noble: "JOB_SKIN_NOBLE",
  clown: "JOB_SKIN_CLOWN",
  guard: "JOB_SKIN_GUARD",
  doctor: "JOB_SKIN_DOCTOR",
  witchHunter: "JOB_SKIN_WITCH_HUNTER",
})

const CONFIRMED_EQUIP_REJECTION_CODES = new Set([
  "UNKNOWN_EQUIP_SLOT",
  "INVALID_ITEM_ID",
  "ITEM_TYPE_MISMATCH",
  "ITEM_NOT_OWNED",
  "SKIN_REVISION_CONFLICT",
])
const isConfirmedEquipRejection = (error) =>
  typeof error?.code === "string" && CONFIRMED_EQUIP_REJECTION_CODES.has(error.code)

const isItemOwned = (item, entitlements) => {
  if (item.itemType === "skin" && item.source === "basic") return true
  if (item.itemType === "card" && item.id === SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID) return true
  return entitlements.some((entry) => entry.itemId === item.id)
}

export const SKIN_CARD_WEAR_CONFIRM_STATUS = Object.freeze({
  IDLE: "idle",
  SAVING: "saving",
  SUCCESS: "success",
  ERROR: "error",
  UNCERTAIN: "uncertain",
})

export function useSkinCardWearSelection({ initialSkinsByJob, initialCardFrameId }) {
  const [activeJobIndex, setActiveJobIndex] = useState(0)
  const [selectedItemId, setSelectedItemId] = useState(() =>
    resolveInitialSkinSelection(initialSkinsByJob),
  )
  const [previewMode, setPreviewMode] = useState(SKIN_CARD_WEAR_PREVIEW_MODE_SKIN)
  const [draftSkinsByJob, setDraftSkinsByJob] = useState(initialSkinsByJob)
  const [draftCardFrameId, setDraftCardFrameId] = useState(initialCardFrameId)
  const [confirmStatus, setConfirmStatus] = useState(SKIN_CARD_WEAR_CONFIRM_STATUS.IDLE)
  const [confirmError, setConfirmError] = useState(null)
  const savingRef = useRef(false)
  const saveGeneration = useRef(0)
  const editedSlots = useRef(new Set())

  useEffect(() => {
    setDraftSkinsByJob((previous) => {
      const next = Object.fromEntries(SKIN_CARD_WEAR_JOB_TABS.map(({ id }) =>
        [id, editedSlots.current.has(id) ? previous[id] : initialSkinsByJob[id]]))
      return SKIN_CARD_WEAR_JOB_TABS.every(({ id }) => next[id] === previous[id]) ? previous : next
    })
    if (!editedSlots.current.has("card")) setDraftCardFrameId(initialCardFrameId)
    setSelectedItemId((previous) => {
      const item = getSkinCardWearItemById(previous)
      if (item?.itemType === "skin" && !editedSlots.current.has(item.jobId)) {
        return initialSkinsByJob[item.jobId] ?? getDefaultSkinIdForJob(item.jobId)
      }
      if (item?.itemType === "card" && !editedSlots.current.has("card")) return initialCardFrameId
      return previous
    })
  }, [initialSkinsByJob, initialCardFrameId])

  const entitlements = useEconomyStore((state) => state.entitlements)

  const activeJobId = SKIN_CARD_WEAR_JOB_TABS[activeJobIndex]?.id ?? SKIN_CARD_WEAR_JOB_TABS[0].id
  const selectedItem = getSkinCardWearItemById(selectedItemId)

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

  const selectItem = useCallback((item) => {
    if (savingRef.current || item.owned === false) return
    setSelectedItemId(item.id)

    if (item.itemType === "skin" && item.jobId) {
      editedSlots.current.add(item.jobId)
      setDraftSkinsByJob((prev) => ({ ...prev, [item.jobId]: item.id }))
      return
    }

    if (item.itemType === "card") {
      editedSlots.current.add("card")
      setDraftCardFrameId(item.id)
    }
  }, [])

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
    [previewMode, draftSkinsByJob],
  )

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
  }, [draftCardFrameId, draftSkinsByJob, activeJobId])

  const resetDraft = useCallback(({ skinsByJob, cardFrameId }) => {
    editedSlots.current.clear()
    saveGeneration.current += 1
    savingRef.current = false
    setActiveJobIndex(0)
    setPreviewMode(SKIN_CARD_WEAR_PREVIEW_MODE_SKIN)
    setDraftSkinsByJob(skinsByJob)
    setDraftCardFrameId(cardFrameId)
    setSelectedItemId(resolveInitialSkinSelection(skinsByJob))
    setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.IDLE)
    setConfirmError(null)
  }, [])

  const confirmLoadout = useCallback(async ({ appliedSkinsByJob, appliedCardFrameId, isActive = () => true, onChanged }) => {
    if (savingRef.current) return { ok: false, reason: "ALREADY_SAVING" }
    const saveEpoch = saveGeneration.current
    savingRef.current = true
    setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.SAVING)
    setConfirmError(null)

    const userIdAtStart = useAuthStore.getState().user?.uuid ?? null
    const generationAtStart = useEconomyStore.getState().requestGeneration
    const isStale = () =>
      !isActive() || saveEpoch !== saveGeneration.current ||
      (useAuthStore.getState().user?.uuid ?? null) !== userIdAtStart
      || useEconomyStore.getState().requestGeneration !== generationAtStart

    const changedSlots = []
    for (const { id: jobId } of SKIN_CARD_WEAR_JOB_TABS) {
      const draftSkinId = draftSkinsByJob[jobId]
      if (editedSlots.current.has(jobId) && draftSkinId && draftSkinId !== appliedSkinsByJob?.[jobId]) {
        changedSlots.push({ slot: JOB_ID_TO_SKIN_SLOT[jobId], itemId: draftSkinId, jobId })
      }
    }
    if (editedSlots.current.has("card") && draftCardFrameId && draftCardFrameId !== appliedCardFrameId) {
      changedSlots.push({ slot: "PLAYER_CARD_FRAME", itemId: draftCardFrameId, jobId: null })
    }

    const finish = (result) => {
      if (saveEpoch === saveGeneration.current) savingRef.current = false
      return result
    }

    if (changedSlots.length === 0) {
      setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.SUCCESS)
      return finish({ ok: true, changed: false })
    }

    if (isStale()) return finish({ ok: false, stale: true })
    try { onChanged?.() } catch { /* Audio cannot block the accepted save. */ }

    let firstRejection = null
    const uncertainSlots = []
    for (const changedSlot of changedSlots) {
      if (isStale()) return finish({ ok: false, stale: true })
      try {
        // eslint-disable-next-line no-await-in-loop -- 슬롯별 장착은 각각 독립적인 서버
        await useEconomyStore.getState().equip({ slot: changedSlot.slot, itemId: changedSlot.itemId })
      } catch (error) {
        if (isStale()) return finish({ ok: false, stale: true })
        if (isConfirmedEquipRejection(error)) {
          if (!firstRejection) firstRejection = error
        } else {
          uncertainSlots.push(changedSlot)
        }
      }
    }

    if (isStale()) return finish({ ok: false, stale: true })

    let unresolvedUncertain = uncertainSlots.length > 0
    if (unresolvedUncertain) {
      try {
        const summary = await useEconomyStore.getState().fetchSummary()
        if (isStale()) return finish({ ok: false, stale: true })
        const latestLoadout = summary?.loadout
        unresolvedUncertain = !summary?.ok || !latestLoadout || uncertainSlots.some(({ itemId, jobId }) =>
          (jobId ? latestLoadout.selectedSkinsByJob?.[jobId] ?? null : latestLoadout.selectedCardFrameId) !== itemId,
        )
      } catch {
        unresolvedUncertain = true
      }
    }

    if (isStale()) return finish({ ok: false, stale: true })

    if (firstRejection) {
      setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.ERROR)
      setConfirmError(firstRejection.message ?? "장착에 실패했습니다.")
      return finish({ ok: false, error: firstRejection })
    }

    if (unresolvedUncertain) {
      setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.UNCERTAIN)
      setConfirmError("저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.")
      return finish({ ok: false, uncertain: true })
    }

    setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.SUCCESS)
    return finish({ ok: true, changed: true })
  }, [draftSkinsByJob, draftCardFrameId])

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
