'use strict';

// F-32a 시험 전용 가짜 결제 어댑터. 실제 결제 없이 승인·실패·취소·응답 유실·지연·변조 응답과
// 동시 요청을 재현한다. backend/payments/tossAdapter.js와 같은 인터페이스(confirmPayment·
// getPayment·getClientKey·assertConfigured)와 같은 결과 형식을 제공하고, 제공자 쪽 결제 상태를
// 서비스 인스턴스와 독립적으로 이 객체가 보관한다 — 서비스를 새로 만들어도(메모리를 비워도)
// 같은 제공자 상태를 조회한다.
//
// 운영 코드에서 이 파일을 고르는 경로는 없다(환경변수 스위치 없음). 시험이 installFakeAdapter로
// tossAdapter 모듈 객체의 함수를 일시적으로 바꿔 끼우고 t.after에서 원래 함수를 복원한다.
// 이 파일과 시험에 나오는 상품 수치(1000원 → 100 + 보너스 10 등)는 **자동 시험용 임시값**이며
// 최종 상품 정책이 아니다.

const tossAdapter = require('../../payments/tossAdapter');
const { createError } = require('../../utils/appError');

const FAKE_CLIENT_KEY = 'test_ck_fakeclientkey0000000000000001';

// scenario — confirmPayment가 첫 호출에서 하는 일(이후 호출은 제공자 상태를 그대로 따른다):
//   approve         승인 성공(DONE)
//   lost-response   제공자는 승인(DONE)했지만 응답이 유실되어 서비스는 UNKNOWN을 받는다
//   unreached       요청이 제공자에 닿기 전 실패 — 상태는 IN_PROGRESS 그대로, UNKNOWN을 받는다
//   reject          제공자가 확정적으로 거절(REJECTED, 상태 ABORTED)
//   cancel          결제 취소(CANCELED)
//   expire          결제 만료(EXPIRED)
//   waiting         입금 대기(WAITING_FOR_DEPOSIT, PENDING)
//   tamper-amount / tamper-order / tamper-key   ok:true지만 응답 데이터가 요청과 다르다(변조)
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

    /** 제공자 쪽에 "사용자가 결제창에서 인증을 마친" 결제를 등록한다. */
    const registerPayment = (paymentKey, { orderId, amount, currency = 'KRW', scenario = 'approve' }) => {
        if (!SCENARIOS.has(scenario)) throw new Error(`알 수 없는 시나리오: ${scenario}`);
        payments.set(paymentKey, {
            paymentKey, orderId, amount, currency, scenario, status: 'IN_PROGRESS', confirmCalls: 0,
        });
    };

    /** 다음 confirmPayment가 제공자에 도달한 뒤 release()까지 멈추게 한다(동시 요청·잠금 검사용). */
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
        // 이미 종단 상태면 제공자는 그 상태를 그대로 돌려준다(같은 멱등키의 재요청).
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
        // ── 시험 제어·관찰 ──
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

/** tossAdapter 모듈 객체의 함수를 가짜로 바꿔 끼우고 t.after에서 원래 함수를 복원한다. */
const installFakeAdapter = (t, fake) => {
    const originals = Object.fromEntries(ADAPTER_KEYS.map((key) => [key, tossAdapter[key]]));
    for (const key of ADAPTER_KEYS) tossAdapter[key] = fake[key];
    t.after(() => Object.assign(tossAdapter, originals));
    return fake;
};

module.exports = { createFakeTossAdapter, installFakeAdapter, FAKE_CLIENT_KEY, SCENARIOS };
