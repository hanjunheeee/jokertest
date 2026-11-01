// 일괄구매 합계 골드 계산 (가격 미정 상품이 끼었는지도 같이)
// StoreBulkPurchasePanel이 씀
import { isStorePricePending } from "../constants/storeItems.js"

// 가격 미정은 합계에서 빼고 표시만, 숫자가 아닌 가격은 0으로 셈
export function calculateBulkPurchaseTotal(items) {
  let total = 0
  let hasPendingPrice = false

  for (const item of items) {
    if (isStorePricePending(item)) {
      hasPendingPrice = true
      continue
    }

    total += Number.parseInt(item.priceAmount, 10) || 0
  }

  return { total, hasPendingPrice }
}
