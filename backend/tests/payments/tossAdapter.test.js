'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { createTossAdapter, readConfig, CONFIRM_URL, paymentUrl, idempotencyKeyOf } = require('../../utils/adapters/toss');

const RUN = crypto.randomBytes(6).toString('hex');
const CLIENT_KEY = `test_ck_client${RUN}0000`;
const SECRET_KEY = `test_sk_secret${RUN}0000`;
const VALID_ENV = Object.freeze({ TOSS_TEST_CLIENT_KEY: CLIENT_KEY, TOSS_TEST_SECRET_KEY: SECRET_KEY });

const makeTransport = (respond) => {
    const requests = [];
    const transport = async (url, request) => {
        requests.push({ url, ...request });
        return respond(url, request, requests.length);
    };
    return { transport, requests };
};

const doneBody = (overrides = {}) => JSON.stringify({
    paymentKey: 'pay_key_1', orderId: 'order-0001', totalAmount: 1000, currency: 'KRW', status: 'DONE', ...overrides,
});

const CONFIRM_REQUEST = { paymentKey: 'pay_key_1', orderId: 'order-0001', amount: 1000 };

const BAD_CONFIGS = [
    ['키가 둘 다 없다', {}],
    ['secret이 없다', { TOSS_TEST_CLIENT_KEY: CLIENT_KEY }],
    ['client 키가 없다', { TOSS_TEST_SECRET_KEY: SECRET_KEY }],
    ['빈 문자열', { TOSS_TEST_CLIENT_KEY: '', TOSS_TEST_SECRET_KEY: '' }],
    ['live 키 세트', { TOSS_TEST_CLIENT_KEY: 'live_ck_abcdefghijkl1234', TOSS_TEST_SECRET_KEY: 'live_sk_abcdefghijkl1234' }],
    ['live secret + test client', { TOSS_TEST_CLIENT_KEY: CLIENT_KEY, TOSS_TEST_SECRET_KEY: 'live_sk_abcdefghijkl1234' }],
    ['live client + test secret', { TOSS_TEST_CLIENT_KEY: 'live_ck_abcdefghijkl1234', TOSS_TEST_SECRET_KEY: SECRET_KEY }],
    ['client와 secret 접두어가 뒤바뀜', { TOSS_TEST_CLIENT_KEY: SECRET_KEY, TOSS_TEST_SECRET_KEY: CLIENT_KEY }],
    ['접두어만 있고 본문이 없다', { TOSS_TEST_CLIENT_KEY: 'test_ck_', TOSS_TEST_SECRET_KEY: 'test_sk_' }],
    ['공백이 섞인 키', { TOSS_TEST_CLIENT_KEY: CLIENT_KEY, TOSS_TEST_SECRET_KEY: `${SECRET_KEY} ` }],
    ['접두어가 없는 키', { TOSS_TEST_CLIENT_KEY: 'abcdefghijkl1234', TOSS_TEST_SECRET_KEY: 'abcdefghijkl1234' }],
];

for (const [label, env] of BAD_CONFIGS) {
    test(`설정 미비(${label}): 승인·조회·설정 확인이 CONFIG_MISSING으로 거부되고 전송이 0회다`, async () => {
        const { transport, requests } = makeTransport(async () => { throw new Error('호출되면 안 된다'); });
        const adapter = createTossAdapter({ getEnv: () => env, transport });

        await assert.rejects(adapter.confirmPayment(CONFIRM_REQUEST), { code: 'CONFIG_MISSING' });
        await assert.rejects(adapter.getPayment({ paymentKey: 'pay_key_1' }), { code: 'CONFIG_MISSING' });
        assert.throws(() => adapter.assertConfigured(), { code: 'CONFIG_MISSING' });
        assert.equal(requests.length, 0);
    });
}

test('공개 clientKey는 test_ck_ 형식만 돌려주고 live client 키는 거부한다', () => {
    assert.equal(createTossAdapter({ getEnv: () => VALID_ENV }).getClientKey(), CLIENT_KEY);
    assert.throws(
        () => createTossAdapter({ getEnv: () => ({ TOSS_TEST_CLIENT_KEY: 'live_ck_abcdefghijkl1234' }) }).getClientKey(),
        { code: 'CONFIG_MISSING' },
    );
    assert.throws(() => createTossAdapter({ getEnv: () => ({}) }).getClientKey(), { code: 'CONFIG_MISSING' });
});

