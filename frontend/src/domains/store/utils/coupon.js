// 쿠폰 입력 도구 (코드 다듬기·모양 검사·결과 문구)
// 쿠폰 입력 훅이 씀, 모양 규칙은 서버(services/ops/coupon.js)와 같게

// 영문 대문자·숫자·- 4~40자 (소문자·앞뒤 빈칸은 다듬어 봄)
export const COUPON_CODE_PATTERN = /^[A-Z0-9-]{4,40}$/

// 예: " abc-123 " → "ABC-123"
export function normalizeCouponCode(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : ""
}

export function isCouponCodeShape(value) {
  return COUPON_CODE_PATTERN.test(normalizeCouponCode(value))
}

const CURRENCY_LABELS = { GOLD: "골드", DIAMOND: "다이아" }

// 성공 문구 (예: { currency: "GOLD", amount: 500 } → "골드 500개를 받았습니다.")
export function couponSuccessText(reward) {
  const label = CURRENCY_LABELS[reward?.currency] ?? "보상"
  if (!Number.isFinite(reward?.amount)) return `${label}을 받았습니다.`
  return `${label} ${reward.amount.toLocaleString()}개를 받았습니다.`
}

// 실패 코드 → 문구 (서버 문구가 없을 때)
export const COUPON_ERROR_TEXT = {
  INVALID_COUPON_CODE: "쿠폰 코드 형식이 올바르지 않습니다.",
  COUPON_NOT_FOUND: "쿠폰을 찾을 수 없습니다.",
  COUPON_INACTIVE: "사용이 중지된 쿠폰입니다.",
  COUPON_NOT_STARTED: "아직 사용할 수 없는 쿠폰입니다.",
  COUPON_EXPIRED: "기간이 끝난 쿠폰입니다.",
  COUPON_EXHAUSTED: "모두 사용된 쿠폰입니다.",
  COUPON_ALREADY_REDEEMED: "이미 사용한 쿠폰입니다.",
  RATE_LIMITED: "쿠폰 입력이 너무 많습니다. 잠시 후 다시 시도해주세요.",
}

export function couponErrorText(error) {
  return COUPON_ERROR_TEXT[error?.code] || error?.message || "쿠폰을 사용하지 못했습니다. 다시 시도해주세요."
}
