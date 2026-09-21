const express = require("express");
const router  = express.Router();

const { verifyToken } = require("../middleware/auth.middleware");
const { createError }  = require("../utils/appError");
const economyService = require("../service/economy.service");
// F-32a: 서비스는 구조 분해로 캡처하지 않고 모듈 객체로 호출한다 — 라우트 시험이 서비스
// 함수를 일시적으로 바꿔 끼워도 이 파일에 반영된다(economyService와 같은 관례).
const currencyProductsService = require("../service/currencyProducts.service");
const topupService = require("../service/topup.service");
const userRepository = require("../repositories/user.repositories");
const { getRewardCatalogEntry } = require("../economy/catalog");

// 자기 계정 데이터만 조회할 수 있다(F-08 AC-06). verifyToken이 채운 req.user.uuid와
// URL의 :userId가 다르면 401이 아니라 403이다 — 토큰 자체는 유효하지만 그 토큰의
// 권한 범위를 벗어난 요청이기 때문이다.
//
// F-32a: 인증 uuid가 없으면 거부한다. :userId 경로 변수가 없는 신규 API(상품 목록·충전 주문)에서는
// 비교할 대상이 없으므로 인증 uuid만 서비스 입력이 되고, 본문·쿼리의 계정 식별자는 권한 근거로
// 쓰지 않는다 — 주문 소유권은 서비스가 저장된 user_id와 비교한다(NOT_OWNER).
const requireSelf = (req, res, next) => {
    const authenticatedUuid = req.user?.uuid;
    if (typeof authenticatedUuid !== "string" || authenticatedUuid.length === 0) {
        return next(createError("로그인이 필요합니다.", 401));
    }
    if (req.params.userId !== undefined && authenticatedUuid !== req.params.userId) {
        return next(createError("다른 계정의 경제 데이터에 접근할 수 없습니다.", 403, "ECONOMY_FORBIDDEN"));
    }
    next();
};

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

const serializeLoadout = (loadout) => ({
    selectedProfilePhotoId: loadout.selected_profile_photo_id,
    selectedProfileBorderId: loadout.selected_profile_border_id,
    selectedCardFrameId: loadout.selected_card_frame_id,
    // F-13 AC-02: 다음 equip-profile 호출에 expectedRevision으로 그대로 되돌아올 CAS 토큰.
    revision: loadout.revision,
});

// F-14(AC-01, R-IMPL2 "Return authoritative full loadout INCLUDING selectedSkinsByJob and
// revision from actual endpoint, rather than reconstructing selected field from request") —
// POST /economy/equip 응답만 economyService.equipItem이 실제로 돌려준 loadout 행에서
// selectedSkinsByJob을 함께 실어 보낸다(economy.store.js가 요청 자체의 (slot,itemId)로
// 미러를 재구성하지 않고 실제 응답을 신뢰할 수 있게 한다). equip-profile 응답은 F-13이 이미
// 고정한 필드 4개만 유지한다(profileEquipment.publicResponses.test.js, 범위 밖 파일 — 건드리지
// 않는다).
const serializeEquipLoadout = (loadout) => ({
    ...serializeLoadout(loadout),
    selectedSkinsByJob: economyService.buildSkinsByJob(loadout),
});

