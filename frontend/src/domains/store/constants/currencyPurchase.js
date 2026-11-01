// 재화 충전·구매 상수 (자동 확인 간격·주문 형식·주문 상태·확인 실패 코드)
// 충전 API·토스 결제·응답 검사(currencyParse.js)·currency/ 아래 흐름 파일이 씀

// 주문 자동 확인 간격과 주문마다 최대 횟수
export const POLL_MS = 2000
export const MAX_AUTO_CHECKS = 5
// 토스 결제 SDK 주소
export const SDK_URL = "https://js.tosspayments.com/v2/standard"
// 주문 id·결제 키·클라이언트 키 모양 (클라이언트 키는 테스트 키만 받음)
export const ORDER_ID = /^[A-Za-z0-9_-]{6,64}$/
export const PAYMENT_KEY = /^[A-Za-z0-9_=+/.-]{1,200}$/
export const CLIENT_KEY = /^test_ck_[A-Za-z0-9_=+/-]{8,200}$/
// 서버 주문 상태 전체·진행 중으로 보는 상태·진행 중 주문 최대 개수
export const ORDER_STATUSES = ["CREATED", "CONFIRMING", "PENDING_GRANT", "GRANTED", "FAILED", "CANCELED", "EXPIRED"]
export const OPEN_ORDER_STATUSES = ["CONFIRMING", "PENDING_GRANT"]
export const MAX_OPEN_ORDERS = 5
// 상품 종류별 [결제 재화, 지급 재화] 짝
export const KIND_CURRENCIES = { DIAMOND_TOPUP: ["KRW", "DIAMOND"], GOLD_PURCHASE: ["DIAMOND", "GOLD"] }
// 결제 확인 실패로 인정하는 코드와 짝인 HTTP 상태 (나머지 오류는 결과 모름)
export const CONFIRM_FAILURES = {
  AMOUNT_MISMATCH: 400, NOT_OWNER: 403, ORDER_NOT_FOUND: 404, PAYMENT_FAILED: 402, CONFIG_MISSING: 503,
  PAYMENT_KEY_MISMATCH: 409, PAYMENT_KEY_CONFLICT: 409,
}
// 실패로 끝난 주문 상태 → 화면 안내 이유 코드
export const ORDER_FAILURE_REASONS = { FAILED: "ORDER_FAILED", CANCELED: "ORDER_CANCELED", EXPIRED: "ORDER_EXPIRED" }
// 이 화면 상태일 땐 새 충전 시작·다음 주문 보이기를 막음
export const BUSY_STATUSES = ["creatingOrder", "payment", "confirming", "pendingGrant", "unknown"]
