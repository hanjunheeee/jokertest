// 경제 요청 필드 검사 파일, 경로별 허용 필드 표 · 모르는 필드 400 · 양의 안전 정수 확인
// controllers/economy 구매·장착·지급·충전 처리기가 부름 (값 모양 검사는 처리기 안에 그대로)
const { createError } = require("../../utils/appError");

// 경로별 허용 필드 (그 밖 필드는 서비스 부르기 전 400)
const ALLOWED_PURCHASE_FIELDS = new Set(["itemId", "referenceEventId"]);
const ALLOWED_GRANT_FIELDS = new Set(["userId", "reason", "referenceEventId"]);
const ALLOWED_BULK_PURCHASE_FIELDS = new Set(["items", "referenceEventId"]);
const ALLOWED_BULK_PURCHASE_ITEM_FIELDS = new Set(["itemId"]);
const ALLOWED_EQUIP_PROFILE_FIELDS = new Set(["photoItemId", "borderItemId", "expectedRevision"]);

const ALLOWED_GOLD_PURCHASE_FIELDS = new Set(["productId", "version", "referenceEventId"]);
// 골드 구매 본문에서 검사 전에 지우는 참고용 필드 (가격·수량은 서버 상품 값만 믿기)
const IGNORED_GOLD_PURCHASE_REFERENCE_FIELDS = ["price", "priceGold", "amount", "quantity", "payAmount", "grantAmount", "bonusAmount"];

const ALLOWED_TOPUP_ORDER_FIELDS = new Set(["productId", "version"]);
const ALLOWED_TOPUP_CONFIRM_FIELDS = new Set(["paymentKey", "amount"]);
// 상품 목록 kind 조회 값으로 받는 종류
const PRODUCT_KINDS = new Set(["DIAMOND_TOPUP", "GOLD_PURCHASE"]);

// 허용 표에 없는 필드가 하나라도 있으면 400 (오류 코드는 경로마다 다름)
const rejectUnknownFields = (body, allowedFields, errorCode) => {
    const unknown = Object.keys(body ?? {}).filter((key) => !allowedFields.has(key));
    if (unknown.length > 0) {
        throw createError("허용되지 않은 필드가 포함되어 있습니다.", 400, errorCode);
    }
};

// 숫자형 · 안전한 정수 · 0보다 큰지
const isPositiveSafeInteger = (value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

module.exports = {
    ALLOWED_PURCHASE_FIELDS,
    ALLOWED_GRANT_FIELDS,
    ALLOWED_BULK_PURCHASE_FIELDS,
    ALLOWED_BULK_PURCHASE_ITEM_FIELDS,
    ALLOWED_EQUIP_PROFILE_FIELDS,
    ALLOWED_GOLD_PURCHASE_FIELDS,
    IGNORED_GOLD_PURCHASE_REFERENCE_FIELDS,
    ALLOWED_TOPUP_ORDER_FIELDS,
    ALLOWED_TOPUP_CONFIRM_FIELDS,
    PRODUCT_KINDS,
    rejectUnknownFields,
    isPositiveSafeInteger,
};