// CODEX-2 재검토(AC-04): 이전 버전은 req.body에서 문서화된 필드만 "골라 읽어" 서비스로
// 넘겼을 뿐, price·balance·amount·currency 같은 다른 필드가 함께 와도 조용히 무시하고
// 201을 돌려줬다 — "무시"는 "거부"가 아니다. 변조 필드가 하나라도 있으면 서비스/DB를
// 건드리기 전에 즉시 400으로 거부한다. Object.keys는 자체 열거 가능 속성만 보므로
// (own-property), express.json()이 만든 일반 객체에서 __proto__ 같은 키가 실려 와도
// 여기서 평범한 미지 필드로 그대로 잡힌다.
const ALLOWED_PURCHASE_FIELDS = new Set(["itemId", "referenceEventId"]);
const ALLOWED_GRANT_FIELDS = new Set(["userId", "reason", "referenceEventId"]);
// F-09 일괄 구매 — 같은 이유(AC-04)로 문서화된 필드(items·referenceEventId) 밖의 값이
// 오면 즉시 거부한다. items 배열의 각 원소도 itemId 하나만 허용한다 — 조작된 요청이
// item마다 price·currency 같은 필드를 끼워 넣어도 서비스에 닿기 전에 거부된다.
const ALLOWED_BULK_PURCHASE_FIELDS = new Set(["items", "referenceEventId"]);
const ALLOWED_BULK_PURCHASE_ITEM_FIELDS = new Set(["itemId"]);
// F-13(AC-01/AC-02): 프로필 사진·테두리 동시 확정 전용 필드. photoItemId/borderItemId
// 외의 값이 오면 즉시 거부한다(다른 write 라우트와 같은 관례, CODEX-2 재검토). clientIntentAt
// (클라이언트 벽시계 시각을 서버 순서 판정 근거로 쓰던 필드)은 운영자 설계 감사(2026-09-11)
// 로 제거했다 — economyService.equipProfileAppearance의 새 주석 참고(같은 밀리초 충돌·시계
// 역행/오차·비영속 인메모리 상태라는 세 가지 결함이 있었다). 그 대체로 서버가 발급하는
// 영속 revision을 CAS로 비교하는 expectedRevision을 새로 추가했다(운영자 지시, 2026-09-11
// 22:12) — 클라이언트가 GET 응답의 loadout.revision을 그대로 되돌려 보낸다.
const ALLOWED_EQUIP_PROFILE_FIELDS = new Set(["photoItemId", "borderItemId", "expectedRevision"]);

const rejectUnknownFields = (body, allowedFields, errorCode) => {
    const unknown = Object.keys(body ?? {}).filter((key) => !allowedFields.has(key));
    if (unknown.length > 0) {
        throw createError("허용되지 않은 필드가 포함되어 있습니다.", 400, errorCode);
    }
};

router.get("/accounts/:userId/wallet", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const summary = await economyService.getWalletSummary(req.params.userId);
        res.json({ balanceGold: summary.balanceGold, balanceDiamond: summary.balanceDiamond });
    } catch (error) { next(error); }
});

router.get("/accounts/:userId/entitlements", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const summary = await economyService.getWalletSummary(req.params.userId);
        res.json({ entitlements: summary.entitlements, loadout: summary.loadout });
    } catch (error) { next(error); }
});

router.get("/accounts/:userId/transactions", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const transactions = await economyService.listTransactions(req.params.userId);
        res.json({ transactions });
    } catch (error) { next(error); }
});

// 구매·장착은 URL에 계정을 받지 않는다 — 항상 인증된 본인(req.user.uuid) 기준으로만
// 처리하므로 다른 계정을 대상으로 지정할 방법 자체가 없다.
router.post("/purchase", verifyToken, async (req, res, next) => {
    try {
        const body = req.body ?? {};
        // 클라이언트가 price·balance 등 다른 필드를 함께 보내면 무시하는 대신 즉시 거부한다
        // (F-08 AC-04, CODEX-2 재검토) — economyService.purchaseItem은 서버 카탈로그 가격만
        // 신뢰하지만, 변조 필드가 조용히 무시되는 것과 요청 자체가 거부되는 것은 다르다.
        rejectUnknownFields(body, ALLOWED_PURCHASE_FIELDS, "UNKNOWN_PURCHASE_FIELD");
        const { itemId, referenceEventId } = body;
        if (typeof itemId !== "string" || typeof referenceEventId !== "string") {
            throw createError("itemId와 referenceEventId가 필요합니다.", 400, "INVALID_PURCHASE_REQUEST");
        }
        const result = await economyService.purchaseItem({ userId: req.user.uuid, itemId, referenceEventId });
        res.status(result.idempotent ? 200 : 201).json({
            idempotent: result.idempotent,
            ledgerEntry: serializeLedgerEntry(result.ledgerEntry),
        });
    } catch (error) { next(error); }
});

