'use strict';

// 2026-11-09 서버 바탕 버그 수정 시험 (DB 안 씀)
// 접속 IP · 500 문구 · 요청 수 제한 · 프런트 주소 끝 슬래시 · 유일 충돌 문구 · 정지 시작 시각 · 보안 헤더 · 필수 환경값 · 상태 확인 · 팔레트 500
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://test:test@localhost:3306/test';

const test   = require('node:test');
const assert = require('node:assert/strict');

const { getClientIp, safeRequestPath } = require('../../utils/request');
const { globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const { createRateLimiter } = require('../../middlewares/rateLimit.middleware');
const { securityHeaders } = require('../../middlewares/securityHeaders.middleware');
const { assertRequiredEnv, findMissingEnv } = require('../../config/requiredEnv');
const { toConflictError } = require('../../repositories/user/transaction');
const { createError } = require('../../utils/appError');

// 처리기용 가짜 응답
const fakeRes = () => ({
    statusCode: 200, body: null, headers: {}, removed: [], headersSent: false,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    removeHeader(name) { this.removed.push(name); },
});

const withEnv = (t, values) => {
    const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    for (const [key, value] of Object.entries(values)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    t.after(() => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });
};

const muteConsoleError = (t) => {
    const original = console.error;
    const lines = [];
    console.error = (...args) => { lines.push(args); };
    t.after(() => { console.error = original; });
    return lines;
};

// ── 접속 IP ──

test('known-issues 접속 IP: x-forwarded-for 맨 앞(사람이 넣은 값)이 아니라 trust proxy로 정한 req.ip를 쓴다', () => {
    assert.equal(getClientIp({ headers: { 'x-forwarded-for': '6.6.6.6, 10.0.0.1' }, ip: '10.0.0.1' }), '10.0.0.1');
});

test('known-issues 접속 IP: 45자 넘거나 IP 모양 아니면 UNKNOWN (STRING(45) 저장 실패 500 막기)', () => {
    assert.equal(getClientIp({ headers: {}, ip: '1'.repeat(46) }), 'UNKNOWN');
    assert.equal(getClientIp({ headers: {}, ip: '<script>' }), 'UNKNOWN');
    assert.equal(getClientIp({ headers: {}, ip: '::ffff:127.0.0.1' }), '::ffff:127.0.0.1');
});

test('BE-040: 로그용 경로는 쿼리 문자열(이메일·code·state)을 뺀다', () => {
    assert.equal(safeRequestPath({ originalUrl: '/auth/check-email?email=a%40b.com' }), '/auth/check-email');
    assert.equal(safeRequestPath({ originalUrl: '/auth/google/callback?code=c&state=s' }), '/auth/google/callback');
});

// ── 오류 응답 ──

const handle = (path, err) => {
    const res = fakeRes();
    globalErrorHandler(err, { originalUrl: path, method: 'GET' }, res, () => {});
    return res;
};

test('known-issues 500 문구: 운영·환경값 없음이면 범위 밖 500은 내부 문구·코드·스택 없이 고정 문구', (t) => {
    muteConsoleError(t);
    for (const env of ['production', undefined]) {
        withEnv(t, { NODE_ENV: env });
        const err = Object.assign(new Error("Table 'users' constraint uq_x"), { name: 'SequelizeDatabaseError', code: 'ER_X' });
        const res = handle('/friends', err);
        assert.equal(res.statusCode, 500);
        assert.equal(res.body.message, '서버 내부에서 에러가 발생했습니다.');
        assert.equal(res.body.code, undefined);
        assert.equal(res.body.error, undefined);
    }
});

test('known-issues 500 문구: 4xx 앱 오류 문구·코드는 그대로 (화면이 기대는 모양 유지)', (t) => {
    withEnv(t, { NODE_ENV: 'production' });
    const res = handle('/friends', createError('이미 친구입니다.', 409, 'ALREADY_FRIENDS'));
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.message, '이미 친구입니다.');
    assert.equal(res.body.code, 'ALREADY_FRIENDS');
});

test('BE-052: 401·404 같은 보통 거절은 빨간 스택을 찍지 않고 500만 찍는다', (t) => {
    withEnv(t, { NODE_ENV: 'production' });
    const lines = muteConsoleError(t);
    handle('/user/me', createError('로그인이 필요합니다.', 401));
    handle('/nope', createError('없음', 404));
    assert.equal(lines.length, 0);
    handle('/user/me', new Error('boom'));
    assert.equal(lines.length, 1);
});

test('BE-028: NODE_ENV가 빠져도 500 응답에 스택이 안 나간다 (개발·시험 값일 때만)', (t) => {
    muteConsoleError(t);
    withEnv(t, { NODE_ENV: 'staging' });
    assert.equal(handle('/x', new Error('boom')).body.error, undefined);
    withEnv(t, { NODE_ENV: 'development' });
    assert.match(handle('/x', new Error('boom')).body.error, /boom/);
});

test('이모티콘 팔레트: 예상 못 한 오류는 원래 문구 없이 고정 문구 500 + 서버 로그', async (t) => {
    const lines = muteConsoleError(t);
    const economyService = require('../../services/economy');
    const palette = require('../../controllers/economy/emojiPalette');
    const original = economyService.getEmojiPalette;
    economyService.getEmojiPalette = async () => { throw new Error("ER_NO_SUCH_TABLE: Table 'emoji_palettes'"); };
    t.after(() => { economyService.getEmojiPalette = original; });

    const res = fakeRes();
    await palette.getEmojiPalette({ user: { uuid: 'me' } }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.code, 'EMOJI_PALETTE_ERROR');
    assert.doesNotMatch(res.body.message, /emoji_palettes/);
    assert.equal(lines.length, 1);
});

