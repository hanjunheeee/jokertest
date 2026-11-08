'use strict';

// 보안 시험: 권한 (남의 판 결과·지갑 보기 막기 · 관리자 지급 권한 · 내부 API 열쇠 · 로그인 필요한 경로 · 약관 링크 주소)
// DB 안 씀: 세션 확인·저장소는 가짜로 바꿔 끼움
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'security-access-secret-0123456789abcdef';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const gameResultRepository = require('../../repositories/game/result');
const userService = require('../../services/user');
const { requireSelf, requireEconomyAdmin } = require('../../middlewares/economyAccess.middleware');
const internalKey = require('../../middlewares/internalKey.middleware');
const { toPublicTerms } = require('../../services/auth/terms/current');
const { swap } = require('./authFakes');
const { startRouterServer, send, json, withEnv } = require('./securityHttp');

const GAME = {
    id: 'game-1', room_id: 'room-1', winner: 'CITIZEN', win_reason: 'ALL_JOKERS_ELIMINATED', started_at: 'a', ended_at: 'b',
    day_index: 2, player_count: 2, settings: {}, completed: true,
    players: [
        { user_id: 'me', nickname_snapshot: '나', role: 'CITIZEN', team: 'CITIZEN', won: true, is_alive: true, death_reason: null },
        { user_id: 'friend', nickname_snapshot: '친구', role: 'JOKER', team: 'JOKER', won: false, is_alive: false, death_reason: 'EXECUTION' },
    ],
};

// 세션은 늘 살아 있다고 보고, 쿠키는 uuid마다 서명
const loginAs = (t) => swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
const cookieFor = (uuid) => `accessToken=${jwt.sign({ uuid, role: 'USER', sessionId: `s-${uuid}` }, process.env.JWT_SECRET)}`;

// 라우터 새로 불러 띄우기
const freshRouter = (relative) => {
    const resolved = require.resolve(relative);
    delete require.cache[resolved];
    return require(resolved);
};

// ── 판 결과 (남의 판) ──

test('판 결과 HTTP: 그 판 참가자는 200, 안 낀 사람은 없는 판과 똑같은 404', async (t) => {
    loginAs(t);
    swap(t, gameResultRepository, 'findGameResultById', async (id) => (id === 'game-1' ? GAME : null));
    const base = await startRouterServer(t, [['/game', freshRouter('../../routes/game.routes')]]);
    const mine = await json(await send(base, 'GET', '/game/game-1', { cookie: cookieFor('me') }));
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.players.length, 2);
    const stranger = await json(await send(base, 'GET', '/game/game-1', { cookie: cookieFor('stranger') }));
    const missing = await json(await send(base, 'GET', '/game/game-404', { cookie: cookieFor('stranger') }));
    assert.equal(stranger.status, 404);
    assert.deepEqual(stranger.body, missing.body);
    assert.doesNotMatch(stranger.text, /JOKER|친구/);
});

test('판 결과 HTTP: 로그인 없으면 401 (저장소까지 안 감)', async (t) => {
    let looked = false;
    swap(t, gameResultRepository, 'findGameResultById', async () => { looked = true; return GAME; });
    const base = await startRouterServer(t, [['/game', freshRouter('../../routes/game.routes')]]);
    const res = await send(base, 'GET', '/game/game-1');
    assert.equal(res.status, 401);
    assert.equal(looked, false);
});

test('판 결과 컨트롤러: req.user 없으면 참가자 아님으로 404', async (t) => {
    swap(t, gameResultRepository, 'findGameResultById', async () => GAME);
    const { getGameResult } = require('../../controllers/game/result');
    let status;
    await getGameResult({ params: { gameId: 'game-1' } }, { status(code) { status = code; return this; }, json() { return this; } }, (e) => { throw e; });
    assert.equal(status, 404);
});

// ── 지갑·소유품 (경로 uuid 바꾸기) ──

test('지갑 HTTP: 경로 uuid를 남의 것으로 바꾸면 403 ECONOMY_FORBIDDEN', async (t) => {
    loginAs(t);
    const base = await startRouterServer(t, [['/economy', freshRouter('../../routes/economy.routes')]]);
    for (const path of ['/economy/accounts/victim/wallet', '/economy/accounts/victim/entitlements', '/economy/accounts/victim/transactions']) {
        const res = await json(await send(base, 'GET', path, { cookie: cookieFor('attacker') }));
        assert.equal(res.status, 403, path);
        assert.equal(res.body.code, 'ECONOMY_FORBIDDEN');
    }
});

