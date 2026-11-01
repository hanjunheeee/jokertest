'use strict';

const crypto = require('crypto');
const { createError } = require('../../../utils/appError');
const currencyProducts = require('../currencyProducts');
const economyService = require('..');

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

const defaultDb = () => require('../../../models');
const dbOf = (deps) => deps.db ?? defaultDb();
const adapterOf = (deps) => deps.adapter ?? require('../../../payments/tossAdapter');
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

const logDeferred = (event, orderId, error) => {
    const code = typeof error?.code === 'string' && SAFE_LOG_CODE.test(error.code) ? error.code : 'UNKNOWN';
    console.warn(`[topup] ${event} order=${orderId} code=${code}`);
};

const expectString = (value, pattern, makeError) => {
    if (typeof value !== 'string' || !pattern.test(value)) throw makeError();
    return value;
};

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

        adapter.assertConfigured();

        if (!order.payment_key) {
            const holder = await orderModel(db).findOne({
                where: { payment_key: effectiveKey }, transaction: t,
            });
            if (holder && holder.order_id !== order.order_id) {
                throw createError('이 결제키는 다른 주문에서 사용 중입니다.', 409, 'PAYMENT_KEY_CONFLICT');
            }
        }

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

const tryGrant = async (db, deps, orderId) => {
    try {
        return await grantPendingOrder(db, deps, orderId);
    } catch (error) {
        logDeferred('지급 지연 — PENDING_GRANT 유지', orderId, error);
        return { status: ORDER_STATUS.PENDING_GRANT };
    }
};

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
        await releaseLease(db, order.order_id, leaseToken);
        return { status: ORDER_STATUS.CONFIRMING };
    }

    let persisted;
    try {
        persisted = await persistProviderResult(db, deps, { order, leaseToken, nextStatus, failureCode });
    } catch (error) {
        await releaseLease(db, order.order_id, leaseToken);
        throw error;
    }
    if (persisted.lost) return { status: ORDER_STATUS.CONFIRMING };
    if (nextStatus !== ORDER_STATUS.PENDING_GRANT) return { status: nextStatus };

    return tryGrant(db, deps, order.order_id);
};

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
            if (error?.code !== 'CONFIG_MISSING') throw error;
        }
    }

    const fresh = await orderModel(db).findOne({ where: { order_id: orderId } });
    if (!fresh) throw orderNotFound();
    const balance = fresh.status === ORDER_STATUS.GRANTED ? await loadGrantedBalance(db, fresh) : null;
    return toOrderView(fresh, balance);
};

const OPEN_ORDER_STATUSES = [ORDER_STATUS.CONFIRMING, ORDER_STATUS.PENDING_GRANT];
const OPEN_ORDER_LIMIT = 5;

const listOpenTopupOrders = async ({ userId }, deps = {}) => {
    if (typeof userId !== 'string' || userId.length === 0) {
        throw createError('로그인이 필요합니다.', 401);
    }
    const db = dbOf(deps);
    const rows = await orderModel(db).findAll({
        where: { user_id: userId, status: OPEN_ORDER_STATUSES },
        order: [['created_at', 'DESC'], ['order_id', 'DESC']],
        limit: OPEN_ORDER_LIMIT,
    });
    return rows.map((row) => ({
        orderId: row.order_id,
        status: row.status,
        amount: row.pay_amount,
        orderName: row.order_name,
        createdAt: row.created_at,
    }));
};

module.exports = {
    ORDER_STATUS,
    OPEN_ORDER_LIMIT,
    LEASE_MS,
    ORDER_ID_PATTERN,
    PAYMENT_KEY_PATTERN,
    referenceEventIdOf,
    createTopupOrder,
    confirmTopupOrder,
    getTopupOrder,
    listOpenTopupOrders,
};
