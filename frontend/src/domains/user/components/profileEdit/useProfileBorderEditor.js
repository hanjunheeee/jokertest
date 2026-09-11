import { useCallback, useEffect, useState } from "react"
import { useEconomyStore } from "../../../economy/store/economy.store.js"
import {
  DEFAULT_PROFILE_BORDER_ITEM_ID,
  DEFAULT_PROFILE_PHOTO_ITEM_ID,
  PROFILE_BORDER_ITEM_TYPE,
  PROFILE_EDIT_TAB_PHOTO,
  profileBorderAssetSrcForItemId,
} from "../../constants/profileEditLayout.js"

// F-13(AC-01/AC-02) 재검토 대응 — ProfileEditOverlay의 실제 편집 로직(계획 메모 실행 순서
// (2)~(3)). 훅으로 뽑은 이유는 ProfileEditOverlay.jsx가 다른 화면(MyPageLayout.jsx, 이
// 슬라이스 범위 밖)에서 ".jsx"로 import되므로 이 파일의 확장자를 바꿀 수 없고, 그러면
// node:test가 JSX 구문을 파싱하지 못해(이 저장소 관례, ForbiddenRecordsUnlockCondition.js
// 참고) 실제 편집 동작을 테스트할 길이 없기 때문이다 — 이 훅 자체가 Overlay가 그대로 쓰는
// 실제 로직이라, 훅을 직접 렌더 테스트하는 것이 곧 실제 컴포넌트 동작을 검증하는 것이다.
//
// F-13 재검토: 사진도 더 이상 프론트 전용 무료 선택이 아니다(F-12 A-11 정책 변경) — 대기방·
// 인게임에 타인에게도 노출하려면(AC-05) 서버가 확정한 값이어야 한다. draftPhotoItemId도
// draftBorderItemId와 완전히 대칭인 itemId 기반 초안이 되고, 확인은 economy store의
// equipProfile(사진·테두리를 하나의 요청으로 함께 확정)만 호출한다 — 이전처럼 사진은
// 로컬에 즉시 반영하고 테두리만 서버에 보내는 비대칭 경로는 없다.
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
  const [confirmStatus, setConfirmStatus] = useState("idle") // idle | saving
  const [confirmError, setConfirmError] = useState(null)

  // 편집기가 열릴 때(또는 그 사이 계정이 바뀌었을 때) 실제 적용 상태로 초안을 되돌린다 —
  // 이전에 열었을 때 남은 미확정 선택이나 이전 계정의 선택이 보이면 안 된다(A-08). 아직
  // 소유 목록을 한 번도 불러오지 못했거나(idle) 이전 시도가 실패했으면(error) 새로
  // 시도한다 — GET은 반복해도 안전하다(A-09).
  useEffect(() => {
    if (!open) return
    setActiveTab(PROFILE_EDIT_TAB_PHOTO)
    const latestLoadout = useEconomyStore.getState().loadout
    setDraftPhotoItemId(latestLoadout.selectedProfilePhotoId ?? DEFAULT_PROFILE_PHOTO_ITEM_ID)
    setDraftBorderItemId(latestLoadout.selectedProfileBorderId ?? DEFAULT_PROFILE_BORDER_ITEM_ID)
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

  // F-13 AC-01/AC-02: 확인은 실제 서버 equipProfile의 성공 결과에 따라서만 장착 상태를
  // 반영한다(economy store가 loadout을 갱신하면 profileCustomization store가 그 값을
  // 거울처럼 반영한다 — 이 훅은 직접 로컬 상태를 건드리지 않는다). 실패하면 오류와 초안을
  // 유지하고 편집기를 닫지 않는다(재시도 가능). 사진·테두리 어느 쪽도 바뀌지 않았으면
  // 불필요한 요청을 만들지 않는다. 바뀐 슬롯만 요청에 실어, 바뀌지 않은 슬롯이 검증
  // 과정에서 실수로 재검증·재저장되지 않게 한다.
  const handleConfirm = useCallback(async () => {
    if (confirmStatus === "saving") return // 중복 확인 방지

    const photoChanged = draftPhotoItemId !== currentPhotoItemId
    const borderChanged = draftBorderItemId !== currentBorderItemId
    if (!photoChanged && !borderChanged) {
      onClose()
      return
    }

    setConfirmStatus("saving")
    setConfirmError(null)
    const startGeneration = useEconomyStore.getState().requestGeneration
    try {
      await equipProfile({
        photoItemId: photoChanged ? draftPhotoItemId : undefined,
        borderItemId: borderChanged ? draftBorderItemId : undefined,
      })
      if (useEconomyStore.getState().requestGeneration !== startGeneration) {
        // 대기하는 동안 계정이 바뀌었다 — 이 성공은 더 이상 지금 화면의 것이 아니다(A-08).
        // 지금 계정 기준으로는 아직 아무것도 확정되지 않았으므로 편집기를 닫지 않는다.
        setConfirmStatus("idle")
        return
      }
      setConfirmStatus("idle")
      onClose()
    } catch (error) {
      // F-13 AC-02 재검토 — economy.store.js의 purchase()와 같은 이유(응답 유실은 서버
      // 상태 재조회로 확정한다): backend/utils/appError.js의 createError는 서버가 실제로
      // 처리해 거부한 응답에만 code를 싣는다. code가 없으면 네트워크 단절 등으로 응답
      // 자체를 받지 못한 것이라 성공/실패를 알 수 없다 — 그런 경우에만 현재 장착 상태를
      // 다시 읽어(fetchSummary) currentPhotoItemId/currentBorderItemId가 추측이 아니라
      // 실제 서버 진실을 반영하게 한다(명시적 거부는 아무 것도 바뀌지 않았으므로 다시
      // 읽을 필요가 없다). fetchSummary 자체의 실패는 이 catch가 이미 다루는 오류를
      // 덮어쓰지 않는다.
      const confirmedRejection = typeof error?.code === "string" && error.code.length > 0
      if (!confirmedRejection) {
        await fetchSummary().catch(() => {})
      }
      if (useEconomyStore.getState().requestGeneration !== startGeneration) {
        setConfirmStatus("idle")
        return
      }
      setConfirmStatus("idle")
      setConfirmError(error?.message ?? "프로필 저장에 실패했습니다.")
    }
  }, [confirmStatus, draftPhotoItemId, currentPhotoItemId, draftBorderItemId, currentBorderItemId, equipProfile, fetchSummary, onClose])

  return {
    activeTab,
    setActiveTab,
    draftPhotoItemId,
    setDraftPhotoItemId,
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
