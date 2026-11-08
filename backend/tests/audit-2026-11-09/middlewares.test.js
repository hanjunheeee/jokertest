'use strict';

// 미들웨어 시험: 경제 본인·관리자 확인 · 오류 응답 범위 · 요청 수 제한 설정 · 로그인 확인
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { requireSelf, requireEconomyAdmin } = require('../../middlewares/economyAccess.middleware');
const { globalErrorHandler, notFoundHandler } = require('../../middlewares/errorHandler.middleware');
const { createRateLimiter } = require('../../middlewares/rateLimit.middleware');
const authRateLimit = require('../../middlewares/authRateLimit.middleware');
const { verifyToken } = require('../../middlewares/auth.middleware');
const userService = require('../../services/user');
const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const { createError } = require('../../utils/appError');

// next에 넘긴 값을 받아 둠 (안 넘기면 undefined)
const runNext = (middleware, req, res = {}) => new Promise((resolve) => {
    Promise.resolve(middleware(req, res, (value) => resolve({ called: true, value }))).catch((error) => resolve({ thrown: error }));
});

const fakeRes = () => ({
    statusCode: 200,
    headers: {},
    cleared: [],
    headersSent: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    clearCookie(name) { this.cleared.push(name); return this; },
});

const handle = (url, err) => {
    const res = fakeRes();
    const originalError = console.error;
    console.error = () => {};
    try {
        globalErrorHandler(err, { method: 'POST', url, originalUrl: url }, res, () => { res.passedOn = true; });
    } finally {
        console.error = originalError;
    }
    return res;
};

const swap = (t, target, name, impl) => {
    const original = target[name];
    target[name] = impl;
    t.after(() => { target[name] = original; });
};

// 본인 확인
test('본인 확인: 로그인 정보가 없으면 401', async () => {
    const { value } = await runNext(requireSelf, { params: {} });
    assert.equal(value.status, 401);
});

test('본인 확인: uuid가 빈 문자열이면 401', async () => {
    const { value } = await runNext(requireSelf, { user: { uuid: '' }, params: {} });
    assert.equal(value.status, 401);
});

test('본인 확인: 경로 계정이 남이면 403 ECONOMY_FORBIDDEN', async () => {
    const { value } = await runNext(requireSelf, { user: { uuid: 'me' }, params: { userId: 'other' } });
    assert.equal(value.status, 403);
    assert.equal(value.code, 'ECONOMY_FORBIDDEN');
});

test('본인 확인: 경로 계정이 대소문자만 달라도 남으로 본다', async () => {
    const { value } = await runNext(requireSelf, { user: { uuid: 'abc' }, params: { userId: 'ABC' } });
    assert.equal(value?.code, 'ECONOMY_FORBIDDEN');
});

test('본인 확인: 본인이거나 경로에 계정이 없으면 오류 없이 통과', async () => {
    assert.equal((await runNext(requireSelf, { user: { uuid: 'me' }, params: { userId: 'me' } })).value, undefined);
    assert.equal((await runNext(requireSelf, { user: { uuid: 'me' }, params: {} })).value, undefined);
});

// 관리자 지급 권한
for (const role of ['ADMIN', 'QA']) {
    test(`관리자 권한: DB 역할이 ${role}이면 통과`, async (t) => {
        swap(t, userService, 'findByUuid', async () => ({ role }));
        const result = await runNext(requireEconomyAdmin, { user: { uuid: 'a' } });
        assert.equal(result.value, undefined);
    });
}

for (const role of ['USER', 'admin', undefined]) {
    test(`관리자 권한: DB 역할이 ${role}이면 403 ECONOMY_ADMIN_ONLY`, async (t) => {
        swap(t, userService, 'findByUuid', async () => ({ role }));
        const { value } = await runNext(requireEconomyAdmin, { user: { uuid: 'a', role: 'ADMIN' } });
        assert.equal(value.code, 'ECONOMY_ADMIN_ONLY');
        assert.equal(value.status, 403);
    });
}

test('관리자 권한: 계정이 없으면 403', async (t) => {
    swap(t, userService, 'findByUuid', async () => null);
    const { value } = await runNext(requireEconomyAdmin, { user: { uuid: 'ghost' } });
    assert.equal(value.status, 403);
});

test('관리자 권한: 계정 읽기가 실패하면 그 오류를 넘기고 지급 처리기로는 안 간다', async (t) => {
    const dbError = new Error('db down');
    swap(t, userService, 'findByUuid', async () => { throw dbError; });
    const { value } = await runNext(requireEconomyAdmin, { user: { uuid: 'a' } });
    assert.equal(value, dbError);
});

