import { useCallback, useEffect, useRef, useState } from "react"
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
  // F-13 AC-02 재검토(CODEX-1): 응답 유실 뒤 재조회(fetchSummary)마저 실패하면 "지금 상태를
  // 확인할 수 없다"는 사실 자체가 단순 네트워크 오류와 구분되어야 한다 — 조용히 원래 오류
  // 메시지만 보여주고 넘어가면(이전 버전처럼 .catch(() => {})로 삼키면) 사용자는 실제로
  // 저장됐는지 여부를 영영 알 길이 없는데도 평범한 실패처럼 보인다.
  const [confirmUncertain, setConfirmUncertain] = useState(false)

  // F-13 AC-02 재검토(CODEX-1): 계정 세대(requestGeneration)만으로는 "같은 계정 안에서
  // 편집기를 취소하고 다시 연" 경우를 구분하지 못한다 — 그 사이 이전 확인 요청이 뒤늦게
  // 성공 응답을 받으면, 이미 닫혔다 다시 열린(초안이 리셋된) 새 세션을 실수로 대신 닫아버릴
  // 수 있다. 편집기가 실제로 "열릴 때"마다(계정 전환으로 인한 재오픈 포함) 세션 id를 새로
  // 발급해, 비동기 응답이 도착했을 때 지금도 같은 세션인지 계정 세대와 별도로 확인한다.
  const editorSessionRef = useRef(0)
  // F-13 AC-04 재검토(CORRECTION): 편집기가 열리는 바로 그 순간의 store.loadout은 계정
  // 전환 직후(reset() 직후)라면 아직 서버 조회가 끝나지 않은 빈/기본값일 수 있다 — 아래
  // 세션 효과가 그 순간의 값으로 초안을 고정해버리면, 실제 fetchSummary가 나중에 성공해도
  // 초안은 갱신되지 않아 새 계정의 실제 장착값이 아니라 기본값에 멈춰 있게 된다. 사용자가
  // 이 세션에서 아직 직접 선택을 바꾸지 않았을 때만, 조회가 실제로 끝나 값이 바뀌면 초안을
  // 그 값으로 다시 맞춘다 — 사용자가 이미 무언가 고른 뒤에는 절대 덮어쓰지 않는다(A-08).
  const hasEditedRef = useRef(false)

  // 편집기가 열릴 때(또는 그 사이 계정이 바뀌었을 때) 실제 적용 상태로 초안을 되돌린다 —
  // 이전에 열었을 때 남은 미확정 선택이나 이전 계정의 선택이 보이면 안 된다(A-08). 아직
  // 소유 목록을 한 번도 불러오지 못했거나(idle) 이전 시도가 실패했으면(error) 새로
  // 시도한다 — GET은 반복해도 안전하다(A-09).
  useEffect(() => {
    editorSessionRef.current += 1
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

  // F-13 AC-04 재검토(CORRECTION): 위 세션 효과가 세팅한 초안이 조회 시점의 스냅샷일
  // 뿐이었다면(계정 전환 직후처럼), 실제 조회가 끝나 currentPhotoItemId/currentBorderItemId가
  // 뒤늦게 바뀔 때 이 효과가 초안을 그 실제 값으로 다시 맞춘다. 사용자가 이미 이 세션에서
  // 선택을 바꿨다면(hasEditedRef) 건드리지 않는다.
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
    setConfirmUncertain(false)
    const startGeneration = useEconomyStore.getState().requestGeneration
    const startSession = editorSessionRef.current
    // 계정 세대(A-08)뿐 아니라 이 편집기 세션 자체가 그 사이 닫혔다 다시 열렸는지도 함께
    // 확인한다 — 둘 중 하나라도 바뀌었으면 이 응답은 더 이상 지금 보고 있는 화면의 것이
    // 아니다.
    const isStale = () =>
      useEconomyStore.getState().requestGeneration !== startGeneration || editorSessionRef.current !== startSession

    try {
      await equipProfile({
        photoItemId: photoChanged ? draftPhotoItemId : undefined,
        borderItemId: borderChanged ? draftBorderItemId : undefined,
      })
      if (isStale()) {
        // 대기하는 동안 계정이 바뀌었거나 편집기를 닫았다 다시 열었다 — 이 성공은 더 이상
        // 지금 세션의 것이 아니다(A-08). 지금 세션 기준으로는 아직 아무것도 확정되지
        // 않았으므로 편집기를 닫지 않는다.
        return
      }
      setConfirmStatus("idle")
      onClose()
    } catch (error) {
      if (isStale()) return // 이전 세션의 응답은 현재 화면이나 재조회를 변경하지 않는다.
      // F-13 AC-02 재검토 — economy.store.js의 purchase()와 같은 이유(응답 유실은 서버
      // 상태 재조회로 확정한다): backend/utils/appError.js의 createError는 서버가 실제로
      // 처리해 거부한 응답에만 code를 싣는다. code가 없으면 네트워크 단절 등으로 응답
      // 자체를 받지 못한 것이라 성공/실패를 알 수 없다 — 그런 경우에만 현재 장착 상태를
      // 다시 읽어(fetchSummary) currentPhotoItemId/currentBorderItemId가 추측이 아니라
      // 실제 서버 진실을 반영하게 한다(명시적 거부는 아무 것도 바뀌지 않았으므로 다시
      // 읽을 필요가 없다).
      //
      // CODEX-1 재검토: 이전 버전은 이 재조회 자체가 실패해도 .catch(() => {})로 조용히
      // 삼켜, "저장도 실패했고 지금 실제 상태를 확인하는 것도 실패했다"는 이중 불확실
      // 상태가 평범한 저장 실패와 똑같이 보였다. fetchSummary는 자체적으로 실패를
      // 삼키고 상태를 "error"로 남기므로(economy.store.js), 그 상태를 직접 확인해 구분되는
      // confirmUncertain 신호와 메시지로 드러낸다.
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
    }
  }, [confirmStatus, draftPhotoItemId, currentPhotoItemId, draftBorderItemId, currentBorderItemId, equipProfile, fetchSummary, onClose])

  return {
    activeTab,
    setActiveTab,
    draftPhotoItemId,
    setDraftPhotoItemId: setDraftPhotoItemIdTracked,
    draftBorderItemId,
    setDraftBorderItemId: setDraftBorderItemIdTracked,
    ownedBorderOptions,
    borderListStatus,
    retryLoadBorders: fetchSummary,
    confirmStatus,
    confirmError,
    confirmUncertain,
    handleConfirm,
  }
}
