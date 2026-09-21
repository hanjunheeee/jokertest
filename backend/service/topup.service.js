'use strict';

// F-32a 다이아 충전 주문·승인·지급. 설계는 docs/design/F-32-diamond-topup-gold-purchase.md §2-3,
// 외부 작성자·복구 계약은 docs/requirements/f32a-currency-products-contract.md에 있다.
//
// 상태: CREATED → CONFIRMING → PENDING_GRANT → GRANTED. 제공자가 확인한 실패는 FAILED /
// CANCELED / EXPIRED(미지급, 종단). 승인 결과를 알 수 없으면(전송 오류·timeout·5xx·입금
// 대기) CONFIRMING으로 남고 같은 주문의 재확인·재조회가 저장된 결제키로 제공자 상태를 다시
// 확인해 이어 간다.
//
// 단일 지급의 근거는 셋이다 — 주문 order_id 기본키, 결제키 payment_key 고유 인덱스,
// 원장 (user_id, reference_event_id='topup:{orderId}') 고유 인덱스. 제공자의 멱등키 유효기간이
// 지나도 이 셋이 지급을 한 번으로 묶는다.
//
// DB 잠금은 외부 승인 호출 동안 잡지 않는다: ① 짧은 트랜잭션(주문 행 잠금)에서 소유권·금액·
// 결제키를 대조하고 CONFIRMING + 임대(lease_token/lease_expires_at)를 저장·커밋한 뒤 ② 잠금
// 밖에서 제공자를 호출하고 ③ 결과를 임대 토큰 조건으로 저장(늦은 이전 처리자가 새 결과를 덮지
// 못한다)하고 ④ 별도 트랜잭션에서 주문 잠금 → 원장 함수 → GRANTED를 한 번에 커밋한다.
//
// 어댑터(backend/payments/tossAdapter.js)는 호출 시점에 모듈 객체에서 읽는다 — 시험이
// 가짜 어댑터를 끼울 수 있게 하되 운영 환경변수로 구현을 고르는 경로는 없다.

const crypto = require('crypto');
const { createError } = require('../utils/appError');
const currencyProducts = require('./currencyProducts.service');
const economyService = require('./economy.service');

const ORDER_STATUS = Object.freeze({
    CREATED: 'CREATED',
    CONFIRMING: 'CONFIRMING',
    PENDING_GRANT: 'PENDING_GRANT',
    GRANTED: 'GRANTED',
    FAILED: 'FAILED',
    CANCELED: 'CANCELED',
    EXPIRED: 'EXPIRED',
});

const TERMINAL_FAILURE_STATUSES = new Set([ORDER_STATUS.FAILED, ORDER_STATUS.CANCELED, ORDER_STATUS.EXPIRED]);

const LEASE_MS = 30_000;
const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const PAYMENT_KEY_PATTERN = /^[A-Za-z0-9_=+/.-]{1,200}$/;
const SAFE_LOG_CODE = /^[A-Z0-9_]{1,80}$/;

const defaultDb = () => require('../models');
const dbOf = (deps) => deps.db ?? defaultDb();
const adapterOf = (deps) => deps.adapter ?? require('../payments/tossAdapter');
const nowOf = (deps) => (typeof deps.now === 'function' ? deps.now() : new Date());
const leaseMsOf = (deps) => (Number.isSafeInteger(deps.leaseMs) && deps.leaseMs > 0 ? deps.leaseMs : LEASE_MS);

const orderModel = (db) => db.EconomyTopupOrder ?? db.sequelize.models.EconomyTopupOrder;
const ledgerModel = (db) => db.EconomyLedgerEntry ?? db.sequelize.models.EconomyLedgerEntry;
const referenceEventIdOf = (orderId) => `topup:${orderId}`;
const grantTotalOf = (order) => order.grant_amount + order.bonus_amount;

const orderNotFound = () => createError('주문을 찾을 수 없습니다.', 404, 'ORDER_NOT_FOUND');
const notOwner = () => createError('다른 계정의 주문에는 접근할 수 없습니다.', 403, 'NOT_OWNER');
const processingError = () => createError('결제 확인이 진행 중입니다. 잠시 후 다시 조회하세요.', 503, 'PAYMENT_PROCESSING');
const paymentFailed = () => createError('결제가 완료되지 않았습니다.', 402, 'PAYMENT_FAILED');

