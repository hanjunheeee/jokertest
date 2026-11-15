'use strict';

// 토스 키 고르기 시험: 환경값 묶음을 어댑터에 넣고 결제창 키·승인 때 보내는 비밀 키·503·켤 때 경고 글을 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-071~080 (돌리기: node --env-file=.env.test --test tests/unit/a12-toss-keys.test.js)
// 키는 전부 앞말만 맞는 지어낸 값, 전송은 가짜라 결제사로 안 나감
const test = require('node:test');
const assert = require('node:assert/strict');

const { createTossAdapter, describeKeyWarning } = require('../../utils/adapters/toss');

// 지어낸 키 (앞말만 진짜 모양)
const KEYS = Object.freeze({
    testClient: 'test_ck_A12FAKEKEYSTEST0001',
    testSecret: 'test_sk_A12FAKEKEYSTEST0001',
    liveClient: 'live_ck_A12FAKEKEYSLIVE0001',
    liveSecret: 'live_sk_A12FAKEKEYSLIVE0001',
});

const TEST_KEYS = { TOSS_TEST_CLIENT_KEY: KEYS.testClient, TOSS_TEST_SECRET_KEY: KEYS.testSecret };
const LIVE_KEYS = { TOSS_LIVE_CLIENT_KEY: KEYS.liveClient, TOSS_LIVE_SECRET_KEY: KEYS.liveSecret };

const REQUEST = Object.freeze({ paymentKey: 'pk_a12_keys_0001', orderId: 'a12-keys-order-0001', amount: 1100 });

// 결제사에 가는 인증 머리글 (비밀 키 + ':' 를 base64로, 토스 규칙)
const basicOf = (secret) => `Basic ${Buffer.from(`${secret}:`).toString('base64')}`;

// 가짜 전송을 넣은 어댑터 (보낸 머리글을 모아 둠)
const adapterFor = (env) => {
    const sent = [];
    const transport = async (url, request) => {
        sent.push(request);
        return { status: 200, bodyText: JSON.stringify({ ...REQUEST, totalAmount: REQUEST.amount, currency: 'KRW', status: 'DONE' }) };
    };
    return { adapter: createTossAdapter({ getEnv: () => env, transport }), sent };
};

// 이 묶음 키로 돎: 결제창 키 = 그 클라이언트 키, 승인 인증 = 그 비밀 키
const assertUses = async (env, client, secret) => {
    const { adapter, sent } = adapterFor(env);
    assert.equal(adapter.getClientKey(), client);
    adapter.assertConfigured();
    await adapter.confirmPayment(REQUEST);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].headers.Authorization, basicOf(secret));
};

// 503 CONFIG_MISSING (승인 전 설정 확인에서)
const assertMissing = (env) => {
    const { adapter, sent } = adapterFor(env);
    assert.throws(() => adapter.assertConfigured(), (error) => error.status === 503 && error.code === 'CONFIG_MISSING');
    assert.equal(sent.length, 0);
};

test('A12-B-071 개발 + 시험 키 → 시험 키', async () => {
    await assertUses({ NODE_ENV: 'development', ...TEST_KEYS }, KEYS.testClient, KEYS.testSecret);
});

test('A12-B-072 개발 + 운영 키도 있음 → 시험 키 (운영 키 무시)', async () => {
    await assertUses({ NODE_ENV: 'development', ...TEST_KEYS, ...LIVE_KEYS }, KEYS.testClient, KEYS.testSecret);
});

test('A12-B-073 운영 + 운영 키 둘 다 모양 맞음 → 운영 키', async () => {
    await assertUses({ NODE_ENV: 'production', ...TEST_KEYS, ...LIVE_KEYS }, KEYS.liveClient, KEYS.liveSecret);
});

test('A12-B-074 운영 + 운영 키 하나 빠짐 → 503 CONFIG_MISSING (시험 키로 안 내려감)', async () => {
    assertMissing({ NODE_ENV: 'production', ...TEST_KEYS, TOSS_LIVE_CLIENT_KEY: KEYS.liveClient });
    // 결제창 키도 시험 키로 내려가지 않음
    const { adapter } = adapterFor({ NODE_ENV: 'production', ...TEST_KEYS, TOSS_LIVE_SECRET_KEY: KEYS.liveSecret });
    assert.throws(() => adapter.getClientKey(), (error) => error.status === 503 && error.code === 'CONFIG_MISSING');
});

test('A12-B-075 운영 + 운영 키 모양 틀림 → 503', () => {
    assertMissing({ NODE_ENV: 'production', ...TEST_KEYS, TOSS_LIVE_CLIENT_KEY: 'live_ck_short', TOSS_LIVE_SECRET_KEY: 'live_sk_short' });
});

test('A12-B-076 운영 + 운영 키 없음 → 시험 키로 돎 + 켤 때 경고', async () => {
    const env = { NODE_ENV: 'production', ...TEST_KEYS };
    await assertUses(env, KEYS.testClient, KEYS.testSecret);
    const warning = describeKeyWarning(env);
    assert.equal(typeof warning, 'string');
    assert.ok(warning.length > 0);
});

test('A12-B-077 시험 클라이언트 키 + 운영 비밀 키 섞임 → 503', () => {
    assertMissing({ NODE_ENV: 'development', TOSS_TEST_CLIENT_KEY: KEYS.testClient, TOSS_TEST_SECRET_KEY: KEYS.liveSecret });
});

test('A12-B-078 키 하나도 없음 → 503', () => {
    assertMissing({ NODE_ENV: 'development' });
    const { adapter } = adapterFor({ NODE_ENV: 'development' });
    assert.throws(() => adapter.getClientKey(), (error) => error.status === 503 && error.code === 'CONFIG_MISSING');
});

test('A12-B-079 결제위젯 키 모양(test_gck_ 앞말) → 503', () => {
    const env = { NODE_ENV: 'development', TOSS_TEST_CLIENT_KEY: 'test_gck_A12FAKEWIDGET0001', TOSS_TEST_SECRET_KEY: 'test_gsk_A12FAKEWIDGET0001' };
    assertMissing(env);
    const { adapter } = adapterFor(env);
    assert.throws(() => adapter.getClientKey(), (error) => error.status === 503 && error.code === 'CONFIG_MISSING');
});

test('A12-B-080 켤 때 경고 글에 키 값 글자 없음', () => {
    const cases = [
        { NODE_ENV: 'development', ...TEST_KEYS, ...LIVE_KEYS },
        { NODE_ENV: 'production', ...TEST_KEYS },
        { NODE_ENV: 'production', TOSS_LIVE_CLIENT_KEY: KEYS.liveClient, TOSS_LIVE_SECRET_KEY: 'live_sk_short' },
    ];
    for (const env of cases) {
        const warning = describeKeyWarning(env);
        assert.equal(typeof warning, 'string', `경고 없음: ${env.NODE_ENV}`);
        for (const value of [...Object.values(KEYS), 'live_sk_short']) {
            assert.ok(!warning.includes(value), '경고 글에 키 값이 들어감');
            // 키 뒷말(앞말 뺀 부분)도 안 들어감
            assert.ok(!warning.includes(value.slice(8)), '경고 글에 키 뒷말이 들어감');
        }
    }
});
