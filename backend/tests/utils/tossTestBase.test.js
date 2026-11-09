'use strict';

// 가짜 토스 승인 서버 주소(TOSS_API_BASE_URL) 시험 파일, 시험 손잡이 켜졌을 때만 그 주소로 보내고 운영이면 시작 거부
// utils/adapters/toss.js apiOriginOf·config/e2eHooks.js assertNoE2eInProduction 확인 (값 없으면 예전 주소 그대로)
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTossAdapter, apiOriginOf, CONFIRM_URL } = require('../../utils/adapters/toss');
const { assertNoE2eInProduction, E2E_ONLY_KEYS } = require('../../config/e2eHooks');

const KEYS = Object.freeze({ TOSS_TEST_CLIENT_KEY: 'test_ck_basetest00000001', TOSS_TEST_SECRET_KEY: 'test_sk_basetest00000001' });
const FAKE = 'http://127.0.0.1:4165';
const REAL = 'https://api.tosspayments.com';

// 보낸 주소만 모으는 가짜 전송 (DONE 결제로 답함)
const recorder = () => {
    const urls = [];
    const transport = async (url, request) => {
        urls.push(url);
        const body = request.body ? JSON.parse(request.body) : { paymentKey: 'pk_1', orderId: 'order-0001', amount: 1000 };
        return { status: 200, bodyText: JSON.stringify({ status: 'DONE', paymentKey: body.paymentKey ?? 'pk_1', orderId: body.orderId ?? 'order-0001', totalAmount: body.amount ?? 1000, currency: 'KRW' }) };
    };
    return { urls, transport };
};

test('값이 없으면 → 진짜 토스 주소 그대로 (예전과 같음)', async () => {
    assert.equal(apiOriginOf({}), REAL);
    assert.equal(apiOriginOf({ E2E_HOOKS: '1' }), REAL);
    const { urls, transport } = recorder();
    const adapter = createTossAdapter({ getEnv: () => ({ ...KEYS }), transport });
    await adapter.confirmPayment({ paymentKey: 'pk_1', orderId: 'order-0001', amount: 1000 });
    await adapter.getPayment({ paymentKey: 'pk_1' });
    assert.deepEqual(urls, [CONFIRM_URL, `${REAL}/v1/payments/pk_1`]);
});

test('E2E_HOOKS=1 + 값 있으면 → 승인·조회 둘 다 가짜 서버로 (끝 빗금 뗌)', async () => {
    const env = { ...KEYS, E2E_HOOKS: '1', TOSS_API_BASE_URL: ` ${FAKE}/ ` };
    assert.equal(apiOriginOf(env), FAKE);
    const { urls, transport } = recorder();
    const adapter = createTossAdapter({ getEnv: () => env, transport });
    const confirmed = await adapter.confirmPayment({ paymentKey: 'pk_1', orderId: 'order-0001', amount: 1000 });
    assert.equal(confirmed.ok, true);
    await adapter.getPayment({ paymentKey: 'pk_1' });
    assert.deepEqual(urls, [`${FAKE}/v1/payments/confirm`, `${FAKE}/v1/payments/pk_1`]);
});

test('E2E_HOOKS가 1이 아니면 → 값이 있어도 진짜 주소', () => {
    assert.equal(apiOriginOf({ E2E_HOOKS: '0', TOSS_API_BASE_URL: FAKE }), REAL);
    assert.equal(apiOriginOf({ TOSS_API_BASE_URL: FAKE }), REAL);
});

test('운영이면 → 주소는 늘 진짜, 값이 있으면 시작 거부(E2E_IN_PRODUCTION), 이름만 알리고 값은 안 찍음', () => {
    const env = { NODE_ENV: 'production', E2E_HOOKS: '1', TOSS_API_BASE_URL: FAKE };
    assert.equal(apiOriginOf(env), REAL);
    assert.ok(E2E_ONLY_KEYS.includes('TOSS_API_BASE_URL'));
    assert.throws(() => assertNoE2eInProduction({ NODE_ENV: 'production', TOSS_API_BASE_URL: FAKE }), (error) => {
        assert.equal(error.code, 'E2E_IN_PRODUCTION');
        assert.match(error.message, /TOSS_API_BASE_URL/);
        assert.doesNotMatch(error.message, /127\.0\.0\.1/);
        return true;
    });
    assert.doesNotThrow(() => assertNoE2eInProduction({ NODE_ENV: 'production' }));
    assert.doesNotThrow(() => assertNoE2eInProduction({ NODE_ENV: 'development', TOSS_API_BASE_URL: FAKE }));
});