test('readConfig는 유효한 test 키 쌍만 통과시킨다', () => {
    assert.deepEqual(readConfig(VALID_ENV), { clientKey: CLIENT_KEY, secretKey: SECRET_KEY });
    assert.throws(() => readConfig({ ...VALID_ENV, TOSS_TEST_SECRET_KEY: 'live_sk_abcdefghijkl1234' }), { code: 'CONFIG_MISSING' });
});

test('환경은 호출 시점에 읽는다 — 키가 사라지면 이후 호출은 거부된다', async () => {
    let env = VALID_ENV;
    const { transport, requests } = makeTransport(async () => ({ status: 200, bodyText: doneBody() }));
    const adapter = createTossAdapter({ getEnv: () => env, transport });

    assert.equal((await adapter.confirmPayment(CONFIRM_REQUEST)).ok, true);
    env = {};
    await assert.rejects(adapter.confirmPayment(CONFIRM_REQUEST), { code: 'CONFIG_MISSING' });
    assert.equal(requests.length, 1);
});

test('정상 승인: 고정 승인 주소·POST·본문·Basic 인증(secret+":")·주문별 멱등키를 보낸다', async () => {
    const { transport, requests } = makeTransport(async () => ({ status: 200, bodyText: doneBody() }));
    const adapter = createTossAdapter({ getEnv: () => VALID_ENV, transport });

    const result = await adapter.confirmPayment(CONFIRM_REQUEST);
    assert.deepEqual(result, {
        ok: true,
        payment: { paymentKey: 'pay_key_1', orderId: 'order-0001', totalAmount: 1000, currency: 'KRW', providerStatus: 'DONE' },
    });

    assert.equal(requests.length, 1);
    const [request] = requests;
    assert.equal(request.url, 'https://api.tosspayments.com/v1/payments/confirm');
    assert.equal(request.url, CONFIRM_URL);
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.Authorization, `Basic ${Buffer.from(`${SECRET_KEY}:`).toString('base64')}`);
    assert.equal(request.headers['Idempotency-Key'], 'topup-confirm:order-0001');
    assert.equal(request.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(request.body), CONFIRM_REQUEST);
    assert.ok(Number.isInteger(request.timeoutMs) && request.timeoutMs > 0, 'timeout이 있어야 한다');
});

test('멱등키는 주문에서만 파생되어 재시도해도 같고 다른 주문과는 다르다', async () => {
    const { transport, requests } = makeTransport(async () => ({ status: 500, bodyText: '' }));
    const adapter = createTossAdapter({ getEnv: () => VALID_ENV, transport });

    await adapter.confirmPayment(CONFIRM_REQUEST);
    await adapter.confirmPayment(CONFIRM_REQUEST);
    await adapter.confirmPayment({ ...CONFIRM_REQUEST, orderId: 'order-0002' });
    assert.equal(requests[0].headers['Idempotency-Key'], requests[1].headers['Idempotency-Key']);
    assert.notEqual(requests[0].headers['Idempotency-Key'], requests[2].headers['Idempotency-Key']);
    assert.equal(idempotencyKeyOf('order-0001'), 'topup-confirm:order-0001');
});

test('결제 조회: 저장 결제키로 GET하고 Basic 인증을 보낸다(멱등키·본문은 없다)', async () => {
    const { transport, requests } = makeTransport(async () => ({ status: 200, bodyText: doneBody() }));
    const adapter = createTossAdapter({ getEnv: () => VALID_ENV, transport });

    const result = await adapter.getPayment({ paymentKey: 'pay_key_1' });
    assert.equal(result.ok, true);
    assert.equal(requests[0].url, paymentUrl('pay_key_1'));
    assert.equal(requests[0].url, 'https://api.tosspayments.com/v1/payments/pay_key_1');
    assert.equal(requests[0].method, 'GET');
    assert.equal(requests[0].headers.Authorization, `Basic ${Buffer.from(`${SECRET_KEY}:`).toString('base64')}`);
    assert.equal(requests[0].body, undefined);
    assert.equal(requests[0].headers['Idempotency-Key'], undefined);
});

test('결제키의 특수문자는 URL에서 인코딩된다', () => {
    assert.equal(paymentUrl('a/b?c'), 'https://api.tosspayments.com/v1/payments/a%2Fb%3Fc');
});

