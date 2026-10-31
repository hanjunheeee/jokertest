'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { globalErrorHandler } = require('../middleware/errorHandler');
const { createError } = require('../utils/appError');

const MARK = `SECRETMARK${crypto.randomBytes(6).toString('hex')}`;

const makeRes = () => {
    const res = {
        headersSent: false, statusCode: null, headers: {}, body: undefined,
        set(name, value) { res.headers[name.toLowerCase()] = value; return res; },
        status(code) { res.statusCode = code; return res; },
        json(body) { res.body = body; return res; },
    };
    return res;
};

const captureConsole = (t) => {
    const lines = [];
    const originals = {};
    for (const name of ['log', 'info', 'warn', 'error']) {
        originals[name] = console[name];
        console[name] = (...args) => { lines.push(args.map(String).join(' ')); };
    }
    t.after(() => Object.assign(console, originals));
    return lines;
};

const run = (err, url, { method = 'POST' } = {}) => {
    const res = makeRes();
    let passedOn = null;
    globalErrorHandler(err, { originalUrl: url, url, method }, res, (error) => { passedOn = error; });
    return { res, passedOn };
};

const SCOPED_PATHS = [
    '/economy/currency-products',
    '/economy/currency-products?kind=DIAMOND_TOPUP',
    '/economy/topup/orders',
    '/economy/topup/orders/',
    '/economy/topup/orders/abc-123456/confirm',
    '/economy/topup/orders/abc-123456?x=1',
    '/ECONOMY/Topup/Orders/abc-123456',
    '/economy/topup',
];

test('신규 범위 판별: 쿼리·후행 슬래시·대소문자 변형이 모두 같은 안전 분기를 탄다', (t) => {
    captureConsole(t);
    for (const url of SCOPED_PATHS) {
        const { res } = run(new Error(`raw ${MARK}`), url);
        assert.equal(res.statusCode, 500, url);
        assert.deepEqual(res.body, { ok: false, code: 'SERVER_ERROR', message: '서버 내부에서 에러가 발생했습니다.' }, url);
        assert.equal(res.headers['cache-control'], 'no-store', url);
    }
});

