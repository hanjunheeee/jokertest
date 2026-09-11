import { useCallback, useEffect, useState } from "react"
import { useProfileCustomizationStore } from "../../store/profileCustomization.store.js"
import { useEconomyStore } from "../../../economy/store/economy.store.js"
import {
  DEFAULT_PROFILE_BORDER_ITEM_ID,
  PROFILE_BORDER_ITEM_TYPE,
  PROFILE_EDIT_TAB_PHOTO,
  profileBorderAssetSrcForItemId,
} from "../../constants/profileEditLayout.js"

// F-12(AC-06) 재검토 대응 — ProfileEditOverlay의 실제 편집 로직(계획 메모 실행 순서
// (2)~(3)). 훅으로 뽑은 이유는 ProfileEditOverlay.jsx가 다른 화면(MyPageLayout.jsx, 이
// 슬라이스 범위 밖)에서 ".jsx"로 import되므로 이 파일의 확장자를 바꿀 수 없고, 그러면
// node:test가 JSX 구문을 파싱하지 못해(이 저장소 관례, ForbiddenRecordsUnlockCondition.js
// 참고) 실제 편집 동작을 테스트할 길이 없기 때문이다 — 이 훅 자체가 Overlay가 그대로 쓰는
// 실제 로직이라, 훅을 직접 렌더 테스트하는 것이 곧 실제 컴포넌트 동작을 검증하는 것이다.
export function useProfileBorderEditor({ open, onClose }) {
  const photoSrc = useProfileCustomizationStore((state) => state.photoSrc)
  const applyPhoto = useProfileCustomizationStore((state) => state.applyPhoto)

  const generation = useEconomyStore((state) => state.requestGeneration)
  const economyStatus = useEconomyStore((state) => state.status)
  const entitlements = useEconomyStore((state) => state.entitlements)
  const selectedProfileBorderId = useEconomyStore((state) => state.loadout.selectedProfileBorderId)
  const fetchSummary = useEconomyStore((state) => state.fetchSummary)
  const equip = useEconomyStore((state) => state.equip)

  const currentBorderItemId = selectedProfileBorderId ?? DEFAULT_PROFILE_BORDER_ITEM_ID

  const [activeTab, setActiveTab] = useState(PROFILE_EDIT_TAB_PHOTO)
  const [draftPhoto, setDraftPhoto] = useState(photoSrc)
  const [draftBorderItemId, setDraftBorderItemId] = useState(currentBorderItemId)
  const [confirmStatus, setConfirmStatus] = useState("idle") // idle | saving
  const [confirmError, setConfirmError] = useState(null)

  // 편집기가 열릴 때(또는 그 사이 계정이 바뀌었을 때) 실제 적용 상태로 초안을 되돌린다 —
  // 이전에 열었을 때 남은 미확정 선택이나 이전 계정의 선택이 보이면 안 된다(A-08). 아직
  // 소유 목록을 한 번도 불러오지 못했거나(idle) 이전 시도가 실패했으면(error) 새로
  // 시도한다 — GET은 반복해도 안전하다(A-09).
  useEffect(() => {
    if (!open) return
    setActiveTab(PROFILE_EDIT_TAB_PHOTO)
    setDraftPhoto(useProfileCustomizationStore.getState().photoSrc)
    setDraftBorderItemId(useEconomyStore.getState().loadout.selectedProfileBorderId ?? DEFAULT_PROFILE_BORDER_ITEM_ID)
    setConfirmStatus("idle")
    setConfirmError(null)

    const latestStatus = useEconomyStore.getState().status
    if (latestStatus === "idle" || latestStatus === "error") {
      fetchSummary()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, generation, fetchSummary])

  const ownedBorderOptions = entitlements
    .filter((item) => item.itemType === PROFILE_BORDER_ITEM_TYPE)
    .map((item) => ({ itemId: item.itemId, src: profileBorderAssetSrcForItemId(item.itemId) }))
    .filter((item) => item.src != null)

  const borderListStatus =
    economyStatus === "error" ? "error"
      : economyStatus === "idle" || economyStatus === "loading" ? "loading"
        : ownedBorderOptions.length === 0 ? "empty"
          : "ready"

  // A-11: 확인은 실제 서버 equip의 성공 결과에 따라서만 장착 상태를 반영한다. 실패하면
  // 오류와 초안을 유지하고 편집기를 닫지 않는다(재시도 가능). 무료 사진만 바뀌었으면
  // 테두리를 건드리지 않아 불필요한 equip 요청을 만들지 않는다.
  const handleConfirm = useCallback(async () => {
    if (confirmStatus === "saving") return // 중복 확인 방지

    const borderChanged = draftBorderItemId !== currentBorderItemId
    if (!borderChanged) {
      if (draftPhoto !== photoSrc) applyPhoto(draftPhoto)
      onClose()
      return
    }

    setConfirmStatus("saving")
    setConfirmError(null)
    const startGeneration = useEconomyStore.getState().requestGeneration
    try {
      await equip({ slot: "PROFILE_BORDER", itemId: draftBorderItemId })
      if (useEconomyStore.getState().requestGeneration !== startGeneration) {
        // 대기하는 동안 계정이 바뀌었다 — 이 성공은 더 이상 지금 화면의 것이 아니다(A-08).
        // 지금 계정 기준으로는 아직 아무것도 확정되지 않았으므로 편집기를 닫지 않는다.
        setConfirmStatus("idle")
        return
      }
      if (draftPhoto !== photoSrc) applyPhoto(draftPhoto)
      setConfirmStatus("idle")
      onClose()
    } catch (error) {
      setConfirmStatus("idle")
      setConfirmError(error?.message ?? "테두리 장착에 실패했습니다.")
    }
  }, [confirmStatus, draftBorderItemId, currentBorderItemId, draftPhoto, photoSrc, applyPhoto, equip, onClose])

  return {
    activeTab,
    setActiveTab,
    draftPhoto,
    setDraftPhoto,
    draftBorderItemId,
    setDraftBorderItemId,
    ownedBorderOptions,
    borderListStatus,
    retryLoadBorders: fetchSummary,
    confirmStatus,
    confirmError,
    handleConfirm,
  }
}