/** 원본 오류 대신 안전한 코드만 로그에 남긴다(메시지·SQL·스택은 남기지 않는다). */
const logDeferred = (event, orderId, error) => {
    const code = typeof error?.code === 'string' && SAFE_LOG_CODE.test(error.code) ? error.code : 'UNKNOWN';
    console.warn(`[topup] ${event} order=${orderId} code=${code}`);
};

const expectString = (value, pattern, makeError) => {
    if (typeof value !== 'string' || !pattern.test(value)) throw makeError();
    return value;
};

/** 주문의 서버 저장 값에서 공개 가능한 조회 결과를 만든다(결제키·임대는 포함하지 않는다). */
const toOrderView = (order, balanceDiamond = null) => ({
    orderId: order.order_id,
    status: order.status,
    amount: order.pay_amount,
    orderName: order.order_name,
    productId: order.product_id,
    version: order.version,
    grantAmount: order.grant_amount,
    bonusAmount: order.bonus_amount,
    balanceDiamond: order.status === ORDER_STATUS.GRANTED ? balanceDiamond : null,
    createdAt: order.created_at,
});

const loadGrantedBalance = async (db, order, transaction) => {
    const entry = await ledgerModel(db).findOne({
        where: { user_id: order.user_id, reference_event_id: referenceEventIdOf(order.order_id) },
        ...(transaction ? { transaction } : {}),
    });
    return entry ? entry.balance_after : null;
};

/** 실패한 처리자가 잡고 있던 임대를 돌려준다(best-effort — 실패해도 임대는 만료된다). */
const releaseLease = async (db, orderId, leaseToken) => {
    try {
        await orderModel(db).update(
            { lease_token: null, lease_expires_at: null },
            { where: { order_id: orderId, lease_token: leaseToken, status: ORDER_STATUS.CONFIRMING } },
        );
    } catch (error) {
        logDeferred('임대 반납 실패', orderId, error);
    }
};

// ── 주문 생성 ───────────────────────────────────────────────────────────────

/**
 * DB 상품의 유효성·판매 상태·버전을 확인하고 주문 스냅샷을 CREATED로 저장한다. 클라이언트가
 * 보낸 금액·지급량은 받지 않는다. 결제 설정이 없으면 주문을 만들기 전에 CONFIG_MISSING이다.
 */
const createTopupOrder = async ({ userId, productId, version }, deps = {}) => {
    const db = dbOf(deps);
    const adapter = adapterOf(deps);
    if (typeof userId !== 'string' || userId.length === 0) {
        throw createError('로그인이 필요합니다.', 401);
    }

    const product = await currencyProducts.getCurrencyProduct(
        { productId, version, kind: currencyProducts.KINDS.DIAMOND_TOPUP }, db,
    );
    const clientKey = adapter.getClientKey();

    const orderId = crypto.randomUUID();
    await orderModel(db).create({
        order_id: orderId,
        user_id: userId,
        product_id: product.productId,
        version: product.version,
        pay_amount: product.payAmount,
        grant_amount: product.grantAmount,
        bonus_amount: product.bonusAmount,
        order_name: product.displayName,
        status: ORDER_STATUS.CREATED,
    });

    return { orderId, amount: product.payAmount, orderName: product.displayName, clientKey };
};

// ── 짧은 트랜잭션: 소유권·금액·결제키 대조와 임대 확보 ────────────────────────────────

/**
 * 주문 행을 잠그고 결정을 돌려준다. paymentKey·amount가 있으면(confirm) 소유권·금액·결제키를
 * 외부 호출 전에 대조하고, 없으면(조회 복구) 저장된 결제키를 쓴다.
 * 결정: GRANTED | TERMINAL | PENDING_GRANT | BUSY(다른 처리자의 유효 임대) | IDLE(결제키 없는
 * CREATED — 조회는 부작용이 없다) | CLAIMED(임대를 얻었으니 제공자 확인을 이어 간다).
 */
