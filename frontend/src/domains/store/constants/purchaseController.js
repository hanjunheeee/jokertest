// 가게 구매 상수 (거절로 보는 오류 코드·골드 구매 거절 상태 코드·저장 기록 상태·빈 상태)
// purchaseController.js(구매 흐름)·purchaseRecord.js(저장 기록 검사)가 씀

// 일반 구매에서 서버가 확실히 거절한 코드, 나머지 오류는 결과 모름
export const rejectedCodes = new Set([
  "UNKNOWN_BULK_PURCHASE_FIELD", "UNKNOWN_BULK_PURCHASE_ITEM_FIELD", "INVALID_BULK_PURCHASE_REQUEST",
  "MISSING_REFERENCE_EVENT_ID", "EMPTY_PURCHASE_ITEMS", "INVALID_PURCHASE_ITEM", "DUPLICATE_PURCHASE_ITEM",
  "ITEM_NOT_PURCHASABLE", "INVALID_CURRENCY", "AMOUNT_OUT_OF_RANGE", "ITEM_ALREADY_OWNED",
  "INSUFFICIENT_BALANCE", "BALANCE_LIMIT_EXCEEDED", "REFERENCE_EVENT_CONFLICT",
])
// 골드 구매 거절 코드와 짝인 HTTP 상태, 둘 다 맞아야 거절로 봄
export const goldRejectedStatus = {
  INSUFFICIENT_DIAMOND: 400, BALANCE_LIMIT_EXCEEDED: 400, INVALID_GOLD_PURCHASE_REQUEST: 400,
  UNKNOWN_GOLD_PURCHASE_FIELD: 400, PRODUCT_NOT_FOUND: 404, PRODUCT_STOPPED: 409, REFERENCE_EVENT_CONFLICT: 409,
}
// 저장된 골드 구매 기록이 가질 수 있는 상태
export const goldStatuses = ["pending", "unknown", "confirmed", "rejected", "priceChanged"]
// 구매 안 한 빈 상태
export const idle = { status: "idle", referenceEventId: null, itemIds: [], error: null }
