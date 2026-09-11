import { useCallback, useMemo, useRef, useState } from "react"
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
    setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.IDLE)
    setConfirmError(null)
  }, [])

  /**
   * F-14(AC-01/AC-02/AC-05): 바뀐 슬롯만 골라 economy store의 equip()을 순서대로 호출한다.
   * 슬롯별 equip은 각각 독립적인 서버 변경을 일으키므로(A-03) 부분 성공·명시적 거부·전송
   * 불확실을 구분해서 처리한다:
   *  - 명시적 거부(error.code 있음)는 오류로 기록하고 계속 진행한다(다른 슬롯은 그대로
   *    시도해 부분 성공을 허용한다) — 모두 끝난 뒤 하나라도 거부됐으면 전체를 실패로 보고한다.
   *  - 전송 불확실(응답을 받지 못함, code 없음)은 마지막에 fetchSummary로 authoritative
   *    재조정을 하게 한다.
   *  - 계정이 저장 도중 바뀌면(A-04) 어떤 결과도 적용하지 않고 stale로만 보고한다 — 호출부
   *    (Overlay)가 이를 성공도 실패도 아닌 것으로 처리해 새 계정 화면에 영향을 주지 않는다.
   * @param {{ appliedSkinsByJob: Record<string, string>, appliedCardFrameId: string }} applied
   */
  const confirmLoadout = useCallback(async ({ appliedSkinsByJob, appliedCardFrameId }) => {
    if (savingRef.current) return { ok: false, reason: "ALREADY_SAVING" }
    savingRef.current = true
    setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.SAVING)
    setConfirmError(null)

    const userIdAtStart = useAuthStore.getState().user?.uuid ?? null
    const generationAtStart = useEconomyStore.getState().requestGeneration
    const isStale = () =>
      (useAuthStore.getState().user?.uuid ?? null) !== userIdAtStart
      || useEconomyStore.getState().requestGeneration !== generationAtStart

    const changedSlots = []
    for (const { id: jobId } of SKIN_CARD_WEAR_JOB_TABS) {
      const draftSkinId = draftSkinsByJob[jobId]
      if (draftSkinId && draftSkinId !== appliedSkinsByJob?.[jobId]) {
        changedSlots.push({ slot: JOB_ID_TO_SKIN_SLOT[jobId], itemId: draftSkinId })
      }
    }
    if (draftCardFrameId && draftCardFrameId !== appliedCardFrameId) {
      changedSlots.push({ slot: "PLAYER_CARD_FRAME", itemId: draftCardFrameId })
    }

    const finish = (result) => {
      savingRef.current = false
      return result
    }

    if (changedSlots.length === 0) {
      setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.SUCCESS)
      return finish({ ok: true, changed: false })
    }

    let firstRejection = null
    let anyUncertain = false
    for (const { slot, itemId } of changedSlots) {
      if (isStale()) return finish({ ok: false, stale: true })
      try {
        // eslint-disable-next-line no-await-in-loop -- 슬롯별 장착은 각각 독립적인 서버
        // 변경을 일으키므로 순서대로 결과를 확인해야 한다(부분 성공·실패 구분).
        await useEconomyStore.getState().equip({ slot, itemId })
      } catch (error) {
        if (isStale()) return finish({ ok: false, stale: true })
        const confirmedRejection = typeof error?.code === "string" && error.code.length > 0
        if (confirmedRejection) {
          if (!firstRejection) firstRejection = error
        } else {
          anyUncertain = true
        }
      }
    }

    if (isStale()) return finish({ ok: false, stale: true })

    if (anyUncertain || !firstRejection) {
      // 전송 불확실은 authoritative GET으로 재조정해야 하고, 명시적 거부 없이 전부 성공한
      // 경우도 economy store의 equip() 응답에는 selectedSkinsByJob이 없어(economy.store.js
      // 주석 참고) 최신 loadout을 다시 읽어야 한다 — 재조회 결과는 skinCardWear.store.js가
      // economy store 구독으로 자동 반영하므로, 재시도 시 이미 커밋된 슬롯은 diff에서
      // 저절로 빠진다(자기 치유).
      try {
        await useEconomyStore.getState().fetchSummary()
      } catch {
        // fetchSummary는 실패를 store.status/error에만 남기고 던지지 않는다 — 이 catch는
        // 방어적으로만 존재한다.
      }
    }

    if (isStale()) return finish({ ok: false, stale: true })

    if (firstRejection) {
      setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.ERROR)
      setConfirmError(firstRejection.message ?? "장착에 실패했습니다.")
      return finish({ ok: false, error: firstRejection })
    }

    if (anyUncertain) {
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