const STATUS_CASES = [
    ['ABORTED', 'FAILED'], ['EXPIRED', 'EXPIRED'], ['CANCELED', 'CANCELED'], ['PARTIAL_CANCELED', 'CANCELED'],
    ['READY', 'PENDING'], ['IN_PROGRESS', 'PENDING'], ['WAITING_FOR_DEPOSIT', 'PENDING'],
];

for (const [providerStatus, outcome] of STATUS_CASES) {
    test(`중간·실패 결제 상태 ${providerStatus}는 승인이 아니라 ${outcome}으로 판정된다`, async () => {
        const { transport } = makeTransport(async () => ({ status: 200, bodyText: doneBody({ status: providerStatus }) }));
        const adapter = createTossAdapter({ getEnv: () => VALID_ENV, transport });

        const confirmed = await adapter.confirmPayment(CONFIRM_REQUEST);
        assert.equal(confirmed.ok, false);
        assert.equal(confirmed.outcome, outcome);
        const fetched = await adapter.getPayment({ paymentKey: 'pay_key_1' });
        assert.equal(fetched.ok, false);
        assert.equal(fetched.outcome, outcome);
    });
}

test('알 수 없는 결제 상태는 성공이 아니라 UNKNOWN이다', async () => {
    const { transport } = makeTransport(async () => ({ status: 200, bodyText: doneBody({ status: 'WEIRD' }) }));
    const adapter = createTossAdapter({ getEnv: () => VALID_ENV, transport });
    const result = await adapter.confirmPayment(CONFIRM_REQUEST);
    assert.equal(result.ok, false);
    assert.equal(result.outcome, 'UNKNOWN');
});

const MISMATCH_CASES = [
    ['orderId', { orderId: 'order-9999' }],
    ['paymentKey', { paymentKey: 'pay_key_other' }],
    ['금액', { totalAmount: 1001 }],
    ['금액 타입(문자열)', { totalAmount: '1000' }],
    ['통화', { currency: 'USD' }],
];

for (const [label, overrides] of MISMATCH_CASES) {
    test(`승인 응답의 ${label}이 요청과 다르면 성공으로 판정하지 않는다`, async () => {
        const { transport } = makeTransport(async () => ({ status: 200, bodyText: doneBody(overrides) }));
        const adapter = createTossAdapter({ getEnv: () => VALID_ENV, transport });
        const result = await adapter.confirmPayment(CONFIRM_REQUEST);
        assert.equal(result.ok, false);
        assert.equal(result.outcome, 'MISMATCH');
    });
}

test('조회 응답의 결제키가 요청과 다르면 성공으로 판정하지 않는다', async () => {
    const { transport } = makeTransport(async () => ({ status: 200, bodyText: doneBody({ paymentKey: 'pay_key_other' }) }));
    const adapter = createTossAdapter({ getEnv: () => VALID_ENV, transport });
    const result = await adapter.getPayment({ paymentKey: 'pay_key_1' });
    assert.equal(result.ok, false);
    assert.equal(result.outcome, 'MISMATCH');
});

test('제공자의 확정 거절(HTTP 4xx + 오류 코드)은 REJECTED와 안정적인 코드만 돌려준다', async () => {
    const { transport } = makeTransport(async () => ({
        status: 400, bodyText: JSON.stringify({ code: 'REJECT_CARD_PAYMENT', message: '한도 초과 (개인정보가 담길 수 있는 원문)' }),
    }));
    const adapter = createTossAdapter({ getEnv: () => VALID_ENV, transport });
    const result = await adapter.confirmPayment(CONFIRM_REQUEST);
    assert.deepEqual(result, { ok: false, outcome: 'REJECTED', code: 'REJECT_CARD_PAYMENT' });
});

test('안전하지 않은 형식의 오류 코드는 PROVIDER_ERROR로 대체된다', async () => {
    const { transport } = makeTransport(async () => ({ status: 400, bodyText: JSON.stringify({ code: 'bad code <script>' }) }));
    const adapter = createTossAdapter({ getEnv: () => VALID_ENV, transport });
    assert.deepEqual(await adapter.confirmPayment(CONFIRM_REQUEST), { ok: false, outcome: 'REJECTED', code: 'PROVIDER_ERROR' });
});