const claimOrder = async (db, adapter, deps, { userId, orderId, paymentKey = null, amount = null }) => {
    const now = nowOf(deps);
    return db.sequelize.transaction(async (t) => {
        const order = await orderModel(db).findOne({
            where: { order_id: orderId }, transaction: t, lock: t.LOCK.UPDATE,
        });
        if (!order) throw orderNotFound();
        if (order.user_id !== userId) throw notOwner();
        if (amount !== null && amount !== order.pay_amount) {
            throw createError('결제 금액이 주문과 다릅니다.', 400, 'AMOUNT_MISMATCH');
        }
        if (paymentKey !== null && order.payment_key && order.payment_key !== paymentKey) {
            throw createError('이 주문에 이미 다른 결제키가 연결되어 있습니다.', 409, 'PAYMENT_KEY_MISMATCH');
        }

        if (order.status === ORDER_STATUS.GRANTED) return { kind: 'GRANTED', order };
        if (TERMINAL_FAILURE_STATUSES.has(order.status)) return { kind: 'TERMINAL', order };
        if (order.status === ORDER_STATUS.PENDING_GRANT) return { kind: 'PENDING_GRANT', order };

        const effectiveKey = paymentKey ?? order.payment_key;
        if (order.status === ORDER_STATUS.CREATED && !effectiveKey) return { kind: 'IDLE', order };

        const leaseValid = order.status === ORDER_STATUS.CONFIRMING
            && order.lease_token
            && order.lease_expires_at
            && new Date(order.lease_expires_at) > now;
        if (leaseValid) return { kind: 'BUSY', order };

        // 여기서부터는 제공자를 호출해야 한다 — 설정이 없으면 주문 상태를 바꾸기 전에 거부한다.
        adapter.assertConfigured();

        if (!order.payment_key) {
            const holder = await orderModel(db).findOne({
                where: { payment_key: effectiveKey }, transaction: t,
            });
            if (holder && holder.order_id !== order.order_id) {
                throw createError('이 결제키는 다른 주문에서 사용 중입니다.', 409, 'PAYMENT_KEY_CONFLICT');
            }
        }

        // 이전 처리자가 승인을 시도했을 수 있으면(CONFIRMING) 새로 승인하지 않고 먼저 제공자의
        // 상태를 조회한다.
        const mode = order.status === ORDER_STATUS.CONFIRMING ? 'recover' : 'first';
        const leaseToken = crypto.randomUUID();
        try {
            await order.update({
                payment_key: effectiveKey,
                status: ORDER_STATUS.CONFIRMING,
                lease_token: leaseToken,
                lease_expires_at: new Date(now.getTime() + leaseMsOf(deps)),
            }, { transaction: t });
        } catch (error) {
            if (error?.name === 'SequelizeUniqueConstraintError') {
                throw createError('이 결제키는 다른 주문에서 사용 중입니다.', 409, 'PAYMENT_KEY_CONFLICT');
            }
            throw error;
        }
        return { kind: 'CLAIMED', order, leaseToken, mode };
    });
};

// ── 잠금 밖: 제공자 확인 ────────────────────────────────────────────────────────────

/**
 * 요청당 외부 호출은 최대 세 번이다. first: 승인 1회(+이미 처리됨이면 조회 1회). recover:
 * 조회 1회, 아직 승인 전(IN_PROGRESS)이면 같은 멱등키로 승인 1회.
 */
const askProvider = async (adapter, order, mode) => {
    const request = { paymentKey: order.payment_key, orderId: order.order_id, amount: order.pay_amount };
    let result;
    if (mode === 'first') {
        result = await adapter.confirmPayment(request);
        if (!result.ok && result.outcome === 'REJECTED' && result.code === 'ALREADY_PROCESSED_PAYMENT') {
            result = await adapter.getPayment({ paymentKey: request.paymentKey });
        }
    } else {
        result = await adapter.getPayment({ paymentKey: request.paymentKey });
        if (!result.ok && result.outcome === 'PENDING' && result.payment?.providerStatus === 'IN_PROGRESS') {
            result = await adapter.confirmPayment(request);
        }
    }
    return result;
};

/** DONE 응답이 주문 스냅샷(식별자·금액·통화)과 일치하는지 대조한다. */
const paymentMatchesOrder = (payment, order) => Boolean(payment)
    && payment.orderId === order.order_id
    && payment.paymentKey === order.payment_key
    && payment.totalAmount === order.pay_amount
    && payment.currency === 'KRW';

const FAILURE_STATUS_BY_OUTCOME = Object.freeze({
    REJECTED: ORDER_STATUS.FAILED,
    FAILED: ORDER_STATUS.FAILED,
    MISMATCH: ORDER_STATUS.FAILED,
    CANCELED: ORDER_STATUS.CANCELED,
    EXPIRED: ORDER_STATUS.EXPIRED,
});

/**
 * 제공자 결과를 임대 토큰 조건으로 저장한다. 임대를 잃었으면(다른 처리자가 이어받음) 아무것도
 * 덮어쓰지 않고 { lost: true }다.
 */