test('범위 밖 경로는 기존 일반 분기를 그대로 쓴다(메시지·code 응답, 개발 환경 stack)', (t) => {
    captureConsole(t);
    const saved = process.env.NODE_ENV;
    t.after(() => { if (saved === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved; });
    process.env.NODE_ENV = 'development';

    for (const url of ['/economy/purchase', '/economy/currency-productsX', '/economy/topups', '/economy/accounts/u/wallet']) {
        const { res } = run(createError('boom', 418, 'SOME_CODE'), url);
        assert.equal(res.statusCode, 418, url);
        assert.equal(res.body.message, 'boom', url);
        assert.equal(res.body.code, 'SOME_CODE', url);
        assert.equal(typeof res.body.error, 'string', `${url}: 기존 분기는 개발 환경에서 stack을 돌려준다`);
    }
});

test('계약의 오류 코드는 원본과 무관한 고정 상태·고정 문구로 응답한다', (t) => {
    captureConsole(t);
    const expected = {
        INVALID_PRODUCT_KIND: 400, UNKNOWN_TOPUP_ORDER_FIELD: 400, INVALID_TOPUP_ORDER_REQUEST: 400,
        UNKNOWN_TOPUP_CONFIRM_FIELD: 400, INVALID_TOPUP_CONFIRM_REQUEST: 400, PRODUCT_NOT_FOUND: 404,
        PRODUCT_STOPPED: 409, PRODUCT_VERSION_MISMATCH: 409, ORDER_NOT_FOUND: 404, NOT_OWNER: 403, AMOUNT_MISMATCH: 400,
        PAYMENT_KEY_MISMATCH: 409, PAYMENT_KEY_CONFLICT: 409, PAYMENT_FAILED: 402, PAYMENT_PROCESSING: 503, CONFIG_MISSING: 503,
    };
    for (const [code, status] of Object.entries(expected)) {
        const { res } = run(createError(`원문 ${MARK}`, 418, code), '/economy/topup/orders/x/confirm');
        assert.equal(res.statusCode, status, code);
        assert.equal(res.body.ok, false);
        assert.equal(res.body.code, code);
        assert.ok(!JSON.stringify(res.body).includes(MARK), code);
        assert.equal(res.body.error, undefined);
    }
    assert.equal(run(createError('x', 503, 'PAYMENT_PROCESSING'), '/economy/topup/orders/x/confirm').res.headers['retry-after'], '2');
});

test('버전 불일치는 현재 상품의 검증된 공개 필드만 싣는다(타입이 다르면 아예 싣지 않는다)', (t) => {
    captureConsole(t);
    const product = {
        productId: 'p', kind: 'DIAMOND_TOPUP', displayName: 'n', payCurrency: 'KRW', payAmount: 1000,
        grantCurrency: 'DIAMOND', grantAmount: 100, bonusAmount: 10, version: 2,
    };
    const withProduct = (currentProduct) => Object.assign(createError('x', 409, 'PRODUCT_VERSION_MISMATCH'), { currentProduct });

    const ok = run(withProduct({ ...product, status: 'ON_SALE', sortOrder: 1, secret: MARK }), '/economy/topup/orders').res;
    assert.deepEqual(ok.body.product, product);
    assert.ok(!JSON.stringify(ok.body).includes(MARK));

    assert.equal(run(withProduct({ ...product, payAmount: '1000' }), '/economy/topup/orders').res.body.product, undefined);
    assert.equal(run(withProduct(null), '/economy/topup/orders').res.body.product, undefined);
});

test('표에 없는 코드·코드 없는 오류·DB/어댑터 오류는 SERVER_ERROR이고 원본이 로그·응답에 남지 않는다', (t) => {
    const logs = captureConsole(t);
    const failures = [
        createError(`x ${MARK}`, 400, 'NOT_IN_TABLE'),
        createError(`conflict ${MARK}`, 409),
        Object.assign(new Error(`insert '${MARK}'`), { name: 'SequelizeDatabaseError', sql: MARK, parent: { sqlMessage: MARK } }),
        Object.assign(new Error(`adapter ${MARK}`), { status: 502, response: { data: MARK }, stack: `Error ${MARK}` }),
    ];
    for (const failure of failures) {
        const { res } = run(failure, '/economy/topup/orders');
        assert.equal(res.statusCode, 500);
        assert.equal(res.body.code, 'SERVER_ERROR');
        assert.ok(!JSON.stringify(res.body).includes(MARK));
    }
    assert.ok(!logs.join('\n').includes(MARK), '로그에 원본이 남으면 안 된다');
    assert.ok(logs.length > 0 && logs.every((line) => line.startsWith('[economy-topup]')), '고정 형식의 로그만 남는다');
});

test('JSON 파서 오류(코드 없는 400)와 없는 하위 경로(404)는 원문 없이 고정 코드로 응답한다', (t) => {
    const logs = captureConsole(t);
    const parserError = Object.assign(new SyntaxError(`Unexpected token in ${MARK}`), {
        status: 400, statusCode: 400, type: 'entity.parse.failed', body: `{"secret":"${MARK}"`,
    });
    const parsed = run(parserError, '/economy/topup/orders').res;
    assert.equal(parsed.statusCode, 400);
    assert.deepEqual(parsed.body, { ok: false, code: 'INVALID_INPUT', message: '요청 형식이 올바르지 않습니다.' });

    const notFound = run(createError(`POST /economy/topup/nothing ${MARK}`, 404), '/economy/topup/nothing').res;
    assert.equal(notFound.statusCode, 404);
    assert.equal(notFound.body.code, 'NOT_FOUND');
    assert.ok(!JSON.stringify([parsed.body, notFound.body]).includes(MARK));
    assert.deepEqual(logs, []);
});

test('인증 오류 의미 유지: 401(ACCESS_TOKEN_EXPIRED 포함)·정지 계정 403은 그대로, 그 밖의 403은 고정 문구다', (t) => {
    captureConsole(t);
    const expired = run(createError(`만료 ${MARK}`, 401, 'ACCESS_TOKEN_EXPIRED'), '/economy/topup/orders').res;
    assert.equal(expired.statusCode, 401);
    assert.equal(expired.body.code, 'ACCESS_TOKEN_EXPIRED');
    assert.ok(!JSON.stringify(expired.body).includes(MARK));

    const plain = run(createError(`로그인 ${MARK}`, 401), '/economy/currency-products', { method: 'GET' }).res;
    assert.equal(plain.statusCode, 401);
    assert.equal(plain.body.code, undefined);
    assert.ok(!JSON.stringify(plain.body).includes(MARK));

    const banned = run(createError('정지된 계정입니다. 사유: 시험', 403), '/economy/topup/orders').res;
    assert.equal(banned.statusCode, 403);
    assert.equal(banned.body.message, '정지된 계정입니다.');

    const otherForbidden = run(createError(`권한 ${MARK}`, 403), '/economy/topup/orders').res;
    assert.equal(otherForbidden.statusCode, 403);
    assert.equal(otherForbidden.body.message, '접근 권한이 없습니다.');

    const selfForbidden = run(createError(`x ${MARK}`, 403, 'ECONOMY_FORBIDDEN'), '/economy/topup/orders').res;
    assert.equal(selfForbidden.statusCode, 403);
    assert.equal(selfForbidden.body.code, 'ECONOMY_FORBIDDEN');
});

test('정지 안내 접두어 뒤에 secret 표식이 붙은 코드 없는 403도 원문이 응답·로그에 남지 않는다', (t) => {
    const logs = captureConsole(t);
    for (const url of ['/economy/topup/orders', '/economy/currency-products?x=1', '/ECONOMY/topup/orders/']) {
        const err = Object.assign(createError(`정지된 계정입니다.${MARK} ${MARK}`, 403), { stack: `Error ${MARK}`, body: MARK });
        const { res } = run(err, url);
        assert.equal(res.statusCode, 403, url);
        assert.deepEqual(res.body, { success: false, message: '정지된 계정입니다.' }, url);
        assert.ok(!JSON.stringify(res).includes(MARK), url);
    }
    assert.ok(!logs.join('\n').includes(MARK), '로그에 표식이 남으면 안 된다');
});

test('상속 속성 이름(constructor·__proto__·toString·hasOwnProperty 등)의 err.code는 허용 코드가 아니라 SERVER_ERROR(500)로 수렴한다', (t) => {
    const logs = captureConsole(t);
    const inherited = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'];
    for (const code of inherited) {
        for (const status of [400, 404, 409, 500]) {
            const err = createError(`inherited ${MARK}`, status, code);
            const { res, passedOn } = run(err, '/economy/topup/orders');
            assert.equal(passedOn, null, `${code}/${status}: 오류 처리 자체가 실패하면 안 된다`);
            assert.equal(res.statusCode, 500, `${code}/${status}`);
            assert.deepEqual(res.body, { ok: false, code: 'SERVER_ERROR', message: '서버 내부에서 에러가 발생했습니다.' }, `${code}/${status}`);
            assert.ok(!JSON.stringify(res.body).includes(MARK));
        }
    }
    assert.ok(!logs.join('\n').includes(MARK));
});

test('응답이 이미 나갔으면 다음 오류 처리기로 넘긴다(신규 범위도 동일)', () => {
    const res = makeRes();
    res.headersSent = true;
    let passed = null;
    const err = new Error('late');
    globalErrorHandler(err, { originalUrl: '/economy/topup/orders', url: '/economy/topup/orders', method: 'POST' }, res, (error) => { passed = error; });
    assert.equal(passed, err);
    assert.equal(res.statusCode, null);
});
