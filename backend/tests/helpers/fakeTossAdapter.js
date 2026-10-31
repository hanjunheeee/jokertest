'use strict';

const tossAdapter = require('../../payments/tossAdapter');
const { createError } = require('../../utils/appError');

const FAKE_CLIENT_KEY = 'test_ck_fakeclientkey0000000000000001';

const SCENARIOS = new Set([
    'approve', 'lost-response', 'unreached', 'reject', 'cancel', 'expire', 'waiting',
    'tamper-amount', 'tamper-order', 'tamper-key',
]);

const OUTCOME_BY_STATE = Object.freeze({
    DONE: 'DONE',
    ABORTED: 'FAILED',
    CANCELED: 'CANCELED',
    EXPIRED: 'EXPIRED',
    IN_PROGRESS: 'PENDING',
    READY: 'PENDING',
    WAITING_FOR_DEPOSIT: 'PENDING',
});

const createFakeTossAdapter = ({ clientKey = FAKE_CLIENT_KEY } = {}) => {
    const payments = new Map();
    const holds = new Map();
    const calls = [];
    const flags = { configMissing: false };

    const paymentOf = (record, overrides = {}) => ({
        paymentKey: record.paymentKey,
        orderId: record.orderId,
        totalAmount: record.amount,
        currency: record.currency,
        providerStatus: record.status,
        ...overrides,
    });

    const resultFor = (record, overrides) => {
        const outcome = OUTCOME_BY_STATE[record.status];
        const payment = paymentOf(record, overrides);
        if (outcome === 'DONE') return { ok: true, payment };
        return { ok: false, outcome, code: `PAYMENT_${record.status}`, payment };
    };

    const assertConfigured = () => {
        if (flags.configMissing) throw createError('결제 설정이 올바르지 않습니다.', 503, 'CONFIG_MISSING');
    };

    const getClientKey = () => {
        assertConfigured();
        return clientKey;
    };

    const registerPayment = (paymentKey, { orderId, amount, currency = 'KRW', scenario = 'approve' }) => {
        if (!SCENARIOS.has(scenario)) throw new Error(`알 수 없는 시나리오: ${scenario}`);
        payments.set(paymentKey, {
            paymentKey, orderId, amount, currency, scenario, status: 'IN_PROGRESS', confirmCalls: 0,
        });
    };

    const hold = (paymentKey) => {
        let resolveEntered;
        let release;
        const entered = new Promise((resolve) => { resolveEntered = resolve; });
        const released = new Promise((resolve) => { release = resolve; });
        holds.set(paymentKey, { resolveEntered, released });
        return { entered, release };
    };

    const confirmPayment = async ({ paymentKey, orderId, amount }) => {
        assertConfigured();
        calls.push({
            method: 'confirm', paymentKey, orderId, amount, idempotencyKey: tossAdapter.idempotencyKeyOf(orderId),
        });

        const pending = holds.get(paymentKey);
        if (pending) {
            pending.resolveEntered();
            await pending.released;
        }

        const record = payments.get(paymentKey);
        if (!record) return { ok: false, outcome: 'REJECTED', code: 'NOT_FOUND_PAYMENT_SESSION' };
        if (record.orderId !== orderId || record.amount !== amount) {
            return { ok: false, outcome: 'REJECTED', code: 'PAYMENT_REQUEST_MISMATCH' };
        }

        record.confirmCalls += 1;
        if (record.status !== 'IN_PROGRESS') return resultFor(record);

        const first = record.confirmCalls === 1;
        switch (record.scenario) {
            case 'lost-response':
                record.status = 'DONE';
                return first ? { ok: false, outcome: 'UNKNOWN', code: 'PAYMENT_UNCERTAIN' } : resultFor(record);
            case 'unreached':
                if (first) return { ok: false, outcome: 'UNKNOWN', code: 'PAYMENT_UNCERTAIN' };
                record.status = 'DONE';
                return resultFor(record);
            case 'reject':
                record.status = 'ABORTED';
                return { ok: false, outcome: 'REJECTED', code: 'REJECT_CARD_PAYMENT' };
            case 'cancel':
                record.status = 'CANCELED';
                return resultFor(record);
            case 'expire':
                record.status = 'EXPIRED';
                return resultFor(record);
            case 'waiting':
                record.status = 'WAITING_FOR_DEPOSIT';
                return resultFor(record);
            case 'tamper-amount':
                record.status = 'DONE';
                return resultFor(record, { totalAmount: record.amount + 1 });
            case 'tamper-order':
                record.status = 'DONE';
                return resultFor(record, { orderId: `${record.orderId}-other` });
            case 'tamper-key':
                record.status = 'DONE';
                return resultFor(record, { paymentKey: `${record.paymentKey}-other` });
            default:
                record.status = 'DONE';
                return resultFor(record);
        }
    };

    const getPayment = async ({ paymentKey }) => {
        assertConfigured();
        calls.push({ method: 'get', paymentKey });
        const record = payments.get(paymentKey);
        if (!record) return { ok: false, outcome: 'REJECTED', code: 'NOT_FOUND_PAYMENT' };
        return resultFor(record);
    };

    return {
        confirmPayment,
        getPayment,
        getClientKey,
        assertConfigured,
        registerPayment,
        hold,
        calls,
        callsOf: (method) => calls.filter((call) => call.method === method),
        providerState: (paymentKey) => payments.get(paymentKey)?.status ?? null,
        setConfigMissing: (missing) => { flags.configMissing = missing; },
        clientKey,
    };
};

const ADAPTER_KEYS = ['confirmPayment', 'getPayment', 'getClientKey', 'assertConfigured'];

const installFakeAdapter = (t, fake) => {
    const originals = Object.fromEntries(ADAPTER_KEYS.map((key) => [key, tossAdapter[key]]));
    for (const key of ADAPTER_KEYS) tossAdapter[key] = fake[key];
    t.after(() => Object.assign(tossAdapter, originals));
    return fake;
};

module.exports = { createFakeTossAdapter, installFakeAdapter, FAKE_CLIENT_KEY, SCENARIOS };
