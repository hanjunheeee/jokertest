// 다이아 충전·골드 구매 안내 문구 (진행 상태별·실패 이유별·결제사 실패 코드별·구매 단추 꺼진 까닭)
// utils/currencyView.js·utils/storePanel.js·결제 복귀·구매 흐름이 씀 (데스크톱·모바일이 같은 문구를 보이게)

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
  ORDER_REFUNDED: "환불된 주문입니다. 이 주문의 다이아는 지급되지 않거나 회수되었습니다.",
  ORDER_CREATE_FAILED: "주문을 만들지 못했습니다. 다시 시도해 주세요.",
  SDK_LOAD_FAILED: "결제창을 불러오지 못했습니다. 다시 시도해 주세요.",
  PAYMENT_WINDOW_FAILED: "결제창을 열지 못했습니다. 다시 시도해 주세요.",
  INVALID_RETURN: "결제 복귀 정보가 올바르지 않아 확인하지 않았습니다.",
  PRODUCT_VERSION_MISMATCH: "상품 정보가 변경되었습니다. 새 조건을 확인한 뒤 다시 시도해 주세요.",
  PRODUCT_NOT_FOUND: "상품을 찾을 수 없습니다. 목록을 확인해 주세요.",
  PRODUCT_STOPPED: "판매가 중지된 상품입니다. 목록을 확인해 주세요.",
  TOSS_ABORTED: "결제 진행 중 문제가 생겨 결제가 끝나지 않았습니다. 다이아는 충전되지 않았습니다.",
  TOSS_CARD_REJECTED: "카드사에서 결제를 거절했습니다. 카드 정보·한도를 확인해 주세요. 다이아는 충전되지 않았습니다.",
  TOSS_OTHER: "결제사에서 결제를 끝내지 못했습니다. 다이아는 충전되지 않았습니다.",
}

// 결제창 실패 복귀 주소의 결제사 코드 → 우리 실패 이유 (사용자가 직접 취소한 것만 취소 안내)
// 예) "REJECT_CARD_COMPANY" → "TOSS_CARD_REJECTED" / 표에 없는 코드 → "TOSS_OTHER"
export const TOSS_CANCEL_CODES = new Set(["PAY_PROCESS_CANCELED"])
export const TOSS_FAIL_REASONS = {
  PAY_PROCESS_ABORTED: "TOSS_ABORTED",
  REJECT_CARD_COMPANY: "TOSS_CARD_REJECTED",
}
// 표에 없는 결제사 코드는 뒤에 코드를 붙여 보임 (사람이 문의할 때 쓰게)
export const TOSS_CODE_NOTE = (code) => `결제사 실패 코드: ${code}`
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

// 구매 단추가 꺼진 까닭 (단추 바로 아래에 보임)
export const PURCHASE_BLOCK_MESSAGES = {
  insufficientGold: "잔액이 부족합니다.",
  walletLoading: "보유 재화를 불러오는 중입니다.",
  walletError: "보유 재화를 불러오지 못해 구매할 수 없습니다. 보유 재화 칸의 재시도를 눌러 주세요.",
  bulkEmpty: "일괄구매할 상품을 골라 주세요.",
  notForSale: "이 분류의 상품은 여기서 살 수 없습니다.",
  currencyListError: "상품 목록을 불러오지 못했습니다. 상품 목록 새로고침을 눌러 주세요.",
  currencyListStale: "상품 정보가 바뀌었습니다. 상품 목록 새로고침을 눌러 주세요.",
}

// 구매 요청이 서버에 닿지 못했을 때 (인터넷 끊김, 브라우저 영어 글 대신)
export const PURCHASE_NETWORK_FAILED = "인터넷 연결이 끊겨 구매 결과를 확인하지 못했습니다. 연결을 확인한 뒤 결과 확인을 눌러 주세요."
// 구매 중 로그인이 풀리거나 바뀜 (다시 로그인하면 이 글이 남은 채 결과 확인을 하게 함)
export const PURCHASE_AUTH_LOST = "구매 중 로그인이 풀려 결과를 확인하지 못했습니다. 다시 로그인한 뒤 결과 확인을 눌러 주세요."
