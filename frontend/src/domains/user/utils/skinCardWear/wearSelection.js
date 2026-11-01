// 스킨·카드 장착 창 첫 선택·보유 여부 계산
// 스킨·카드 장착 선택 훅이 씀
import {
  SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID,
  SKIN_CARD_WEAR_JOB_TABS,
  getDefaultSkinIdForJob,
} from "../../constants/skinCardWear/skinCardWearCatalog.js"

// 그 직업에 고른 스킨, 없으면 기본 스킨, 그것도 없으면 빈 값
export function resolveInitialSkinSelection(skinsByJob, jobId = SKIN_CARD_WEAR_JOB_TABS[0].id) {
  return skinsByJob[jobId] ?? getDefaultSkinIdForJob(jobId) ?? ""
}

// 기본 스킨·기본 카드 틀은 늘 가진 것으로 봄
export const isItemOwned = (item, entitlements) => {
  if (item.itemType === "skin" && item.source === "basic") return true
  if (item.itemType === "card" && item.id === SKIN_CARD_WEAR_DEFAULT_CARD_FRAME_ID) return true
  return entitlements.some((entry) => entry.itemId === item.id)
}
