// 장착 저장 계산 (바뀐 칸 모으기·확정 거절 판단·저장 확인)
// 스킨·카드 장착 저장 훅(hooks/skinCardWear/useWearConfirm.js)이 씀
import { SKIN_CARD_WEAR_JOB_TABS } from "../../constants/skinCardWear/skinCardWearCatalog.js"
import { CONFIRMED_EQUIP_REJECTION_CODES, JOB_ID_TO_SKIN_SLOT } from "../../constants/skinCardWear/skinCardWearConfirm.js"

// 서버가 확실히 거절한 오류인지
export const isConfirmedEquipRejection = (error) =>
  typeof error?.code === "string" && CONFIRMED_EQUIP_REJECTION_CODES.has(error.code)

// 손댄 칸 중 지금 장착값과 다른 것만 보냄 (직업 스킨 먼저, 카드 틀 마지막)
export function collectChangedSlots({ draftSkinsByJob, draftCardFrameId, edited, appliedSkinsByJob, appliedCardFrameId }) {
  const changed = []
  for (const { id: jobId } of SKIN_CARD_WEAR_JOB_TABS) {
    const draftSkinId = draftSkinsByJob[jobId]
    if (edited.has(jobId) && draftSkinId && draftSkinId !== appliedSkinsByJob?.[jobId]) {
      changed.push({ slot: JOB_ID_TO_SKIN_SLOT[jobId], itemId: draftSkinId, jobId })
    }
  }
  if (edited.has("card") && draftCardFrameId && draftCardFrameId !== appliedCardFrameId) {
    changed.push({ slot: "PLAYER_CARD_FRAME", itemId: draftCardFrameId, jobId: null })
  }
  return changed
}

// 다시 받은 장착값에 모르는 칸이 하나라도 안 들어갔으면 아직 모름
export function isStillUncertain(summary, uncertainSlots) {
  const latest = summary?.loadout
  return !summary?.ok || !latest || uncertainSlots.some(({ itemId, jobId }) =>
    (jobId ? latest.selectedSkinsByJob?.[jobId] ?? null : latest.selectedCardFrameId) !== itemId,
  )
}