const persistProviderResult = async (db, deps, { order, leaseToken, nextStatus, failureCode = null }) => {
    const now = nowOf(deps);
    return db.sequelize.transaction(async (t) => {
        const current = await orderModel(db).findOne({
            where: { order_id: order.order_id }, transaction: t, lock: t.LOCK.UPDATE,
        });
        if (!current || current.lease_token !== leaseToken || current.status !== ORDER_STATUS.CONFIRMING) {
            return { lost: true };
        }
        await current.update({
            status: nextStatus,
            lease_token: null,
            lease_expires_at: null,
            failure_code: failureCode,
            ...(nextStatus === ORDER_STATUS.PENDING_GRANT ? { approved_at: now } : {}),
        }, { transaction: t });
        return { lost: false };
    });
};

// ── 지급: 주문 잠금 → 원장 함수 → GRANTED 를 한 트랜잭션으로 ─────────────────────────────

const grantPendingOrder = async (db, deps, orderId) => {
    const now = nowOf(deps);
    return db.sequelize.transaction(async (t) => {
        const order = await orderModel(db).findOne({
            where: { order_id: orderId }, transaction: t, lock: t.LOCK.UPDATE,
        });
        if (!order) throw orderNotFound();
        if (order.status === ORDER_STATUS.GRANTED) {
            return { status: ORDER_STATUS.GRANTED, balanceDiamond: await loadGrantedBalance(db, order, t) };
        }
        if (order.status !== ORDER_STATUS.PENDING_GRANT) return { status: order.status };

        const { ledgerEntry } = await economyService.applyLedgerTransaction(db, {
            userId: order.user_id,
            reason: 'DIAMOND_TOPUP',
            currency: economyService.CURRENCIES.DIAMOND,
            amount: grantTotalOf(order),
            itemId: null,
            referenceEventId: referenceEventIdOf(order.order_id),
        }, { transaction: t });

        await order.update({ status: ORDER_STATUS.GRANTED, granted_at: now }, { transaction: t });
        return { status: ORDER_STATUS.GRANTED, balanceDiamond: ledgerEntry.balance_after };
    });
};

/** 지급을 시도하되 실패하면 PENDING_GRANT를 유지한다(같은 confirm·조회가 이어서 끝낸다). */
const tryGrant = async (db, deps, orderId) => {
    try {
        return await grantPendingOrder(db, deps, orderId);
    } catch (error) {
        logDeferred('지급 지연 — PENDING_GRANT 유지', orderId, error);
        return { status: ORDER_STATUS.PENDING_GRANT };
    }
};

/**
 * CLAIMED 결정 뒤의 제공자 확인 → 결과 저장 → 지급. 돌려주는 status는 GRANTED |
 * PENDING_GRANT | CONFIRMING(결과 불명·입금 대기·임대 상실) | FAILED/CANCELED/EXPIRED(종단).
 */
const processClaimed = async (db, adapter, deps, claimed) => {
    const { order, leaseToken, mode } = claimed;

    let result;
    try {
        result = await askProvider(adapter, order, mode);
    } catch (error) {
        await releaseLease(db, order.order_id, leaseToken);
        throw error;
    }

    let nextStatus;
    let failureCode = null;
    if (result.ok) {
        if (paymentMatchesOrder(result.payment, order)) {
            nextStatus = ORDER_STATUS.PENDING_GRANT;
        } else {
            nextStatus = ORDER_STATUS.FAILED;
            failureCode = 'PAYMENT_MISMATCH';
        }
    } else if (FAILURE_STATUS_BY_OUTCOME[result.outcome]) {
        nextStatus = FAILURE_STATUS_BY_OUTCOME[result.outcome];
        failureCode = typeof result.code === 'string' && SAFE_LOG_CODE.test(result.code) ? result.code : 'PAYMENT_FAILED';
    } else {
        // PENDING·UNKNOWN: 결과를 알 수 없다 — 실패로 단정하지 않고 다음 확인이 이어 가도록 임대만 돌려준다.
        await releaseLease(db, order.order_id, leaseToken);
        return { status: ORDER_STATUS.CONFIRMING };
    }

    let persisted;
    try {
        persisted = await persistProviderResult(db, deps, { order, leaseToken, nextStatus, failureCode });
    } catch (error) {
        // 승인 사실을 저장하지 못했다 — CONFIRMING으로 남고 다음 조회가 제공자 상태로 복구한다.
        await releaseLease(db, order.order_id, leaseToken);
        throw error;
    }
    if (persisted.lost) return { status: ORDER_STATUS.CONFIRMING };
    if (nextStatus !== ORDER_STATUS.PENDING_GRANT) return { status: nextStatus };

    return tryGrant(db, deps, order.order_id);
};