test('관리자 권한: 빈 값으로 실패해도 "route"를 넘겨 이 경로를 건너뛴다', async (t) => {
    swap(t, userService, 'findByUuid', () => Promise.reject(undefined));
    const { value } = await runNext(requireEconomyAdmin, { user: { uuid: 'a' } });
    assert.equal(value, 'route');
});

// 오류 응답 범위
test('없는 경로: 404 오류를 넘긴다', () => {
    let passed;
    notFoundHandler({ method: 'GET', url: '/nope' }, {}, (error) => { passed = error; });
    assert.equal(passed.status, 404);
});

test('오류 응답: 아이디 찾기 500은 내부 문구 없이 SERVER_ERROR만', () => {
    const res = handle('/auth/find-id', createError('secret db text', 500));
    assert.deepEqual(res.body, { ok: false, code: 'SERVER_ERROR' });
});

test('오류 응답: 아이디 찾기 경로에 쿼리·끝 슬래시가 붙어도 같은 범위', () => {
    const res = handle('/auth/find-id/?x=1', createError('bad', 400));
    assert.deepEqual(res.body, { ok: false, code: 'INVALID_INPUT' });
});

test('오류 응답: 아이디 찾기 경로를 대문자로 불러도(라우터는 대소문자 안 가림) 소문자 경로와 같은 응답 모양', () => {
    const lower = handle('/auth/find-id', createError('secret db text', 500));
    const upper = handle('/auth/Find-Id', createError('secret db text', 500));
    assert.deepEqual(upper.body, lower.body);
});

test('오류 응답: 가입 경로의 인증 증명 오류는 정한 문구로 401', () => {
    const res = handle('/auth/signup', createError('raw', 401, 'SIGNUP_PROOF_REQUIRED'));
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, '이메일 인증이 필요합니다.');
    assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('오류 응답: 가입 경로의 모르는 코드는 500 SERVER_ERROR (내부 코드 숨김)', () => {
    const res = handle('/auth/signup/email-code', createError('raw', 429, 'SOME_INTERNAL_CODE'));
    assert.deepEqual(res.body, { ok: false, code: 'SERVER_ERROR' });
});

test('오류 응답: 가입 경로 409는 이메일·닉네임 중복 문구만 그대로, 다른 409는 500', () => {
    assert.equal(handle('/auth/signup', createError('이미 사용 중인 닉네임입니다.', 409)).statusCode, 409);
    assert.equal(handle('/auth/signup', createError('이미 연결된 소셜 계정입니다.', 409)).statusCode, 500);
});

test('오류 응답: 비번 재설정 404는 INVALID, 그 밖 상태는 500', () => {
    assert.deepEqual(handle('/auth/password-reset/verify', createError('x', 404)).body, { ok: false, code: 'INVALID' });
    assert.deepEqual(handle('/auth/password-reset', createError('x', 409)).body, { ok: false, code: 'SERVER_ERROR' });
});

test('오류 응답: 골드 구매 다이아 부족은 정한 문구로 400', () => {
    const res = handle('/economy/gold-purchases', createError('원래 문구', 400, 'INSUFFICIENT_DIAMOND'));
    assert.deepEqual(res.body, { ok: false, code: 'INSUFFICIENT_DIAMOND', message: '다이아 잔액이 부족합니다.' });
});

test('오류 응답: 골드 구매 남의 지갑 접근은 403 ECONOMY_FORBIDDEN', () => {
    const res = handle('/economy/gold-purchases', createError('x', 403, 'ECONOMY_FORBIDDEN'));
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'ECONOMY_FORBIDDEN');
});

test('오류 응답: 골드 구매 경로의 표에 없는 코드(ITEM_ALREADY_OWNED)는 500으로 숨긴다', () => {
    const res = handle('/economy/gold-purchases', createError('x', 409, 'ITEM_ALREADY_OWNED'));
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.code, 'SERVER_ERROR');
});

test('오류 응답: 범위 밖 경로는 상태·code·문구를 그대로 낸다', () => {
    const res = handle('/economy/purchase', createError('잔액이 부족합니다.', 400, 'INSUFFICIENT_BALANCE'));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INSUFFICIENT_BALANCE');
    assert.equal(res.body.message, '잔액이 부족합니다.');
});

