'use strict';

// 토스 어댑터 시험: 가짜 전송(transport)을 넣은 어댑터에 결제사 답을 주고 우리 결과·다시 맞춤·멱등 키 머리글을 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A12-상점-결제.md A12-B-045~070 (돌리기: node --env-file=.env.test --test tests/unit/a12-toss-adapter.test.js)
// 진짜 토스 주소로는 안 나감: 전송은 늘 가짜, 10초 시험만 이 컴퓨터 안 빈 서버로 감
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createTossAdapter } = require('../../utils/adapters/toss');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');

// 앞말만 맞는 지어낸 시험 키 (진짜 키 아님)
const ENV = Object.freeze({
    TOSS_TEST_CLIENT_KEY: 'test_ck_A12FAKEFAKEFAKE0001',
    TOSS_TEST_SECRET_KEY: 'test_sk_A12FAKEFAKEFAKE0001',
});

const REQUEST = Object.freeze({ paymentKey: 'pk_a12_unit_0001', orderId: 'a12-unit-order-0001', amount: 1100 });

// 결제사 결제 본문 (보낸 결제와 같은 값, 상태만 바꿔 씀)
const paymentBody = (overrides = {}) => ({
    paymentKey: REQUEST.paymentKey, orderId: REQUEST.orderId, totalAmount: REQUEST.amount, currency: 'KRW', status: 'DONE', ...overrides,
});

// 가짜 전송: 정한 답을 주고 보낸 요청은 모아 둠
const fakeTransport = (reply) => {
    const sent = [];
    const transport = async (url, request) => {
        sent.push({ url, ...request });
        return typeof reply === 'function' ? reply(url, request) : reply;
    };
    return { transport, sent };
};

const adapterWith = (reply) => {
    const fake = fakeTransport(reply);
    return { adapter: createTossAdapter({ getEnv: () => ENV, transport: fake.transport }), sent: fake.sent };
};

const ok200 = (body) => ({ status: 200, bodyText: JSON.stringify(body) });

// ── A12-B-045~053: 결제사 결제 상태 → 우리 결과 ──

const STATES = [
    ['A12-B-045', 'DONE', '성공'],
    ['A12-B-046', 'ABORTED', '실패'],
    ['A12-B-047', 'EXPIRED', '만료'],
    ['A12-B-048', 'CANCELED', '취소'],
    ['A12-B-049', 'PARTIAL_CANCELED', '취소'],
    ['A12-B-050', 'READY', '진행 중'],
    ['A12-B-051', 'IN_PROGRESS', '진행 중'],
    ['A12-B-052', 'WAITING_FOR_DEPOSIT', '진행 중'],
    ['A12-B-053', 'SOMETHING_NEW', '결과 모름'],
];
// 우리 결과 이름 → 어댑터가 돌려주는 모양
const OUTCOME_OF = { 실패: 'FAILED', 만료: 'EXPIRED', 취소: 'CANCELED', '진행 중': 'PENDING', '결과 모름': 'UNKNOWN' };
for (const [id, state, ours] of STATES) {
    test(`${id} 결제사 상태 ${state} → ${ours}`, async () => {
        const { adapter } = adapterWith(ok200(paymentBody({ status: state })));
        const result = await adapter.getPayment({ paymentKey: REQUEST.paymentKey });
        if (ours === '성공') {
            assert.equal(result.ok, true);
            return;
        }
        assert.equal(result.ok, false);
        assert.equal(result.outcome, OUTCOME_OF[ours]);
    });
}

// ── A12-B-054~061: 결제사 답이 이상하면 성공·실패로 단정 안 함 ──

const ODD = [
    ['A12-B-054', '200인데 모양 틀림', () => ok200({ hello: 'world' })],
    ['A12-B-055', '401', () => ({ status: 401, bodyText: JSON.stringify({ code: 'UNAUTHORIZED_KEY' }) })],
    ['A12-B-056', '403', () => ({ status: 403, bodyText: JSON.stringify({ code: 'FORBIDDEN_REQUEST' }) })],
    ['A12-B-057', '409', () => ({ status: 409, bodyText: JSON.stringify({ code: 'ALREADY_PROCESSING' }) })],
    ['A12-B-058', '429', () => ({ status: 429, bodyText: JSON.stringify({ code: 'TOO_MANY_REQUESTS' }) })],
    ['A12-B-059', '500', () => ({ status: 500, bodyText: JSON.stringify({ code: 'FAILED_INTERNAL_SYSTEM_PROCESSING' }) })],
    ['A12-B-060', '보내다 끊김', () => { throw new Error('socket hang up'); }],
];
for (const [id, label, reply] of ODD) {
    test(`${id} 결제사 답 ${label} → 결과 모름 (나중에 다시 물음)`, async () => {
        const { adapter } = adapterWith(reply);
        const result = await adapter.confirmPayment(REQUEST);
        assert.equal(result.ok, false);
        assert.equal(result.outcome, 'UNKNOWN');
    });
}