// ── 공개 API ───────────────────────────────────────────────────────────────────────

/**
 * 결제 승인 확인. 소유권·금액·결제키를 외부 호출 전에 대조한다. 결과: { status: 'GRANTED',
 * balanceDiamond } 또는 { status: 'PENDING_GRANT' }. 결과 불명·다른 처리자 진행 중은 재시도
 * 가능한 PAYMENT_PROCESSING(503), 확인된 실패·취소는 PAYMENT_FAILED(402).
 */
const confirmTopupOrder = async ({ userId, orderId, paymentKey, amount }, deps = {}) => {
    const db = dbOf(deps);
    const adapter = adapterOf(deps);
    expectString(orderId, ORDER_ID_PATTERN, orderNotFound);
    expectString(paymentKey, PAYMENT_KEY_PATTERN, () => createError('paymentKey가 올바르지 않습니다.', 400, 'INVALID_TOPUP_CONFIRM_REQUEST'));
    if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw createError('amount가 올바르지 않습니다.', 400, 'INVALID_TOPUP_CONFIRM_REQUEST');
    }

    const decision = await claimOrder(db, adapter, deps, { userId, orderId, paymentKey, amount });
    let outcome;
    switch (decision.kind) {
        case 'GRANTED':
            return { status: ORDER_STATUS.GRANTED, balanceDiamond: await loadGrantedBalance(db, decision.order) };
        case 'TERMINAL':
            throw paymentFailed();
        case 'BUSY':
            throw processingError();
        case 'PENDING_GRANT':
            outcome = await tryGrant(db, deps, orderId);
            break;
        case 'CLAIMED':
            outcome = await processClaimed(db, adapter, deps, decision);
            break;
        default:
            throw processingError();
    }

    if (outcome.status === ORDER_STATUS.GRANTED) {
        return { status: ORDER_STATUS.GRANTED, balanceDiamond: outcome.balanceDiamond };
    }
    if (outcome.status === ORDER_STATUS.PENDING_GRANT) return { status: ORDER_STATUS.PENDING_GRANT };
    if (TERMINAL_FAILURE_STATUSES.has(outcome.status)) throw paymentFailed();
    throw processingError();
};

/**
 * 주문 조회. 단순 조회(CREATED)에는 승인·지급 부작용이 없다. PENDING_GRANT는 지급을 이어서
 * 끝내고, 임대가 만료된 CONFIRMING은 저장된 결제키로 제공자 상태를 다시 확인해 복구한다.
 * 소유가 아닌 주문은 NOT_OWNER, 없으면 ORDER_NOT_FOUND다.
 */
const getTopupOrder = async ({ userId, orderId }, deps = {}) => {
    const db = dbOf(deps);
    const adapter = adapterOf(deps);
    expectString(orderId, ORDER_ID_PATTERN, orderNotFound);

    const order = await orderModel(db).findOne({ where: { order_id: orderId } });
    if (!order) throw orderNotFound();
    if (order.user_id !== userId) throw notOwner();

    if (order.status === ORDER_STATUS.PENDING_GRANT) {
        await tryGrant(db, deps, orderId);
    } else if (order.status === ORDER_STATUS.CONFIRMING) {
        try {
            const decision = await claimOrder(db, adapter, deps, { userId, orderId });
            if (decision.kind === 'CLAIMED') await processClaimed(db, adapter, deps, decision);
            else if (decision.kind === 'PENDING_GRANT') await tryGrant(db, deps, orderId);
        } catch (error) {
            // 결제 설정이 없으면 복구를 미루고 저장된 상태를 그대로 보여 준다. 그 밖의 오류(DB 등)는 그대로 던진다.
            if (error?.code !== 'CONFIG_MISSING') throw error;
        }
    }

    const fresh = await orderModel(db).findOne({ where: { order_id: orderId } });
    if (!fresh) throw orderNotFound();
    const balance = fresh.status === ORDER_STATUS.GRANTED ? await loadGrantedBalance(db, fresh) : null;
    return toOrderView(fresh, balance);
};

module.exports = {
    ORDER_STATUS,
    LEASE_MS,
    ORDER_ID_PATTERN,
    PAYMENT_KEY_PATTERN,
    referenceEventIdOf,
    createTopupOrder,
    confirmTopupOrder,
    getTopupOrder,
};
