// 재화 충전·구매 상수 (자동 확인 간격·주문 형식·주문 상태·확인 실패 코드)
// 충전 API·응답 검사·충전 흐름 스토어가 씀

export const POLL_MS = 2000
export const MAX_AUTO_CHECKS = 5
export const SDK_URL = "https://js.tosspayments.com/v2/standard"
export const ORDER_ID = /^[A-Za-z0-9_-]{6,64}$/
export const PAYMENT_KEY = /^[A-Za-z0-9_=+/.-]{1,200}$/
export const CLIENT_KEY = /^test_ck_[A-Za-z0-9_=+/-]{8,200}$/
export const ORDER_STATUSES = ["CREATED", "CONFIRMING", "PENDING_GRANT", "GRANTED", "FAILED", "CANCELED", "EXPIRED"]
export const OPEN_ORDER_STATUSES = ["CONFIRMING", "PENDING_GRANT"]
export const MAX_OPEN_ORDERS = 5
export const KIND_CURRENCIES = { DIAMOND_TOPUP: ["KRW", "DIAMOND"], GOLD_PURCHASE: ["DIAMOND", "GOLD"] }
export const CONFIRM_FAILURES = {
  AMOUNT_MISMATCH: 400, NOT_OWNER: 403, ORDER_NOT_FOUND: 404, PAYMENT_FAILED: 402, CONFIG_MISSING: 503,
  PAYMENT_KEY_MISMATCH: 409, PAYMENT_KEY_CONFLICT: 409,
}
export const ORDER_FAILURE_REASONS = { FAILED: "ORDER_FAILED", CANCELED: "ORDER_CANCELED", EXPIRED: "ORDER_EXPIRED" }
export const BUSY_STATUSES = ["creatingOrder", "payment", "confirming", "pendingGrant", "unknown"]