// ── 요청 수 제한 ──

test('BE-050: 창 지난 키는 청소 전이라도 새 창으로 시작하고, 429 본문에 문구를 실을 수 있다', () => {
    let now = 1_000;
    const limiter = createRateLimiter({ windowMs: 1_000, max: 1, keyOf: () => 'k', now: () => now, message: '잠시 뒤에' });
    const run = () => { const res = fakeRes(); let passed = false; limiter({}, res, () => { passed = true; }); return { res, passed }; };

    assert.equal(run().passed, true);
    const blocked = run();
    assert.equal(blocked.passed, false);
    assert.deepEqual(blocked.res.body, { ok: false, code: 'RATE_LIMITED', message: '잠시 뒤에' });
    now += 1_000;
    assert.equal(run().passed, true, '창이 지나면 다시 통과');
});

// ── 프런트 주소 ──

test('known-issues 프런트 주소: FRONTEND_URL 끝 슬래시를 다듬어 CORS·돌아갈 주소가 ...//login이 안 된다', (t) => {
    withEnv(t, { FRONTEND_URL: 'https://mmc.example/ ', FRONTEND_MOBILE_URL: undefined });
    const { getCorsOrigin, resolveFrontendBase } = require('../../config/frontendOrigins');
    assert.equal(getCorsOrigin(), 'https://mmc.example');
    assert.equal(resolveFrontendBase('desktop'), 'https://mmc.example');
});

// ── 저장소 ──

test('known-issues 5장: MySQL이 묶음 제약을 provider·subject 칸 이름으로 줘도 소셜 계정 문구로 409', () => {
    const err = { name: 'SequelizeUniqueConstraintError', errors: [{ path: 'provider' }, { path: 'subject' }], fields: { provider: 'g', subject: 's' } };
    const converted = toConflictError(err);
    assert.equal(converted.status, 409);
    assert.equal(converted.message, '이미 연결된 소셜 계정입니다.');
});

test('known-issues 정지 시작 시각: 정지 판정이 시작 시각(start_at)이 없거나 지난 것만 본다', async (t) => {
    const db = require('../../models');
    const { Op } = db.Sequelize;
    const original = db.UserBan;
    let where;
    db.UserBan = { findOne: async (options) => { where = options.where; return null; } };
    t.after(() => { db.UserBan = original; });

    await require('../../repositories/user/loginGuard').checkActiveBan('uuid-1');
    const [startCondition] = where[Op.and];
    const startOptions = startCondition[Op.or];
    assert.deepEqual(startOptions[0], { start_at: null });
    assert.ok(startOptions[1].start_at[Op.lte] instanceof Date);
});

// ── 보안 헤더·필수 환경값·상태 확인 ──

test('BE-041: 보안 헤더를 붙이고 X-Powered-By를 뺀다, HSTS는 운영만', (t) => {
    withEnv(t, { NODE_ENV: 'production' });
    const res = fakeRes();
    let passed = false;
    securityHeaders({}, res, () => { passed = true; });
    assert.equal(passed, true);
    assert.deepEqual(res.removed, ['X-Powered-By']);
    assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(res.headers['X-Frame-Options'], 'DENY');
    assert.ok(res.headers['Strict-Transport-Security']);
});

test('BE-039: 필수 환경값이 비면 이름만 담아 던지고 값은 안 싣는다, 모르는 NODE_ENV도 거절', () => {
    assert.deepEqual(findMissingEnv({ DATABASE_URL: 'x', JWT_SECRET: ' ', FRONTEND_URL: '' }), ['JWT_SECRET', 'FRONTEND_URL']);
    assert.throws(() => assertRequiredEnv({ DATABASE_URL: 'mysql://secret@h/db' }), (error) => {
        assert.match(error.message, /JWT_SECRET, FRONTEND_URL/);
        assert.doesNotMatch(error.message, /secret@h/);
        return true;
    });
    assert.throws(() => assertRequiredEnv({ DATABASE_URL: 'x', JWT_SECRET: 'y', FRONTEND_URL: 'z', NODE_ENV: 'staging' }));
    assert.doesNotThrow(() => assertRequiredEnv({ DATABASE_URL: 'x', JWT_SECRET: 'y', FRONTEND_URL: 'z', NODE_ENV: 'production' }));
});

test('DP-014: /health는 DB가 되면 200, 안 되면 내부 문구 없이 503', async (t) => {
    const db = require('../../models');
    const original = db.sequelize.query;
    t.after(() => { db.sequelize.query = original; });
    const router = require('../../routes/health.routes');
    const handler = router.stack[0].route.stack[0].handle;

    db.sequelize.query = async () => [[{ 1: 1 }]];
    const okRes = fakeRes();
    await handler({}, okRes);
    assert.equal(okRes.statusCode, 200);
    assert.deepEqual(okRes.body, { ok: true });

    db.sequelize.query = async () => { throw new Error('connect ECONNREFUSED secret-host'); };
    const downRes = fakeRes();
    await handler({}, downRes);
    assert.equal(downRes.statusCode, 503);
    assert.deepEqual(downRes.body, { ok: false, code: 'DB_UNAVAILABLE' });
});
