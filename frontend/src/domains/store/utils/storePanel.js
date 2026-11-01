// 가게 패널 구매 버튼 판정 (살 수 있는 분류인지·버튼 잠금·기본 지급 문구)
// 가게 패널과 패널 훅이 씀
import { isDefaultGrantStoreItem } from "../constants/storeItems.js"

// 인게임 재화는 충전 흐름으로 사서 일반 구매·일괄구매에서 뺌
const NON_PURCHASABLE_CATEGORIES = new Set(["인게임 재화"])

export const isRealPurchaseCategory = (category) => !NON_PURCHASABLE_CATEGORIES.has(category)

// 기본 지급 아이템은 아직 안 받았을 때만 '기본 지급' 문구를 보임
export function purchaseLabelOf(currentItem, ownedItemIds) {
  if (isDefaultGrantStoreItem(currentItem) && !ownedItemIds.has(currentItem?.id)) return "기본 지급"
  return null
}

// 구매 중·지갑 미준비·일괄구매 빈 선택·못 사는 분류·보유·기본 지급이면 잠금
export function isPurchaseDisabled({ currentItem, bulkMode, bulkSelectedIds, ownedItemIds, purchaseLocked, economyStatus }) {
  return purchaseLocked || economyStatus !== "ready"
    || (bulkMode && bulkSelectedIds.size === 0)
    || (!isRealPurchaseCategory(currentItem.category))
    || (!bulkMode && ownedItemIds.has(currentItem.id))
    || (!bulkMode && isDefaultGrantStoreItem(currentItem))
}