// F-09 일괄 구매 — 개별 구매(POST /purchase)와 같은 인증된 본인 계정 기준 원자적 처리다
// (economyService.purchaseItems). 하나라도 실패하면 묶음 전체가 실패한다(AC-02).
router.post("/purchases/bulk", verifyToken, async (req, res, next) => {
    try {
        const body = req.body ?? {};
        rejectUnknownFields(body, ALLOWED_BULK_PURCHASE_FIELDS, "UNKNOWN_BULK_PURCHASE_FIELD");
        const { items, referenceEventId } = body;
        if (typeof referenceEventId !== "string") {
            throw createError("referenceEventId가 필요합니다.", 400, "INVALID_BULK_PURCHASE_REQUEST");
        }
        if (!Array.isArray(items) || items.length === 0) {
            throw createError("items가 필요합니다.", 400, "INVALID_BULK_PURCHASE_REQUEST");
        }
        for (const item of items) {
            rejectUnknownFields(item, ALLOWED_BULK_PURCHASE_ITEM_FIELDS, "UNKNOWN_BULK_PURCHASE_ITEM_FIELD");
            if (typeof item?.itemId !== "string") {
                throw createError("items[].itemId가 필요합니다.", 400, "INVALID_BULK_PURCHASE_REQUEST");
            }
        }
        const result = await economyService.purchaseItems({ userId: req.user.uuid, items, referenceEventId });
        res.status(result.idempotent ? 200 : 201).json({
            idempotent: result.idempotent,
            kind: result.kind,
            results: result.results.map(serializeLedgerEntry),
        });
    } catch (error) { next(error); }
});

// F-09 AC-04 — 커밋 후 응답을 잃어버렸을 때 같은 참조 사건 ID로 결과를 복구한다.
// 커밋된 적이 없으면(요청이 아예 도달하지 않았거나 커밋 전 오류로 롤백됨) 404다 — 그
// 두 경우를 이 응답 하나로는 구분하지 않는다(economyService.getPurchaseResult 참고).
router.get("/purchases/:referenceEventId", verifyToken, async (req, res, next) => {
    try {
        const result = await economyService.getPurchaseResult(req.user.uuid, req.params.referenceEventId);
        if (!result) {
            throw createError("해당 참조 사건 ID로 커밋된 구매 결과가 없습니다.", 404, "PURCHASE_RESULT_NOT_FOUND");
        }
        res.json({ kind: result.kind, results: result.results.map(serializeLedgerEntry), createdAt: result.createdAt });
    } catch (error) { next(error); }
});

// F-14(AC-01, R-IMPL2 "MUST CLOSE UNVERSIONED PUBLIC WRITE") — expectedRevision은 이 HTTP
// 경로에서 더 이상 선택이 아니다: 생략하거나 빈 문자열이면 economyService.equipItem을
// 호출하기도 전에 400(MISSING_EXPECTED_REVISION)으로 거부해, 버전 없는 덮어쓰기가 DB에
// 닿을 방법 자체를 없앤다 — POST /economy/equip-profile과 정확히 같은 계약이다.
// economyService.equipItem 자체는 여전히 expectedRevision을 선택으로 받는다(레거시 내부
// 호출 호환, 예: 이관 스크립트·서버 전용 지급 경로) — 이 라우트만 그 값을 필수로 강제한다.
router.post("/equip", verifyToken, async (req, res, next) => {
    try {
        const { slot, itemId, expectedRevision } = req.body ?? {};
        if (typeof slot !== "string" || typeof itemId !== "string") {
            throw createError("slot과 itemId가 필요합니다.", 400, "INVALID_EQUIP_REQUEST");
        }
        if (typeof expectedRevision !== "string" || expectedRevision.length === 0) {
            throw createError("expectedRevision이 필요합니다.", 400, "MISSING_EXPECTED_REVISION");
        }
        const loadout = await economyService.equipItem({ userId: req.user.uuid, slot, itemId, expectedRevision });
        res.json({ loadout: serializeEquipLoadout(loadout) });
    } catch (error) { next(error); }
});

