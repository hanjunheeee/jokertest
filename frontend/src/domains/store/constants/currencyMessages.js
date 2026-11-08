// 다이아 충전·골드 구매 안내 문구 (진행 상태별·실패 이유별)
// utils/currencyView.js가 씀 (데스크톱·모바일 안내 칸이 같은 문구를 보이게)

// 충전 진행 상태별 문구
export const TOPUP_MESSAGES = {
  creatingOrder: "주문을 만들고 있습니다…",
  payment: "결제창으로 이동하고 있습니다…",
  confirming: "결제 결과를 서버에서 확인하고 있습니다…",
  pendingGrant: "결제는 승인되었고 다이아 지급을 기다리고 있습니다.",
  unknown: "결제 결과 확인이 필요합니다. 확인 전까지 다이아는 지급된 것으로 보지 않습니다.",
  done: "충전이 완료되었습니다.",
  canceled: "결제가 취소되었거나 완료되지 않았습니다. 다이아는 충전되지 않았습니다.",
}

// 충전 실패 이유별 문구 (모르는 이유는 TOPUP_FAILED_DEFAULT)
export const TOPUP_FAILURE_MESSAGES = {
  AMOUNT_MISMATCH: "결제 금액이 주문과 달라 충전하지 않았습니다.",
  NOT_OWNER: "다른 계정의 주문이라 충전하지 않았습니다.",
  ORDER_NOT_FOUND: "주문을 찾을 수 없어 충전하지 않았습니다.",
  PAYMENT_FAILED: "결제가 완료되지 않아 충전하지 않았습니다.",
  CONFIG_MISSING: "결제 설정이 아직 준비되지 않아 충전하지 않았습니다.",
  PAYMENT_KEY_MISMATCH: "결제 정보가 주문과 맞지 않아 충전하지 않았습니다.",
  PAYMENT_KEY_CONFLICT: "결제 정보가 주문과 맞지 않아 충전하지 않았습니다.",
  ORDER_FAILED: "결제가 실패해 다이아가 지급되지 않았습니다.",
  ORDER_CANCELED: "결제가 취소되어 다이아가 지급되지 않았습니다.",
  ORDER_EXPIRED: "결제 시간이 만료되어 다이아가 지급되지 않았습니다.",
  ORDER_CREATE_FAILED: "주문을 만들지 못했습니다. 다시 시도해 주세요.",
  SDK_LOAD_FAILED: "결제창을 불러오지 못했습니다. 다시 시도해 주세요.",
  PAYMENT_WINDOW_FAILED: "결제창을 열지 못했습니다. 다시 시도해 주세요.",
  INVALID_RETURN: "결제 복귀 정보가 올바르지 않아 확인하지 않았습니다.",
  PRODUCT_VERSION_MISMATCH: "상품 정보가 변경되었습니다. 새 조건을 확인한 뒤 다시 시도해 주세요.",
  PRODUCT_NOT_FOUND: "상품을 찾을 수 없습니다. 목록을 확인해 주세요.",
  PRODUCT_STOPPED: "판매가 중지된 상품입니다. 목록을 확인해 주세요.",
}
export const TOPUP_FAILED_DEFAULT = "충전에 실패했습니다. 다이아는 지급되지 않았습니다."
// 설정 대기 문구 (서버에 결제 키가 없을 때)
export const TOPUP_CONFIG_PENDING = "결제 설정이 아직 준비되지 않았습니다(설정 대기). 상품 목록을 새로고침한 뒤 다시 시도해 주세요."
// 지급 대기·결과 모름일 때 덧붙이는 문구
export const TOPUP_LOOKUP_FAILED = "주문 조회에 실패했습니다."
export const TOPUP_AUTO_CHECK_DONE = "자동 확인을 마쳤습니다. 결과 확인을 눌러 다시 확인해 주세요."

// 골드 구매 상태별 문구
export const GOLD_MESSAGES = {
  pending: "골드 구매를 처리하고 있습니다…",
  confirmed: "골드 구매가 완료되었습니다.",
  unknown: "골드 구매 결과 확인이 필요합니다.",
  priceChanged: "상품 정보가 변경되었습니다. 새 조건을 확인한 뒤 다시 구매해 주세요.",
  insufficient: "다이아가 부족합니다. 잔액은 변하지 않았습니다.",
  rejected: "골드 구매에 실패했습니다. 재화는 차감되지 않았습니다.",
}
export const GOLD_PRODUCT_GONE = "이 상품은 더 이상 판매 중이 아니거나 목록을 확인하지 못했습니다."
