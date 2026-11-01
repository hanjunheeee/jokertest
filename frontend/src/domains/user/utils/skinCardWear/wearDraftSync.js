// 서버 장착값이 새로 오면 손대지 않은 칸만 따라가게 하는 계산
// 스킨·카드 장착 초안 훅(hooks/skinCardWear/useWearDraft.js)이 씀
import { SKIN_CARD_WEAR_JOB_TABS, getDefaultSkinIdForJob, getSkinCardWearItemById } from "../../constants/skinCardWear/skinCardWearCatalog.js"

// 고친 직업은 초안 유지, 나머지는 서버 값, 바뀐 게 없으면 이전 객체 그대로 돌려 다시 그리기 막기
export function syncDraftSkins(previous, initialSkinsByJob, edited) {
  const next = Object.fromEntries(SKIN_CARD_WEAR_JOB_TABS.map(({ id }) =>
    [id, edited.has(id) ? previous[id] : initialSkinsByJob[id]]))
  return SKIN_CARD_WEAR_JOB_TABS.every(({ id }) => next[id] === previous[id]) ? previous : next
}

// 고르고 있던 항목이 안 고친 칸이면 서버 값으로 바꿈
export function syncSelectedId(previous, initialSkinsByJob, initialCardFrameId, edited) {
  const item = getSkinCardWearItemById(previous)
  if (item?.itemType === "skin" && !edited.has(item.jobId)) {
    return initialSkinsByJob[item.jobId] ?? getDefaultSkinIdForJob(item.jobId)
  }
  if (item?.itemType === "card" && !edited.has("card")) return initialCardFrameId
  return previous
}
