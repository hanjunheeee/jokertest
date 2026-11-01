// 경제 응답 모양 파일, 장부 행 · 장착 · 공개 상품 · 충전 주문을 응답 객체로 바꾸기
// controllers/economy 구매·장착·충전 처리기가 부름 (경제 서비스는 모듈 객체로 불러 시험 갈아끼우기 먹게)
const economyService = require("../../services/economy");

// 장부 행 → 응답 (행 없으면 그대로)
const serializeLedgerEntry = (entry) => entry && ({
    id: entry.id,
    reason: entry.reason,
    itemId: entry.item_id,
    currency: entry.currency,
    amount: entry.amount,
    balanceAfter: entry.balance_after,
    referenceEventId: entry.reference_event_id,
    createdAt: entry.created_at,
});

// 장착 행 → 프로필 사진·테두리·카드 테두리·revision
const serializeLoadout = (loadout) => ({
    selectedProfilePhotoId: loadout.selected_profile_photo_id,
    selectedProfileBorderId: loadout.selected_profile_border_id,
    selectedCardFrameId: loadout.selected_card_frame_id,
    revision: loadout.revision,
});

// 칸 장착 응답은 직업별 스킨까지
const serializeEquipLoadout = (loadout) => ({
    ...serializeLoadout(loadout),
    selectedSkinsByJob: economyService.buildSkinsByJob(loadout),
});

// 판매 상품 → 공개 필드만
const serializePublicProduct = (product) => ({
    productId: product.productId,
    kind: product.kind,
    displayName: product.displayName,
    payCurrency: product.payCurrency,
    payAmount: product.payAmount,
    grantCurrency: product.grantCurrency,
    grantAmount: product.grantAmount,
    bonusAmount: product.bonusAmount,
    version: product.version,
});

// 충전 주문 → 응답 (지급 끝난 주문만 다이아 잔액 붙임)
const serializeTopupOrder = (order) => ({
    ok: true,
    orderId: order.orderId,
    status: order.status,
    amount: order.amount,
    orderName: order.orderName,
    productId: order.productId,
    version: order.version,
    grantAmount: order.grantAmount,
    bonusAmount: order.bonusAmount,
    ...(order.status === "GRANTED" ? { balanceDiamond: order.balanceDiamond } : {}),
    createdAt: order.createdAt,
});

module.exports = {
    serializeLedgerEntry,
    serializeLoadout,
    serializeEquipLoadout,
    serializePublicProduct,
    serializeTopupOrder,
};