// F-13 AC-01/AC-02: 프로필 수정 모달의 확인 한 번을 하나의 요청으로 확정한다. 사진·테두리
// 중 실제로 바뀐 슬롯만 보내면 되고(둘 다 보내도 된다), 어느 한쪽이 소유하지 않은 상품이면
// 두 슬롯 모두 저장되지 않는다(economyService.equipProfileAppearance의 전부-아니면-무 계약).
router.post("/equip-profile", verifyToken, async (req, res, next) => {
    try {
        const body = req.body ?? {};
        rejectUnknownFields(body, ALLOWED_EQUIP_PROFILE_FIELDS, "UNKNOWN_EQUIP_PROFILE_FIELD");
        const { photoItemId, borderItemId, expectedRevision } = body;
        if (photoItemId !== undefined && typeof photoItemId !== "string") {
            throw createError("photoItemId는 문자열이어야 합니다.", 400, "INVALID_EQUIP_PROFILE_REQUEST");
        }
        if (borderItemId !== undefined && typeof borderItemId !== "string") {
            throw createError("borderItemId는 문자열이어야 합니다.", 400, "INVALID_EQUIP_PROFILE_REQUEST");
        }
        if (typeof expectedRevision !== "string" || expectedRevision.length === 0) {
            throw createError("expectedRevision이 필요합니다.", 400, "MISSING_EXPECTED_REVISION");
        }
        const loadout = await economyService.equipProfileAppearance({
            userId: req.user.uuid,
            photoItemId,
            borderItemId,
            expectedRevision,
        });
        res.json({ loadout: serializeLoadout(loadout) });
    } catch (error) { next(error); }
});

// QA/운영 보상 지급 — role이 ADMIN·QA인 계정만 사용할 수 있다. req.user.role은 로그인
// 시점에 JWT에 실린 값이라, 그 이후 권한이 바뀌어도(예: QA 권한 회수) 세션이 만료되기
// 전까지는 갱신되지 않는다 — 이 경로처럼 민감한 관리자 전용 기능은 req.user.role을
// 그대로 믿지 않고, 매 요청마다 실제 계정 행(userRepository.findByUuid)을 다시 읽어
// "지금 이 순간" 실제 서버 계정 데이터에 저장된 권한으로 판정한다(F-08 R-IMPL: "Existing
// permission identity must be verified from real server session/account data").
//
// R-IMPL(2026-09-10, AC-04 재검토): 이전 버전은 요청 본문의 amount·currency를 그대로
// grantReward에 넘겼다 — 인증된 QA/ADMIN이라 해도 그 값은 여전히 "클라이언트가 보낸 값"
// 이므로, purchaseItem이 클라이언트 price를 절대 읽지 않는 것과 같은 이유로 여기서도
// 신뢰하면 안 된다. 이제 클라이언트는 amount·currency 대신 reason(보상 카탈로그의 키)만
// 보내고, 실제 지급 금액·재화는 항상 backend/economy/catalog.js의 REWARD_CATALOG 값이다
// — reason이 카탈로그에 없으면 요청 자체를 거부한다.
//
// CODEX-2 재검토(AC-04): reason만 읽고 amount·currency·balance 등 나머지 필드는 조용히
// 무시하던 이전 버전은 "변조 요청 거부"가 아니었다 — 문서화된 필드(userId/reason/
// referenceEventId) 밖의 값이 하나라도 오면 grantReward를 호출하기 전에 즉시 400으로
// 거부한다.
router.post("/admin/grant", verifyToken, async (req, res, next) => {
    try {
        const actingAccount = await userRepository.findByUuid(req.user.uuid);
        if (!actingAccount || (actingAccount.role !== "ADMIN" && actingAccount.role !== "QA")) {
            throw createError("권한이 없습니다.", 403, "ECONOMY_ADMIN_ONLY");
        }
        const body = req.body ?? {};
        rejectUnknownFields(body, ALLOWED_GRANT_FIELDS, "UNKNOWN_GRANT_FIELD");
        const { userId, reason, referenceEventId } = body;
        if (typeof userId !== "string" || typeof referenceEventId !== "string") {
            throw createError("userId와 referenceEventId가 필요합니다.", 400, "INVALID_GRANT_REQUEST");
        }
        const rewardEntry = typeof reason === "string" ? getRewardCatalogEntry(reason) : undefined;
        if (!rewardEntry) {
            throw createError("존재하지 않는 보상 사유입니다.", 400, "UNKNOWN_REWARD_REASON");
        }
        const result = await economyService.grantReward({
            userId,
            amount: rewardEntry.amount,
            currency: rewardEntry.currency,
            reason,
            referenceEventId,
        });
        res.status(result.idempotent ? 200 : 201).json({
            idempotent: result.idempotent,
            ledgerEntry: serializeLedgerEntry(result.ledgerEntry),
        });
    } catch (error) { next(error); }
});