const UNCERTAIN_CASES = [
    ['HTTP 500', async () => ({ status: 500, bodyText: JSON.stringify({ code: 'FAILED_INTERNAL_SYSTEM_PROCESSING' }) })],
    ['HTTP 502', async () => ({ status: 502, bodyText: '<html>bad gateway</html>' })],
    ['HTTP 401(키 문제)', async () => ({ status: 401, bodyText: JSON.stringify({ code: 'UNAUTHORIZED_KEY' }) })],
    ['HTTP 403', async () => ({ status: 403, bodyText: '{}' })],
    ['HTTP 409(같은 멱등키 처리 중)', async () => ({ status: 409, bodyText: JSON.stringify({ code: 'IDEMPOTENT_REQUEST_PROCESSING' }) })],
    ['HTTP 429', async () => ({ status: 429, bodyText: '{}' })],
    ['200인데 깨진 JSON', async () => ({ status: 200, bodyText: '{"paymentKey": "pay_key_1", ' })],
    ['200인데 JSON 배열', async () => ({ status: 200, bodyText: '[]' })],
    ['4xx인데 깨진 JSON', async () => ({ status: 400, bodyText: 'not json' })],
    ['전송 오류', async () => { throw new Error('ECONNRESET'); }],
    ['timeout', async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); }],
    ['전송 대역이 잘못된 값을 돌려줌', async () => ({ status: '200', bodyText: 1 })],
    ['빈 응답', async () => undefined],
];

for (const [label, respond] of UNCERTAIN_CASES) {
    test(`${label}는 성공도 확정 실패도 아닌 승인 불명(UNKNOWN)이다`, async () => {
        const { transport } = makeTransport(respond);
        const adapter = createTossAdapter({ getEnv: () => VALID_ENV, transport });

        const confirmed = await adapter.confirmPayment(CONFIRM_REQUEST);
        assert.equal(confirmed.ok, false);
        assert.equal(confirmed.outcome, 'UNKNOWN');
        assert.equal(typeof confirmed.code, 'string');
        const fetched = await adapter.getPayment({ paymentKey: 'pay_key_1' });
        assert.equal(fetched.ok, false);
        assert.equal(fetched.outcome, 'UNKNOWN');
    });
}

test('결과 객체·오류 어디에도 secret, Basic 값, 요청·응답·오류 원문이 없다', async () => {
    const leak = `LEAK_${RUN}`;
    const basic = Buffer.from(`${SECRET_KEY}:`).toString('base64');
    const secretPlain = Buffer.from(SECRET_KEY).toString('base64');
    const responders = [
        async () => { throw new Error(`transport failed ${leak} ${SECRET_KEY} ${basic}`); },
        async () => ({ status: 500, bodyText: `server error ${leak} ${SECRET_KEY}` }),
        async () => ({ status: 400, bodyText: JSON.stringify({ code: 'REJECT_CARD_PAYMENT', message: leak, secret: SECRET_KEY }) }),
        async () => ({ status: 200, bodyText: `{"broken": "${leak}` }),
        async () => ({ status: 200, bodyText: doneBody({ memo: leak, secret: SECRET_KEY }) }),
    ];
    const forbidden = [leak, SECRET_KEY, basic, secretPlain, CLIENT_KEY];

    for (const respond of responders) {
        const { transport } = makeTransport(respond);
        const adapter = createTossAdapter({ getEnv: () => VALID_ENV, transport });
        for (const call of [() => adapter.confirmPayment(CONFIRM_REQUEST), () => adapter.getPayment({ paymentKey: 'pay_key_1' })]) {
            const result = await call();
            const serialized = JSON.stringify(result);
            for (const needle of forbidden) {
                assert.ok(!serialized.includes(needle), `결과에 ${needle.slice(0, 12)}…가 있으면 안 된다: ${serialized}`);
            }
        }
    }

    const badSecret = `live_sk_${leak}0000000`;
    const adapter = createTossAdapter({ getEnv: () => ({ TOSS_TEST_CLIENT_KEY: CLIENT_KEY, TOSS_TEST_SECRET_KEY: badSecret }) });
    const error = await adapter.confirmPayment(CONFIRM_REQUEST).catch((e) => e);
    assert.equal(error.code, 'CONFIG_MISSING');
    assert.ok(!`${error.message}${error.stack}${JSON.stringify(error)}`.includes(badSecret));
    assert.ok(!`${error.message}${error.stack}`.includes(CLIENT_KEY));
});
