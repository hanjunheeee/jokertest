'use strict';

// N-7 토스 운영 키 시험: 운영은 live 키 우선(없으면 test + 켤 때 경고), 개발·시험은 test 키만, 묶음 섞기 안 됨
// 진짜 토스 안 부름 (전송은 가짜)
const test   = require('node:test');
const assert = require('node:assert/strict');

const { readConfig, readClientKey, describeKeyWarning, createTossAdapter, basicAuthHeader } = require('../../utils/adapters/toss');

const TEST = Object.freeze({ TOSS_TEST_CLIENT_KEY: 'test_ck_n7client00000001', TOSS_TEST_SECRET_KEY: 'test_sk_n7secret00000001' });
const LIVE = Object.freeze({ TOSS_LIVE_CLIENT_KEY: 'live_ck_n7client00000001', TOSS_LIVE_SECRET_KEY: 'live_sk_n7secret00000001' });
const PROD = Object.freeze({ NODE_ENV: 'production' });
const DEV_ENVS = [{ NODE_ENV: 'development' }, { NODE_ENV: 'test' }, {}];

test('운영: live 키 둘 다 있으면 live 키를 씀 (test 키가 같이 있어도)', () => {
    for (const env of [{ ...PROD, ...LIVE }, { ...PROD, ...LIVE, ...TEST }]) {
        assert.deepEqual(readConfig(env), { clientKey: LIVE.TOSS_LIVE_CLIENT_KEY, secretKey: LIVE.TOSS_LIVE_SECRET_KEY });
        assert.equal(readClientKey(env), LIVE.TOSS_LIVE_CLIENT_KEY);
        assert.equal(describeKeyWarning(env), null);
    }
});

test('운영: live 키 없으면 test 키로 돌고 켤 때 경고 (키 값은 안 찍음)', () => {
    const env = { ...PROD, ...TEST };
    assert.deepEqual(readConfig(env), { clientKey: TEST.TOSS_TEST_CLIENT_KEY, secretKey: TEST.TOSS_TEST_SECRET_KEY });
    assert.equal(readClientKey({ ...env, TOSS_LIVE_CLIENT_KEY: '  ', TOSS_LIVE_SECRET_KEY: '' }), TEST.TOSS_TEST_CLIENT_KEY);
    const warning = describeKeyWarning(env);
    assert.match(warning, /시험 키/);
    assert.match(warning, /돈이 안 들어옴/);
    assert.equal(warning.includes(TEST.TOSS_TEST_CLIENT_KEY) || warning.includes(TEST.TOSS_TEST_SECRET_KEY), false);
});

test('운영: live 키를 하나라도 넣으면 live만, 틀리거나 하나 빠지면 503 (test로 안 내려감)', () => {
    const broken = [
        { TOSS_LIVE_CLIENT_KEY: LIVE.TOSS_LIVE_CLIENT_KEY },
        { TOSS_LIVE_SECRET_KEY: LIVE.TOSS_LIVE_SECRET_KEY },
        { ...LIVE, TOSS_LIVE_SECRET_KEY: 'test_sk_n7secret00000001' },
        { ...LIVE, TOSS_LIVE_CLIENT_KEY: 'test_ck_n7client00000001' },
        { ...LIVE, TOSS_LIVE_CLIENT_KEY: 'live_ck_short' },
        { TOSS_LIVE_CLIENT_KEY: LIVE.TOSS_LIVE_SECRET_KEY, TOSS_LIVE_SECRET_KEY: LIVE.TOSS_LIVE_CLIENT_KEY },
    ];
    for (const live of broken) {
        const env = { ...PROD, ...TEST, ...live };
        assert.throws(() => readConfig(env), { code: 'CONFIG_MISSING', status: 503 }, JSON.stringify(Object.keys(live)));
        assert.match(describeKeyWarning(env), /운영 키/);
    }
    // 클라이언트 키만 맞으면 결제창 키는 줌 (승인은 503)
    assert.equal(readClientKey({ ...PROD, TOSS_LIVE_CLIENT_KEY: LIVE.TOSS_LIVE_CLIENT_KEY }), LIVE.TOSS_LIVE_CLIENT_KEY);
});

test('운영: live 이름에 test 키·test 이름에 live 키는 안 받음', () => {
    assert.throws(() => readConfig({ ...PROD, TOSS_TEST_CLIENT_KEY: LIVE.TOSS_LIVE_CLIENT_KEY, TOSS_TEST_SECRET_KEY: LIVE.TOSS_LIVE_SECRET_KEY }), { code: 'CONFIG_MISSING' });
    assert.throws(() => readConfig({ ...PROD, TOSS_LIVE_CLIENT_KEY: TEST.TOSS_TEST_CLIENT_KEY, TOSS_LIVE_SECRET_KEY: TEST.TOSS_TEST_SECRET_KEY }), { code: 'CONFIG_MISSING' });
    assert.equal(describeKeyWarning(PROD), '토스 키 없음 — 충전이 "설정 대기"(503)');
});

test('개발·시험: live 키는 무시하고 test 키만 (live만 있으면 503)', () => {
    for (const base of DEV_ENVS) {
        assert.deepEqual(readConfig({ ...base, ...LIVE, ...TEST }), { clientKey: TEST.TOSS_TEST_CLIENT_KEY, secretKey: TEST.TOSS_TEST_SECRET_KEY });
        assert.throws(() => readConfig({ ...base, ...LIVE }), { code: 'CONFIG_MISSING' });
        assert.throws(() => readClientKey({ ...base, ...LIVE }), { code: 'CONFIG_MISSING' });
        assert.match(describeKeyWarning({ ...base, ...LIVE }), /안 씀/);
        assert.equal(describeKeyWarning({ ...base, ...TEST }), null);
        assert.equal(describeKeyWarning(base), null);
    }
});

test('어댑터: 운영 live 키면 승인 요청에 live 비밀 키 인증, 개발이면 test 비밀 키', async () => {
    const calls = [];
    const transport = async (url, request) => {
        calls.push(request.headers.Authorization);
        const body = JSON.parse(request.body);
        return { status: 200, bodyText: JSON.stringify({ status: 'DONE', paymentKey: body.paymentKey, orderId: body.orderId, totalAmount: body.amount, currency: 'KRW' }) };
    };
    const order = { paymentKey: 'pk_n7_0001', orderId: 'order_n7_0001', amount: 1000 };

    const prod = createTossAdapter({ getEnv: () => ({ ...PROD, ...LIVE, ...TEST }), transport });
    assert.equal(prod.getClientKey(), LIVE.TOSS_LIVE_CLIENT_KEY);
    assert.equal((await prod.confirmPayment(order)).ok, true);

    const dev = createTossAdapter({ getEnv: () => ({ NODE_ENV: 'development', ...LIVE, ...TEST }), transport });
    assert.equal(dev.getClientKey(), TEST.TOSS_TEST_CLIENT_KEY);
    assert.equal((await dev.confirmPayment(order)).ok, true);

    assert.deepEqual(calls, [basicAuthHeader(LIVE.TOSS_LIVE_SECRET_KEY), basicAuthHeader(TEST.TOSS_TEST_SECRET_KEY)]);
});