test('오류 응답: 범위 밖 경로에서 상태 없는 오류는 500이고 내부 문구를 안 낸다', () => {
    const res = handle('/user/me/profile', new Error('Table users_x does not exist'));
    assert.equal(res.statusCode, 500);
    assert.equal(JSON.stringify(res.body.message).includes('users_x'), false);
});

test('오류 응답: 응답이 이미 나갔으면 다음 처리기로 넘긴다', () => {
    const res = fakeRes();
    res.headersSent = true;
    let passed;
    globalErrorHandler(new Error('late'), { url: '/x', originalUrl: '/x' }, res, (error) => { passed = error; });
    assert.equal(passed.message, 'late');
    assert.equal(res.body, undefined);
});

// 요청 수 제한
test('요청 수 제한: windowMs가 문자열이거나 max가 소수면 만들 때 던진다', () => {
    assert.throws(() => createRateLimiter({ windowMs: '1000', max: 1, keyOf: () => 'k' }));
    assert.throws(() => createRateLimiter({ windowMs: 1000, max: 1.5, keyOf: () => 'k' }));
});

test('요청 수 제한: max=1이면 두 번째 요청이 429 RATE_LIMITED', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, keyOf: () => 'k', now: () => 0 });
    const first = fakeRes();
    let passed = 0;
    limiter({}, first, () => { passed += 1; });
    const second = fakeRes();
    limiter({}, second, () => { passed += 1; });
    assert.equal(passed, 1);
    assert.equal(second.statusCode, 429);
    assert.deepEqual(second.body, { ok: false, code: 'RATE_LIMITED' });
});

test('요청 수 제한: message를 주면 429 본문에 문구도 싣는다', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, keyOf: () => 'k', now: () => 0, message: '잠시 후 다시' });
    limiter({}, fakeRes(), () => {});
    const blocked = fakeRes();
    limiter({}, blocked, () => {});
    assert.deepEqual(blocked.body, { ok: false, code: 'RATE_LIMITED', message: '잠시 후 다시' });
});

test('요청 수 제한: 창이 지난 키는 막혔던 것도 새 창으로 다시 통과', () => {
    let nowMs = 0;
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, keyOf: () => 'k', now: () => nowMs });
    let passed = 0;
    limiter({}, fakeRes(), () => { passed += 1; });
    limiter({}, fakeRes(), () => { passed += 1; });
    nowMs = 1000;
    limiter({}, fakeRes(), () => { passed += 1; });
    assert.equal(passed, 2);
});

const captureLimiters = () => {
    const configs = [];
    const fakeCreate = (config) => { configs.push(config); return config; };
    return { configs, fakeCreate };
};

test('아이디 찾기 제한 설정: 이상한 환경 값(abc·0·-3·1.5)은 기본값(창 10분·ip 10·대상 5)', () => {
    for (const bad of ['abc', '0', '-3', '1.5']) {
        const { fakeCreate } = captureLimiters();
        const { ip, target } = authRateLimit.buildFindIdRateLimiters({ FIND_ID_WINDOW_MS: bad, FIND_ID_IP_MAX: bad, FIND_ID_TARGET_MAX: bad }, fakeCreate);
        assert.deepEqual([ip.windowMs, ip.max, target.max], [600000, 10, 5], bad);
    }
});

test('아이디 찾기 제한 설정: 맞는 환경 값은 그대로 쓴다', () => {
    const { fakeCreate } = captureLimiters();
    const { ip, target } = authRateLimit.buildFindIdRateLimiters({ FIND_ID_WINDOW_MS: '5000', FIND_ID_IP_MAX: '3', FIND_ID_TARGET_MAX: '2' }, fakeCreate);
    assert.deepEqual([ip.windowMs, ip.max, target.max], [5000, 3, 2]);
});

test('아이디 찾기 제한 키: 닉네임 원문이 키에 남지 않는다', () => {
    const { fakeCreate } = captureLimiters();
    const { target } = authRateLimit.buildFindIdRateLimiters({}, fakeCreate);
    const key = target.keyOf({}, { locals: { findIdInput: { nickname: '비밀닉네임' } } });
    assert.equal(key.includes('비밀닉네임'), false);
    assert.match(key, /^target:[0-9a-f]{64}$/);
});

