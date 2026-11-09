// 재화 상품 화면 판단 (목록 합치기·버튼 글자·버튼 잠금·충전/골드 안내 내용), 화면 없이 값만 계산
// hooks/useCurrencyStore.js와 데스크톱·모바일 재화 안내 칸이 씀
import { BUSY_STATUSES, MAX_AUTO_CHECKS } from "../constants/currencyPurchase.js"
import {
  GOLD_MESSAGES, GOLD_PRODUCT_GONE, TOPUP_AUTO_CHECK_DONE, TOPUP_CONFIG_PENDING, TOPUP_FAILED_DEFAULT,
  TOPUP_FAILURE_MESSAGES, TOPUP_LOOKUP_FAILED, TOPUP_MESSAGES,
} from "../constants/currencyMessages.js"

// 재화 분류 이름 (정적 자리표시 대신 서버 상품으로 채움)
export const CURRENCY_CATEGORY = "인게임 재화"

// 분류에 보일 상품: 재화 분류면 서버 상품만, 전체면 정적 상품 뒤에 서버 상품, 다른 분류면 정적만
// 예) ("인게임 재화", [스킨…], [다이아10]) → [다이아10] / (null, [스킨A], [다이아10]) → [스킨A, 다이아10]
export const mergeCurrencyItems = (activeCategory, staticItems, currencyItems) => {
  const withoutPlaceholders = staticItems.filter((item) => item.category !== CURRENCY_CATEGORY)
  if (activeCategory === CURRENCY_CATEGORY) return currencyItems
  return activeCategory === null ? [...withoutPlaceholders, ...currencyItems] : withoutPlaceholders
}

// 재화 상품 구매를 막을지 (목록 준비 안 됨·바뀐 상품·설정 대기, 충전은 다른 충전이 도는 중이어도 막음)
export const isCurrencyBlocked = (currency, kind) => currency.productsStatus !== "ready" || currency.productsStale
  || currency.configPending || (kind === "DIAMOND_TOPUP" && BUSY_STATUSES.includes(currency.status))

// 충전 버튼 글자 (상태 순서대로 먼저 맞는 것)
const topupLabelOf = (currency) => {
  if (currency.configPending) return "설정 대기"
  if (currency.productsStatus === "loading") return "목록 확인 중"
  const byStatus = {
    creatingOrder: "주문 생성 중", payment: "결제창 이동 중", confirming: "확인 중", pendingGrant: "지급 대기", unknown: "결과 확인 필요",
  }
  return byStatus[currency.status] ?? "충전"
}

// 골드 구매 버튼 글자
const goldLabelOf = (currency, purchaseState) => {
  if (purchaseState.kind === "GOLD" && purchaseState.status === "pending") return "처리 중"
  if (purchaseState.kind === "GOLD" && purchaseState.status === "priceChanged") return "가격 재확인 필요"
  if (currency.productsStatus === "loading") return "목록 확인 중"
  return "골드 구매"
}

// 재화 상품 버튼 글자, 재화 상품 아니면 null
export const currencyPurchaseLabel = ({ kind, currency, purchaseState }) => {
  if (kind === "DIAMOND_TOPUP") return topupLabelOf(currency)
  if (kind === "GOLD_PURCHASE") return goldLabelOf(currency, purchaseState)
  return null
}

// 충전 안내 칸 내용, 보일 게 없으면 null
// 예) { status: "failed", reason: "AMOUNT_MISMATCH" } → { message: "결제 금액이 주문과 달라…", notes: [], canCheck: false }
export const topupFeedbackOf = (currency) => {
  const { status, reason, configPending, autoChecks, lookupFailed } = currency
  if (status === "idle" && !configPending) return null
  let message = TOPUP_MESSAGES[status] ?? null
  if (configPending) message = TOPUP_CONFIG_PENDING
  else if (status === "failed") message = TOPUP_FAILURE_MESSAGES[reason] ?? TOPUP_FAILED_DEFAULT
  if (!message) return null
  // 지급 대기·결과 모름이면 결과 확인 버튼과 덧붙임 문구
  const canCheck = !configPending && (status === "unknown" || status === "pendingGrant")
  const notes = []
  if (canCheck && lookupFailed) notes.push(TOPUP_LOOKUP_FAILED)
  if (canCheck && autoChecks >= MAX_AUTO_CHECKS) notes.push(TOPUP_AUTO_CHECK_DONE)
  return { message, notes, canCheck }
}

// 골드 구매 안내 칸 내용, 골드 구매 기록이 아니거나 보일 게 없으면 null
// 예) { kind: "GOLD", status: "rejected", code: "INSUFFICIENT_DIAMOND" } → 부족 문구 + 충전하러 가기 버튼
export const goldFeedbackOf = (state, product = null) => {
  if (state.kind !== "GOLD" || (state.status === "idle" && !state.error)) return null
  const insufficient = state.status === "rejected" && state.code === "INSUFFICIENT_DIAMOND"
  const message = insufficient ? GOLD_MESSAGES.insufficient : GOLD_MESSAGES[state.status] ?? null
  // 가격 바뀜이면 새 조건 한 줄, 다른 실패 이유는 서버 문구 그대로
  let detail = null
  if (state.status === "priceChanged") {
    detail = product
      ? `새 조건: ${product.payAmount} 다이아 → 골드 ${product.grantAmount}${product.bonusAmount > 0 ? ` + 보너스 ${product.bonusAmount}` : ""}`
      : GOLD_PRODUCT_GONE
  } else if (state.error && !insufficient && state.error !== message) {
    detail = state.error
  }
  return {
    message,
    detail,
    canCheck: state.status === "unknown",
    canRetry: state.status === "unknown",
    canAcceptPrice: state.status === "priceChanged",
    canGoTopup: insufficient,
  }
}

// 거래 내역 한 줄 글자 (이유·재화 이름, 시각, +붙인 수량)
// 예) ("DIAMOND_TOPUP") → "다이아 충전" / (110) → "+110" / (-10) → "-10"
// 이유 코드는 서버 장부에 쓰는 것 전부 (economy·ops/coupon·관리자 지급 표 REWARD_CATALOG), 모르는 코드는 "기타"
const HISTORY_REASONS = {
  DIAMOND_TOPUP: "다이아 충전", GOLD_PURCHASE: "골드 구매", PURCHASE: "상점 구매", DEFAULT_GRANT: "기본 지급", ACHIEVEMENT_REWARD: "업적 보상",
  COUPON_REWARD: "쿠폰 보상", REWARD: "보상",
  QA_TEST_GRANT_GOLD: "시험 지급", QA_TEST_GRANT_DIAMOND: "시험 지급", EVENT_COMPENSATION_GOLD: "이벤트 보상",
  ADMIN_GRANT: "운영팀 지급", ADMIN_REVOKE: "운영팀 회수", TOPUP_REFUND: "충전 환불",
}
const HISTORY_CURRENCIES = { DIAMOND: "다이아", GOLD: "골드" }
export const historyReasonLabel = (reason) =>
  Object.prototype.hasOwnProperty.call(HISTORY_REASONS, reason) ? HISTORY_REASONS[reason] : "기타"
export const historyCurrencyLabel = (currency) => HISTORY_CURRENCIES[currency] ?? currency
export const formatHistoryTime = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR")
}
export const formatHistoryAmount = (amount) => (amount > 0 ? `+${amount.toLocaleString()}` : amount.toLocaleString())