test('본인 확인 미들웨어: 내 uuid면 통과, uuid 없는 토큰은 401', () => {
    let passed = null;
    requireSelf({ user: { uuid: 'me' }, params: { userId: 'me' } }, {}, (err) => { passed = err ?? 'ok'; });
    assert.equal(passed, 'ok');
    requireSelf({ user: {}, params: {} }, {}, (err) => { passed = err; });
    assert.equal(passed.status, 401);
});

// ── 관리자 지급 ──

const runAdminCheck = async (t, role, nodeEnv) => {
    withEnv(t, { NODE_ENV: nodeEnv });
    swap(t, userService, 'findByUuid', async () => (role ? { uuid: 'x', role } : null));
    let result = null;
    await requireEconomyAdmin({ user: { uuid: 'x' } }, {}, (err) => { result = err ?? 'ok'; });
    return result;
};

test('관리자 지급: ADMIN만 통과, USER·없는 계정은 403 ECONOMY_ADMIN_ONLY', async (t) => {
    assert.equal(await runAdminCheck(t, 'ADMIN', 'production'), 'ok');
    assert.equal((await runAdminCheck(t, 'USER', 'production')).code, 'ECONOMY_ADMIN_ONLY');
    assert.equal((await runAdminCheck(t, null, 'production')).status, 403);
});

test('관리자 지급: QA는 운영에서 막힘 (개발에서만 시험 지급)', async (t) => {
    assert.equal((await runAdminCheck(t, 'QA', 'production')).code, 'ECONOMY_ADMIN_ONLY');
    assert.equal(await runAdminCheck(t, 'QA', 'development'), 'ok');
});

test('관리자 지급 HTTP: 일반 계정이 /economy/admin/grant 부르면 403, 토큰 role을 ADMIN으로 바꿔 서명해도 DB role로 봄', async (t) => {
    loginAs(t);
    swap(t, userService, 'findByUuid', async () => ({ uuid: 'attacker', role: 'USER' }));
    const base = await startRouterServer(t, [['/economy', freshRouter('../../routes/economy.routes')]]);
    const forged = `accessToken=${jwt.sign({ uuid: 'attacker', role: 'ADMIN', sessionId: 's-1' }, process.env.JWT_SECRET)}`;
    const res = await send(base, 'POST', '/economy/admin/grant', { cookie: forged, body: { userId: 'attacker', currency: 'DIAMOND', amount: 999999 } });
    assert.equal(res.status, 403);
});

// ── 내부 API 열쇠 ──

const runKey = (env, header) => {
    let outcome = null;
    const res = { status(code) { outcome = code; return this; }, json() { return this; } };
    internalKey.requireInternalKey({ env })({ get: () => header }, res, (arg) => { outcome = arg ?? 'next'; });
    return outcome;
};
const LONG_KEY = 'k'.repeat(40);

test('내부 API: 열쇠 설정 없거나 32자 못 되면 경로 전체 꺼짐 (404처럼 지나감)', () => {
    assert.equal(runKey({}, LONG_KEY), 'router');
    assert.equal(runKey({ INTERNAL_API_KEY: 'k'.repeat(31) }, 'k'.repeat(31)), 'router');
});

test('내부 API: 틀린 열쇠·빈 열쇠·길이만 같은 열쇠는 401, 맞는 열쇠만 통과', () => {
    const env = { INTERNAL_API_KEY: LONG_KEY };
    assert.equal(runKey(env, undefined), 401);
    assert.equal(runKey(env, ''), 401);
    assert.equal(runKey(env, 'x'.repeat(40)), 401);
    assert.equal(runKey(env, `${LONG_KEY} `), 401);
    assert.equal(runKey(env, LONG_KEY), 'next');
});

test('내부 API HTTP: 꺼진 경로는 없는 경로와 같은 404, 틀린 열쇠는 401 INTERNAL_UNAUTHORIZED', async (t) => {
    const { createInternalRouter } = require('../../routes/internal.routes');
    const off = await startRouterServer(t, [['/internal', createInternalRouter({ env: {} })]]);
    assert.equal((await send(off, 'GET', '/internal/live')).status, 404);
    const on = await startRouterServer(t, [['/internal', createInternalRouter({ env: { INTERNAL_API_KEY: LONG_KEY } })]]);
    const res = await json(await send(on, 'GET', '/internal/live', { headers: { 'x-internal-key': 'wrong' } }));
    assert.equal(res.status, 401);
    assert.equal(res.body.code, 'INTERNAL_UNAUTHORIZED');
});

