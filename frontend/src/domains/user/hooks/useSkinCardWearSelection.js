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

// F-14(AC-01): frontend job tab id ↔ backend equip 슬롯. backend/service/economy.service.js의
// SLOT_TO_LOADOUT_COLUMN과 1:1 대응한다(백엔드·프론트가 공유 모듈을 쓸 수 없어 문자열을
// 독립적으로 든다 — catalog.js의 다른 문자열 복제 관례와 동일).
const JOB_ID_TO_SKIN_SLOT = Object.freeze({
  noble: "JOB_SKIN_NOBLE",
  clown: "JOB_SKIN_CLOWN",
  guard: "JOB_SKIN_GUARD",
  doctor: "JOB_SKIN_DOCTOR",
  witchHunter: "JOB_SKIN_WITCH_HUNTER",
})

// F-14(AC-02/AC-05, R-IMPL P1 수정): "서버가 명시적으로 거부했다"고 판정하는 근거를
// error.code가 존재하는 임의의 문자열이라는 것만으로 삼지 않는다 — fetch 자체가 실패했을
// 때(네트워크 단절 등)의 원인 객체가 우연히 .code 문자열을 가져도(전송 계층의 에러 코드),
// 그건 서버가 실제로 응답해 거부했다는 증거가 아니다(전송 불확실과 혼동하면 안 된다).
// economy.service.js equipItem이 실제로 던질 수 있는 유한한 코드 집합만 "확정적 거부"로
// 인정한다 — 이 목록 밖의 코드(또는 코드 없음)는 전부 전송 불확실로 취급한다.
const CONFIRMED_EQUIP_REJECTION_CODES = new Set([
  "UNKNOWN_EQUIP_SLOT",
  "INVALID_ITEM_ID",
  "ITEM_TYPE_MISMATCH",
  "ITEM_NOT_OWNED",
])
const isConfirmedEquipRejection = (error) =>
  typeof error?.code === "string" && CONFIRMED_EQUIP_REJECTION_CODES.has(error.code)

// F-14(AC-02, R-IMPL P1 "actual list ownership contract") — 미보유 스킨·카드는 목록에서
// 선택·저장할 수 없어야 한다. 무료 기본품 판정은 backend/service/economy.service.js의
// isFreeJobSkin/FREE_CARD_FRAME_ID와 정확히 같은 두 가지 근거만 인정한다: (1) 기본 스킨
// (item.source === "basic", catalog.js BASIC_SKIN_STEMS로 만들어진 basic-skin-* 9종 — 서버의
// FREE_JOB_SKIN_IDS_BY_SLOT 정확한 allowlist와 1:1 대응), (2) 기본 카드 프레임(player-card-베이스,
// 서버 FREE_CARD_FRAME_ID와 같은 문자열). 그 밖의 모든 프리미엄 스킨·카드는 economy store가
// 서버에서 그대로 받아온 entitlements 목록에 itemId가 있을 때만 소유한 것으로 인정한다 — 접두어
// 추측이나 클라이언트 판단을 추가하지 않는다.
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
  // 전송 불확실(응답을 받지 못함, code 없음) — 서버가 실제로 커밋했는지 알 수 없으므로
  // ERROR(확정 거부)와 구분한다. "성공하지 않았다"는 점에서 SUCCESS와도 다르다(AC-05:
  // 성공을 확정할 수 없으면 완료 토스트를 띄우지 않는다).
  UNCERTAIN: "uncertain",
})

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
  const [confirmStatus, setConfirmStatus] = useState(SKIN_CARD_WEAR_CONFIRM_STATUS.IDLE)
  const [confirmError, setConfirmError] = useState(null)
  // A-06: React state는 배치 처리되어, 확인 버튼을 두 번 연속(같은 틱) 눌러도 첫 호출의
  // setConfirmStatus("saving")이 아직 커밋되지 않았을 수 있다 — ref는 동기적으로 즉시
  // 갱신되므로 이 경합을 실제로 막는다(state만으로는 중복 저장을 막을 수 없다).
  const savingRef = useRef(false)
  const saveGeneration = useRef(0)
  const editedSlots = useRef(new Set())

  // Refresh untouched slots from the server without losing explicit user edits.
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

  // F-14(AC-02): 인증된 서버 소유 목록만 신뢰한다 — economy store가 fetchSummary로 받아온
  // entitlements 외에는 어떤 것도 소유 판정의 근거가 아니다(정적 카탈로그 전체를 그대로
  // 노출하던 이전 버그의 원인).
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
    // F-14(AC-02): 미보유 항목은 선택 자체를 막는다 — 목록/버튼의 disabled 표시는 UI
    // 방어선일 뿐이고, 실제 draft가 바뀌는 유일한 지점인 여기서도 막아야 어떤 경로로
    // onSelect가 호출돼도(합성 이벤트 우회 등) 미보유 항목이 draft에 들어갈 수 없다.
    if (item.owned === false) return
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

  /**
   * F-14(AC-01/AC-02/AC-05, R-IMPL P1 수정): 바뀐 슬롯만 골라 economy store의 equip()을
   * 순서대로 호출한다. 슬롯별 equip은 각각 독립적인 서버 변경을 일으키므로(A-03) 부분
   * 성공·명시적 거부·전송 불확실을 구분해서 처리한다:
   *  - 명시적 거부(isConfirmedEquipRejection이 인정하는 유한한 코드 목록에 있음)는 오류로
   *    기록하고 계속 진행한다(다른 슬롯은 그대로 시도해 부분 성공을 허용한다) — 모두 끝난
   *    뒤 하나라도 거부됐으면 전체를 실패로 보고한다. economy store의 equip()은 성공한
   *    슬롯의 미러(selectedSkinsByJob/selectedCardFrameId)를 응답 즉시 직접 반영하므로,
   *    다른 슬롯이 거부돼도 이미 성공한 슬롯의 화면 값은 stale로 남지 않는다.
   *  - 전송 불확실은 이번 조회가 성공하고 적용된 서버 값으로만 확인한다. 실패하거나
   *    더 최신 쓰기로 폐기된 조회는 캐시 값이 같아도 성공으로 취급하지 않는다.
   *    지연 쓰기의 충돌 방지는 별도 서버 revision CAS와 공용 저장 큐의 책임이다.
   *  - 계정이 저장 도중 바뀌면(A-04) 어떤 결과도 적용하지 않고 stale로만 보고한다 — 호출부
   *    (Overlay)가 이를 성공도 실패도 아닌 것으로 처리해 새 계정 화면에 영향을 주지 않는다.
   * @param {{ appliedSkinsByJob: Record<string, string>, appliedCardFrameId: string }} applied
   */
  const confirmLoadout = useCallback(async ({ appliedSkinsByJob, appliedCardFrameId, isActive = () => true }) => {
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

    let firstRejection = null
    const uncertainSlots = []
    for (const changedSlot of changedSlots) {
      if (isStale()) return finish({ ok: false, stale: true })
      try {
        // eslint-disable-next-line no-await-in-loop -- 슬롯별 장착은 각각 독립적인 서버
        // 변경을 일으키므로 순서대로 결과를 확인해야 한다(부분 성공·실패 구분).
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
        // fetchSummary 자체가 실패했다 — 진짜 값을 확인할 방법이 없으므로 불확실한 채로
        // 남긴다(swallowed 실패를 성공으로 취급하지 않는다).
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
