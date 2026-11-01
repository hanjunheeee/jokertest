// 프로필 사진·테두리 편집 창 상태 (열 때 지금 장착으로 초안 맞추기·보유 목록·확인 저장)
// 프로필 편집 창(ProfileEditOverlay)·시험이 씀
import { useCallback, useEffect, useRef, useState } from "react"
import { useEconomyStore } from "../../../economy/store/economy.store.js"
import {
  DEFAULT_PROFILE_BORDER_ITEM_ID,
  DEFAULT_PROFILE_PHOTO_ITEM_ID,
  BORDER_ITEM_TYPE,
  PROFILE_EDIT_TAB_PHOTO,
  PROFILE_PHOTO_ITEM_TYPE,
  borderAssetSrcForItemId,
  photoAssetSrcForItemId,
} from "../../constants/profileEditLayout.js"
import { listStatusOf, ownedOptionsOf } from "../../utils/profileEditOptions.js"

// 지갑 장착값·보유 목록 고르기 + 초안·탭·저장 상태
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

  // 열 때마다 세션을 새로 열고 초안·저장 상태를 지금 장착으로 되돌림, 지갑이 없으면 받음
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
  }, [open, generation, fetchSummary])

  // 사용자가 아직 안 고쳤으면 서버 장착이 바뀔 때 초안도 따라감
  useEffect(() => {
    if (!open || hasEditedRef.current) return
    setDraftPhotoItemId(currentPhotoItemId)
    setDraftBorderItemId(currentBorderItemId)
  }, [open, currentPhotoItemId, currentBorderItemId])

  // 사용자가 고르면 고친 걸로 기록 (서버 장착 따라가기 멈춤)
  const setDraftPhotoItemIdTracked = useCallback((itemId) => {
    hasEditedRef.current = true
    setDraftPhotoItemId(itemId)
  }, [])
  const setDraftBorderItemIdTracked = useCallback((itemId) => {
    hasEditedRef.current = true
    setDraftBorderItemId(itemId)
  }, [])

  // 종류별 보유 목록과 목록 상태
  const ownedBorderOptions = ownedOptionsOf(entitlements, BORDER_ITEM_TYPE, borderAssetSrcForItemId)
  const borderListStatus = listStatusOf(economyStatus, ownedBorderOptions)

  const ownedPhotoOptions = ownedOptionsOf(entitlements, PROFILE_PHOTO_ITEM_TYPE, photoAssetSrcForItemId)
  const photoListStatus = listStatusOf(economyStatus, ownedPhotoOptions)

  // 바뀐 것만 저장, 결과를 모르면 지갑을 다시 받아 실패인지 확인함
  const handleConfirm = useCallback(async ({ onChanged } = {}) => {
    // 이미 저장 중이면 거절
    if (confirmStatus === "saving" || pendingSaveRef.current) return

    const photoChanged = draftPhotoItemId !== currentPhotoItemId
    const borderChanged = draftBorderItemId !== currentBorderItemId
    // 바뀐 게 없으면 저장 없이 닫음
    if (!photoChanged && !borderChanged) {
      onClose()
      return
    }

    pendingSaveRef.current = true
    try { onChanged?.() } catch { /* 알림 콜백 오류는 저장을 막지 않게 무시함 */ }
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
      // 그사이 창이 닫혔거나 지갑 세대가 바뀌었으면 버림
      if (isStale()) {
        return
      }
      setConfirmStatus("idle")
      onClose()
    } catch (error) {
      if (isStale()) return
      // 코드 있는 실패는 확정 거절, 코드 없으면 지갑을 다시 받아 확인
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
      // 이 창 세션일 때만 잠금 풂
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
