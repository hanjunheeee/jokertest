import { isStorePricePending } from "../constants/storeItems.js"

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