// ── 로그인 필요한 경로 ──

test('로그인 필요한 경로: 쿠키 없으면 전부 401 (알림·친구·내 정보·신고·이모티콘)', async (t) => {
    const base = await startRouterServer(t, [
        ['/notifications', freshRouter('../../routes/notification.routes')],
        ['/friends', freshRouter('../../routes/friend.routes')],
        ['/user', freshRouter('../../routes/user.routes')],
        ['/reports', freshRouter('../../routes/report.routes')],
    ]);
    for (const [method, path] of [['GET', '/notifications'], ['GET', '/friends'], ['GET', '/user/me/profile'],
        ['POST', '/reports'], ['PUT', '/user/me/emoji-palette'], ['POST', '/user/me/email/code'], ['POST', '/user/me/withdraw']]) {
        const res = await send(base, method, path, { body: method === 'GET' ? undefined : {} });
        assert.equal(res.status, 401, `${method} ${path}`);
    }
});

test('로그인 필요한 경로: 서명 틀린 쿠키는 401이고 쿠키를 지움', async (t) => {
    const base = await startRouterServer(t, [['/notifications', freshRouter('../../routes/notification.routes')]]);
    const res = await send(base, 'GET', '/notifications', { cookie: `accessToken=${jwt.sign({ uuid: 'x', sessionId: 's' }, 'wrong-key')}` });
    assert.equal(res.status, 401);
    assert.ok(res.headers.getSetCookie().some((c) => /^accessToken=;/.test(c)));
});

// ── 약관 링크 주소 ──

const termsRow = (url) => ({ id: 1, kind: 'TERMS', version: 'v1', title: '약관', body: null, url, effective_at: '2026-11-01', is_required: 1 });

test('약관 링크: http·https만 내보내고 javascript:·data:·vbscript:·이상한 값은 null', () => {
    assert.equal(toPublicTerms(termsRow('https://example.com/terms')).url, 'https://example.com/terms');
    assert.equal(toPublicTerms(termsRow('http://example.com/t')).url, 'http://example.com/t');
    for (const url of ['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<script>x</script>', 'vbscript:x', '/relative', 'not a url', null, 5]) {
        assert.equal(toPublicTerms(termsRow(url)).url, null, String(url));
    }
});

test('약관 링크: 글자 앞뒤 공백·탭 섞은 javascript: 도 null', () => {
    assert.equal(toPublicTerms(termsRow(' javascript:alert(1)')).url, null);
    assert.equal(toPublicTerms(termsRow('java\tscript:alert(1)')).url, null);
});

// ── 쿠폰 번호 맞히기 ──

test('쿠폰 HTTP: 계정을 바꿔 가며 넣어도 같은 ip는 10분 30번까지, 31번째 429', async (t) => {
    loginAs(t);
    const couponService = require('../../services/ops/coupon');
    let tried = 0;
    swap(t, couponService, 'redeemCoupon', async () => { tried += 1; return { granted: [] }; });
    const base = await startRouterServer(t, [['/economy', freshRouter('../../routes/economy.routes')]]);
    for (let i = 0; i < 30; i += 1) {
        const res = await send(base, 'POST', '/economy/coupons/redeem', { cookie: cookieFor(`bot-${i}`), body: { code: `GUESS-${i}` } });
        assert.equal(res.status, 201, `${i}`);
    }
    const res = await json(await send(base, 'POST', '/economy/coupons/redeem', { cookie: cookieFor('bot-31'), body: { code: 'GUESS-31' } }));
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
    assert.equal(tried, 30);
});

test('쿠폰 HTTP: 한 계정은 1분 10번까지 (ip 제한보다 먼저)', async (t) => {
    loginAs(t);
    const couponService = require('../../services/ops/coupon');
    swap(t, couponService, 'redeemCoupon', async () => ({ granted: [] }));
    const base = await startRouterServer(t, [['/economy', freshRouter('../../routes/economy.routes')]]);
    for (let i = 0; i < 10; i += 1) await send(base, 'POST', '/economy/coupons/redeem', { cookie: cookieFor('one'), body: { code: `C-${i}` } });
    assert.equal((await send(base, 'POST', '/economy/coupons/redeem', { cookie: cookieFor('one'), body: { code: 'C-11' } })).status, 429);
});

// 시험 파일끼리 안 섞이게 express 앱은 매번 새로
test('준비 확인: express 라우터 새로 부르기가 된다', () => {
    assert.equal(typeof express.Router, 'function');
});