test('비번 재설정 제한 키: 대소문자·앞뒤 공백만 다른 주소는 같은 키', () => {
    const { fakeCreate } = captureLimiters();
    const { requestEmail } = authRateLimit.buildPasswordResetRateLimiters({}, fakeCreate);
    const keyOf = (email) => requestEmail.keyOf({}, { locals: { passwordResetInput: { email } } });
    assert.equal(keyOf(' User@Mail.com '), keyOf('user@mail.com'));
    assert.notEqual(keyOf('a@mail.com'), keyOf('b@mail.com'));
});

test('비번 재설정 제한: 확인 ip 한도 기본값은 10분에 20번', () => {
    const { fakeCreate } = captureLimiters();
    const { checkIp } = authRateLimit.buildPasswordResetRateLimiters({}, fakeCreate);
    assert.deepEqual([checkIp.windowMs, checkIp.max], [600000, 20]);
});

test('가입 인증번호 제한: ip·주소 키가 시간 창마다 따로 (시간·하루 키가 안 겹침)', () => {
    const { fakeCreate } = captureLimiters();
    const limiters = authRateLimit.buildSignupCodeRateLimiters({
        ipHourWindowMs: 1, ipHourMax: 1, ipDayWindowMs: 2, ipDayMax: 2, emailHourWindowMs: 3, emailHourMax: 3, emailDayWindowMs: 4, emailDayMax: 4,
    }, fakeCreate);
    const req = { ip: '1.1.1.1' };
    const res = { locals: { signupEmailCodeInput: { email: 'a@b.com' } } };
    const keys = Object.values(limiters).map((l) => l.keyOf(req, res));
    assert.equal(new Set(keys).size, 4);
    assert.ok(keys.every((k) => !k.includes('a@b.com')));
});

// 로그인 확인
test('로그인 확인: 쿠키에 토큰이 없으면 401', async () => {
    const res = fakeRes();
    const { value } = await runNext(verifyToken, { cookies: {} }, res);
    assert.equal(value.status, 401);
});

test('로그인 확인: 만료 토큰은 ACCESS_TOKEN_EXPIRED이고 쿠키를 안 지운다', async (t) => {
    swap(t, sessionLifecycle, 'verifyAccessToken', () => { const e = new Error('jwt expired'); e.name = 'TokenExpiredError'; throw e; });
    const res = fakeRes();
    const { value } = await runNext(verifyToken, { cookies: { accessToken: 'x' } }, res);
    assert.equal(value.code, 'ACCESS_TOKEN_EXPIRED');
    assert.deepEqual(res.cleared, []);
});

test('로그인 확인: 서명이 틀린 토큰은 401이고 access 쿠키를 지운다', async (t) => {
    swap(t, sessionLifecycle, 'verifyAccessToken', () => { const e = new Error('invalid signature'); e.name = 'JsonWebTokenError'; throw e; });
    const res = fakeRes();
    const { value } = await runNext(verifyToken, { cookies: { accessToken: 'x' } }, res);
    assert.equal(value.status, 401);
    assert.deepEqual(res.cleared, ['accessToken']);
});

test('로그인 확인: 세션이 정지면 서비스가 준 상태(403)·문구로 넘기고 쿠키를 지운다', async (t) => {
    swap(t, sessionLifecycle, 'verifyAccessToken', () => ({ uuid: 'u' }));
    swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: false, status: 403, message: '정지된 계정입니다.' }));
    const res = fakeRes();
    const req = { cookies: { accessToken: 'x' } };
    const { value } = await runNext(verifyToken, req, res);
    assert.equal(value.status, 403);
    assert.equal(req.user, undefined);
    assert.deepEqual(res.cleared, ['accessToken']);
});

test('로그인 확인: 세션 확인 중 DB 오류는 그대로 넘긴다', async (t) => {
    const dbError = new Error('db');
    swap(t, sessionLifecycle, 'verifyAccessToken', () => ({ uuid: 'u' }));
    swap(t, sessionLifecycle, 'resolveSession', async () => { throw dbError; });
    const { value } = await runNext(verifyToken, { cookies: { accessToken: 'x' } }, fakeRes());
    assert.equal(value, dbError);
});

test('로그인 확인: 살아 있는 세션이면 req.user에 토큰 내용을 채우고 통과', async (t) => {
    swap(t, sessionLifecycle, 'verifyAccessToken', () => ({ uuid: 'u', sid: 's' }));
    swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    const req = { cookies: { accessToken: 'x' } };
    const { value } = await runNext(verifyToken, req, fakeRes());
    assert.equal(value, undefined);
    assert.deepEqual(req.user, { uuid: 'u', sid: 's' });
});
