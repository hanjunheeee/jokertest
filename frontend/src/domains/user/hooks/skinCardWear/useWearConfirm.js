// 스킨·카드 장착 저장 (칸별 장착 요청·결과 확인·저장 상태)
// 스킨·카드 장착 선택 훅이 씀, 저장 중 잠금(savingRef)과 저장 세대(saveGeneration)도 여기서 둠
import { useCallback, useRef, useState } from "react"

import { useEconomyStore } from "../../../economy/store/economy.store.js"
import { useAuthStore } from "../../../auth/store/auth.store.js"
import { SKIN_CARD_WEAR_CONFIRM_STATUS } from "../../constants/skinCardWear/skinCardWearConfirm.js"
import { collectChangedSlots, isConfirmedEquipRejection, isStillUncertain } from "../../utils/skinCardWear/wearSave.js"

// 초안 장착값과 손댄 칸 기록을 받아 저장 함수를 만듦
export function useWearConfirm(draftSkinsByJob, draftCardFrameId, edited) {
  const [confirmStatus, setConfirmStatus] = useState(SKIN_CARD_WEAR_CONFIRM_STATUS.IDLE)
  const [confirmError, setConfirmError] = useState(null)
  const savingRef = useRef(false)
  const saveGeneration = useRef(0)

  const confirmLoadout = useCallback(async ({ appliedSkinsByJob, appliedCardFrameId, isActive = () => true, onChanged }) => {
    // 이미 저장 중이면 거절
    if (savingRef.current) return { ok: false, reason: "ALREADY_SAVING" }
    const saveEpoch = saveGeneration.current
    savingRef.current = true
    setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.SAVING)
    setConfirmError(null)

    // 창이 닫혔거나·초기화됐거나·계정·지갑 세대가 바뀌면 결과를 버림
    const userIdAtStart = useAuthStore.getState().user?.uuid ?? null
    const generationAtStart = useEconomyStore.getState().requestGeneration
    const isStale = () =>
      !isActive() || saveEpoch !== saveGeneration.current ||
      (useAuthStore.getState().user?.uuid ?? null) !== userIdAtStart
      || useEconomyStore.getState().requestGeneration !== generationAtStart

    const changedSlots = collectChangedSlots({
      draftSkinsByJob, draftCardFrameId, edited: edited.current, appliedSkinsByJob, appliedCardFrameId,
    })

    // 그사이 초기화됐으면 잠금은 새 세대 몫이라 풀지 않음
    const finish = (result) => {
      if (saveEpoch === saveGeneration.current) savingRef.current = false
      return result
    }

    // 바뀐 칸이 없으면 바로 성공
    if (changedSlots.length === 0) {
      setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.SUCCESS)
      return finish({ ok: true, changed: false })
    }

    if (isStale()) return finish({ ok: false, stale: true })
    // 바뀐 칸이 있을 때만 알림 콜백(확인 소리)
    try { onChanged?.() } catch { /* 알림 콜백 오류는 저장을 막지 않게 무시함 */ }

    // 칸마다 차례로 보냄: 확정 거절은 첫 것만 남기고, 나머지 오류는 결과 모름으로 모음
    let firstRejection = null
    const uncertainSlots = []
    for (const changedSlot of changedSlots) {
      if (isStale()) return finish({ ok: false, stale: true })
      try {
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

    // 결과 모르는 칸이 있으면 지갑 요약을 다시 받아 실제 장착값으로 확인
    let unresolvedUncertain = uncertainSlots.length > 0
    if (unresolvedUncertain) {
      try {
        const summary = await useEconomyStore.getState().fetchSummary()
        if (isStale()) return finish({ ok: false, stale: true })
        unresolvedUncertain = isStillUncertain(summary, uncertainSlots)
      } catch {
        unresolvedUncertain = true
      }
    }

    if (isStale()) return finish({ ok: false, stale: true })

    // 확정 거절이 하나라도 있으면 실패
    if (firstRejection) {
      setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.ERROR)
      setConfirmError(firstRejection.message ?? "장착에 실패했습니다.")
      return finish({ ok: false, error: firstRejection })
    }

    // 결과 모르는 칸이 남으면 모름
    if (unresolvedUncertain) {
      setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.UNCERTAIN)
      setConfirmError("저장 결과를 확인하지 못했습니다. 다시 시도해 주세요.")
      return finish({ ok: false, uncertain: true })
    }

    // 모두 성공
    setConfirmStatus(SKIN_CARD_WEAR_CONFIRM_STATUS.SUCCESS)
    return finish({ ok: true, changed: true })
  }, [draftSkinsByJob, draftCardFrameId, edited])

  return { confirmStatus, setConfirmStatus, confirmError, setConfirmError, savingRef, saveGeneration, confirmLoadout }
}