// ── F-32a: 재화 상품 목록·다이아 충전 주문 ──────────────────────────────────────────────
// 네 경로 모두 verifyToken → requireSelf를 거친다. 계정은 항상 인증 uuid(req.user.uuid)이며,
// 본문·쿼리·경로의 어떤 계정 식별자도 서비스로 넘기지 않는다. 응답은 서비스 반환값에서 공개
// 필드를 명시적으로 골라 만든다(결제키·임대·내부 상태·secret은 어떤 경로로도 싣지 않는다).
// 오류는 next(error)로 넘겨 globalErrorHandler의 안전한 신규 범위 분기가 직렬화한다.
const ALLOWED_TOPUP_ORDER_FIELDS = new Set(["productId", "version"]);
const ALLOWED_TOPUP_CONFIRM_FIELDS = new Set(["paymentKey", "amount"]);
const PRODUCT_KINDS = new Set(["DIAMOND_TOPUP", "GOLD_PURCHASE"]);

const isPositiveSafeInteger = (value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

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

router.get("/currency-products", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const { kind } = req.query;
        if (kind !== undefined && (typeof kind !== "string" || !PRODUCT_KINDS.has(kind))) {
            throw createError("알 수 없는 상품 종류입니다.", 400, "INVALID_PRODUCT_KIND");
        }
        const products = await currencyProductsService.listCurrencyProducts({ kind });
        res.json({ ok: true, products: products.map(serializePublicProduct) });
    } catch (error) { next(error); }
});

router.post("/topup/orders", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const body = req.body ?? {};
        // 클라이언트가 amount·grantAmount·userId 같은 값을 함께 보내도 무시하지 않고 거부한다.
        rejectUnknownFields(body, ALLOWED_TOPUP_ORDER_FIELDS, "UNKNOWN_TOPUP_ORDER_FIELD");
        const { productId, version } = body;
        if (typeof productId !== "string" || productId.length === 0 || productId.length > 64 || !isPositiveSafeInteger(version)) {
            throw createError("productId와 version이 필요합니다.", 400, "INVALID_TOPUP_ORDER_REQUEST");
        }
        const order = await topupService.createTopupOrder({ userId: req.user.uuid, productId, version });
        res.status(201).json({
            ok: true,
            orderId: order.orderId,
            amount: order.amount,
            orderName: order.orderName,
            // 프런트로 나가는 키는 공개 clientKey뿐이다.
            clientKey: order.clientKey,
        });
    } catch (error) { next(error); }
});

router.post("/topup/orders/:orderId/confirm", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const body = req.body ?? {};
        rejectUnknownFields(body, ALLOWED_TOPUP_CONFIRM_FIELDS, "UNKNOWN_TOPUP_CONFIRM_FIELD");
        const { paymentKey, amount } = body;
        if (typeof paymentKey !== "string" || paymentKey.length === 0 || paymentKey.length > 200 || !isPositiveSafeInteger(amount)) {
            throw createError("paymentKey와 amount가 필요합니다.", 400, "INVALID_TOPUP_CONFIRM_REQUEST");
        }
        const result = await topupService.confirmTopupOrder({
            userId: req.user.uuid, orderId: req.params.orderId, paymentKey, amount,
        });
        if (result.status === "GRANTED") {
            res.json({ ok: true, status: "GRANTED", balanceDiamond: result.balanceDiamond });
        } else {
            // 승인은 됐고 지급을 이어서 재시도하는 중 — 같은 confirm·주문 조회가 지급을 끝낸다.
            res.json({ ok: true, status: "PENDING_GRANT" });
        }
    } catch (error) { next(error); }
});

// 응답 유실 복구용 조회. 결제창 복귀 쿼리(paymentKey 등)는 읽지 않는다 — 조회만으로 승인·지급을
// 시작하지 않는다(CREATED 주문은 부작용이 없고, 복구는 이미 저장된 결제키로만 이어진다).
router.get("/topup/orders/:orderId", verifyToken, requireSelf, async (req, res, next) => {
    try {
        const order = await topupService.getTopupOrder({ userId: req.user.uuid, orderId: req.params.orderId });
        res.json(serializeTopupOrder(order));
    } catch (error) { next(error); }
});

module.exports = router;