test('A12-B-061 결제사 답이 10초 넘음 → 결과 모름 (9.999초엔 아직 기다림)', async (t) => {
    // 받기만 하고 답 안 하는 빈 서버 (이 컴퓨터 안)
    let entered;
    const arrived = new Promise((resolve) => { entered = resolve; });
    const server = http.createServer(() => entered());
    const { url } = await listenOnFetchablePort(server);
    t.after(() => { server.closeAllConnections?.(); return new Promise((resolve) => server.close(resolve)); });
    // 시험 손잡이 주소로만 보냄 (운영 아님 + E2E_HOOKS=1일 때만 이 주소를 씀)
    const adapter = createTossAdapter({ getEnv: () => ({ ...ENV, E2E_HOOKS: '1', TOSS_API_BASE_URL: url }) });
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let settled = null;
    const pending = adapter.confirmPayment(REQUEST).then((result) => { settled = result; return result; });
    await arrived;
    t.mock.timers.tick(9_999);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, null, '10초 전에 끝남');
    t.mock.timers.tick(1);
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.outcome, 'UNKNOWN');
});

// ── A12-B-062~063: 결제사 4xx ──

test('A12-B-062 400 + 읽히는 본문 → 거절 (코드는 대문자·숫자·_ 모양만, 아니면 PROVIDER_ERROR)', async () => {
    const safe = adapterWith({ status: 400, bodyText: JSON.stringify({ code: 'REJECT_CARD_COMPANY', message: '카드사 거절' }) });
    const kept = await safe.adapter.confirmPayment(REQUEST);
    assert.equal(kept.ok, false);
    assert.equal(kept.outcome, 'REJECTED');
    assert.equal(kept.code, 'REJECT_CARD_COMPANY');

    const odd = adapterWith({ status: 400, bodyText: JSON.stringify({ code: 'bad code<script>', message: '?' }) });
    const replaced = await odd.adapter.confirmPayment(REQUEST);
    assert.equal(replaced.outcome, 'REJECTED');
    assert.equal(replaced.code, 'PROVIDER_ERROR');
});

test('A12-B-063 400 + 못 읽는 본문 → 결과 모름', async () => {
    const { adapter } = adapterWith({ status: 400, bodyText: '<html>bad gateway</html>' });
    const result = await adapter.confirmPayment(REQUEST);
    assert.equal(result.ok, false);
    assert.equal(result.outcome, 'UNKNOWN');
});

// ── A12-B-064~068: 결제사 답을 주문과 다시 맞춤 ──

const MATCHES = [
    ['A12-B-064', '결제 키 다름', { paymentKey: 'pk_a12_unit_other' }, false],
    ['A12-B-065', '주문 id 다름', { orderId: 'a12-unit-order-other' }, false],
    ['A12-B-066', '금액 다름', { totalAmount: 1101 }, false],
    ['A12-B-067', '통화 USD', { currency: 'USD' }, false],
    ['A12-B-068', '다 같음', {}, true],
];
for (const [id, label, change, same] of MATCHES) {
    test(`${id} 승인 답 ${label} → ${same ? '맞음' : '안 맞음'}`, async () => {
        const { adapter } = adapterWith(ok200(paymentBody(change)));
        const result = await adapter.confirmPayment(REQUEST);
        if (same) {
            assert.equal(result.ok, true);
            return;
        }
        assert.equal(result.ok, false);
        assert.equal(result.outcome, 'MISMATCH');
    });
}

// ── A12-B-069~070: 같은 주문 승인은 같은 멱등 키 ──

// 보낸 요청의 멱등 키 머리글
const idempotencyOf = (request) => request.headers['Idempotency-Key'];

test('A12-B-069 같은 주문 두 번 승인 → 머리글 Idempotency-Key 같음', async () => {
    const { adapter, sent } = adapterWith(ok200(paymentBody()));
    await adapter.confirmPayment(REQUEST);
    await adapter.confirmPayment(REQUEST);
    assert.equal(sent.length, 2);
    assert.equal(typeof idempotencyOf(sent[0]), 'string');
    assert.ok(idempotencyOf(sent[0]).length > 0);
    assert.equal(idempotencyOf(sent[0]), idempotencyOf(sent[1]));
});

test('A12-B-070 다른 주문 승인 → 머리글 Idempotency-Key 다름', async () => {
    const { adapter, sent } = adapterWith((url, request) => ok200(paymentBody({ orderId: JSON.parse(request.body).orderId })));
    await adapter.confirmPayment(REQUEST);
    await adapter.confirmPayment({ ...REQUEST, orderId: 'a12-unit-order-0002' });
    assert.equal(sent.length, 2);
    assert.notEqual(idempotencyOf(sent[0]), idempotencyOf(sent[1]));
});
