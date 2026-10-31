import { useCallback, useEffect, useRef, useState } from "react"
import { useEconomyStore } from "../../../economy/store/economy.store.js"
import {
  DEFAULT_PROFILE_BORDER_ITEM_ID,
  DEFAULT_PROFILE_PHOTO_ITEM_ID,
  PROFILE_BORDER_ITEM_TYPE,
  PROFILE_EDIT_TAB_PHOTO,
  PROFILE_PHOTO_ITEM_TYPE,
  profileBorderAssetSrcForItemId,
  profilePhotoAssetSrcForItemId,
} from "../../constants/profileEditLayout.js"

export function useProfileBorderEditor({ open, onClose }) {
  const generation = useEconomyStore((state) => state.requestGeneration)
  const economyStatus = useEconomyStore((state) => state.status)
  const entitlements = useEconomyStore((state) => state.entitlements)
  const selectedProfilePhotoId = useEconomyStore((state) => state.loadout.selectedProfilePhotoId)
  const selectedProfileBorderId = useEconomyStore((state) => state.loadout.selectedProfileBorderId)
  const fetchSummary = useEconomyStore((state) => state.fetchSummary)
  const equipProfile = useEconomyStore((state) => state.equipProfile)

  const currentPhotoItemId = selectedProfilePhotoId ?? DEFAULT_PROFILE_PHOTO_ITEM_ID
  const currentBorderItemId = selectedProfileBorderId ?? DEFAULT_PROFILE_BORDER_ITEM_ID

  const [activeTab, setActiveTab] = useState(PROFILE_EDIT_TAB_PHOTO)
  const [draftPhotoItemId, setDraftPhotoItemId] = useState(currentPhotoItemId)
  const [draftBorderItemId, setDraftBorderItemId] = useState(currentBorderItemId)
  const [confirmStatus, setConfirmStatus] = useState("idle")
  const [confirmError, setConfirmError] = useState(null)
  const [confirmUncertain, setConfirmUncertain] = useState(false)

  const editorSessionRef = useRef(0)
  const pendingSaveRef = useRef(false)
  const hasEditedRef = useRef(false)

  useEffect(() => {
    editorSessionRef.current += 1
    pendingSaveRef.current = false
    if (!open) return
    hasEditedRef.current = false
    setActiveTab(PROFILE_EDIT_TAB_PHOTO)
    const latestLoadout = useEconomyStore.getState().loadout
    setDraftPhotoItemId(latestLoadout.selectedProfilePhotoId ?? DEFAULT_PROFILE_PHOTO_ITEM_ID)
    setDraftBorderItemId(latestLoadout.selectedProfileBorderId ?? DEFAULT_PROFILE_BORDER_ITEM_ID)
    setConfirmStatus("idle")
    setConfirmError(null)
    setConfirmUncertain(false)

    const latestStatus = useEconomyStore.getState().status
    if (latestStatus === "idle" || latestStatus === "error") {
      fetchSummary()
    }
    return () => { editorSessionRef.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, generation, fetchSummary])

  useEffect(() => {
    if (!open || hasEditedRef.current) return
    setDraftPhotoItemId(currentPhotoItemId)
    setDraftBorderItemId(currentBorderItemId)
  }, [open, currentPhotoItemId, currentBorderItemId])

  const setDraftPhotoItemIdTracked = useCallback((itemId) => {
    hasEditedRef.current = true
    setDraftPhotoItemId(itemId)
  }, [])
  const setDraftBorderItemIdTracked = useCallback((itemId) => {
    hasEditedRef.current = true
    setDraftBorderItemId(itemId)
  }, [])

  const ownedBorderOptions = entitlements
    .filter((item) => item.itemType === PROFILE_BORDER_ITEM_TYPE)
    .map((item) => ({ itemId: item.itemId, src: profileBorderAssetSrcForItemId(item.itemId) }))
    .filter((item) => item.src != null)

  const borderListStatus =
    economyStatus === "error" ? "error"
      : economyStatus === "idle" || economyStatus === "loading" ? "loading"
        : ownedBorderOptions.length === 0 ? "empty"
          : "ready"

  const ownedPhotoOptions = entitlements
    .filter((item) => item.itemType === PROFILE_PHOTO_ITEM_TYPE)
    .map((item) => ({ itemId: item.itemId, src: profilePhotoAssetSrcForItemId(item.itemId) }))
    .filter((item) => item.src != null)

  const photoListStatus =
    economyStatus === "error" ? "error"
      : economyStatus === "idle" || economyStatus === "loading" ? "loading"
        : ownedPhotoOptions.length === 0 ? "empty"
          : "ready"

  const handleConfirm = useCallback(async ({ onChanged } = {}) => {
    if (confirmStatus === "saving" || pendingSaveRef.current) return

    const photoChanged = draftPhotoItemId !== currentPhotoItemId
    const borderChanged = draftBorderItemId !== currentBorderItemId
    if (!photoChanged && !borderChanged) {
      onClose()
      return
    }

    pendingSaveRef.current = true
    try { onChanged?.() } catch {}
    setConfirmStatus("saving")
    setConfirmError(null)
    setConfirmUncertain(false)
    const startGeneration = useEconomyStore.getState().requestGeneration
    const startSession = editorSessionRef.current
    const isStale = () =>
      useEconomyStore.getState().requestGeneration !== startGeneration || editorSessionRef.current !== startSession

    try {
      await equipProfile({
        photoItemId: photoChanged ? draftPhotoItemId : undefined,
        borderItemId: borderChanged ? draftBorderItemId : undefined,
      })
      if (isStale()) {
        return
      }
      setConfirmStatus("idle")
      onClose()
    } catch (error) {
      if (isStale()) return
      const confirmedRejection = typeof error?.code === "string" && error.code.length > 0
      let refreshUncertain = false
      if (!confirmedRejection) {
        await fetchSummary()
        if (useEconomyStore.getState().status === "error") refreshUncertain = true
      }
      if (isStale()) {
        return
      }
      setConfirmStatus("idle")
      setConfirmUncertain(refreshUncertain)
      setConfirmError(
        refreshUncertain
          ? "저장 결과를 확인하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해주세요."
          : (error?.message ?? "프로필 저장에 실패했습니다."),
      )
    } finally {
      if (editorSessionRef.current === startSession) pendingSaveRef.current = false
    }
  }, [confirmStatus, draftPhotoItemId, currentPhotoItemId, draftBorderItemId, currentBorderItemId, equipProfile, fetchSummary, onClose])

  return {
    activeTab,
    setActiveTab,
    draftPhotoItemId,
    setDraftPhotoItemId: setDraftPhotoItemIdTracked,
    draftBorderItemId,
    setDraftBorderItemId: setDraftBorderItemIdTracked,
    ownedPhotoOptions,
    photoListStatus,
    retryLoadPhotos: fetchSummary,
    ownedBorderOptions,
    borderListStatus,
    retryLoadBorders: fetchSummary,
    confirmStatus,
    confirmError,
    confirmUncertain,
    handleConfirm,
  }
}
