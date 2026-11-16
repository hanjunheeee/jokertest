'use strict';

// 요청 수 제한 시험 — 로그인·이메일 중복 확인·가입 인증번호·아이디 찾기·재설정 메일·refresh·소셜 가입·이메일 바꾸기·탈퇴·코드 입장
// 목록 A15-B-183~203·206 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md "요청 수 제한"), 돌리기: node --env-file=.env.test --test tests/flow/a15-rate-limits.test.js

// 시험 전용 서명 값 (시험 환경값에 없을 때만 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-rate-limits-test-only-signing-value';

// a01b-world가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 → 서버 모듈보다 먼저
const { makeWorld } = require('./a01b-world');
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { startAuthServer, startRouterServer, send, json } = require('../audit-2026-11-09/securityHttp');
const { swap } = require('../audit-2026-11-09/authFakes');
const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const emailChangeService = require('../../services/auth/emailChange');
const authService = require('../../services/auth/account');
const { createError } = require('../../utils/appError');

const PASSWORD = 'a15-correct-pass-9';
const LOGIN_LIMIT_MESSAGE = '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.';

// 해시는 한 번만 (비용 4, 시험 빨리)
let hashOnce;
const passwordHash = async () => { hashOnce ??= await bcrypt.hash(PASSWORD, 4); return hashOnce; };

// 가짜 저장소에 계정 하나
const addUser = async (store, email, extra = {}) => {
    const user = {
        uuid: `u-${store.data.users.length + 1}-${email}`, email, nickname: `탐정${store.data.users.length + 1}`,
        role: 'USER', status: 'ACTIVE', has_local_password: true, password_hash: await passwordHash(),
        failed_login_count: 0, locked_until: null, ...extra,
    };
    store.data.users.push(user);
    return user;
};

// nginx 한 단계 뒤 꼴: 진짜 ip는 X-Forwarded-For 맨 끝
const from = (ip) => ({ 'x-forwarded-for': ip });

const login = (base, ip, email, password) => send(base, 'POST', '/auth/login', { body: { email, password }, headers: from(ip) });
const tokenCookies = (res) => res.headers.getSetCookie().filter((c) => /^(accessToken|refreshToken)=[^;]/.test(c));

// 계정 n개에 한 번씩 틀린 비번 (한 계정 5번 잠금과 안 섞이게 계정마다 한 번만) → 마지막 응답
const sprayWrong = async (base, store, prefix, n, ipOf) => {
    let last;
    for (let i = 0; i < n; i += 1) {
        const email = `${prefix}-${i}@example.com`;
        if (!store.data.users.some((u) => u.email === email)) await addUser(store, email);
        last = await json(await login(base, ipOf(i), email, 'wrong-pass-123'));
    }
    return last;
};

// ── 로그인 ip 10분 50번 ──

test('A15-B-183 로그인 ip 10분 50번 — 같은 ip 틀린 비번 50번째 → 401 (429 아님)', async (t) => {
    const { base, store } = await startAuthServer(t);
    const fiftieth = await sprayWrong(base, store, 'b183', 50, () => '198.51.100.183');
    assert.equal(fiftieth.status, 401);
    assert.notEqual(fiftieth.body.code, 'RATE_LIMITED');
});

test('A15-B-184 로그인 ip 51번째 → 429 RATE_LIMITED "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", 맞는 비번이어도 쿠키 없음', async (t) => {
    const { base, store } = await startAuthServer(t);
    await addUser(store, 'b184-real@example.com');
    await sprayWrong(base, store, 'b184', 50, () => '198.51.100.184');
    const res = await login(base, '198.51.100.184', 'b184-real@example.com', PASSWORD);
    const body = await json(res);
    assert.equal(body.status, 429);
    assert.equal(body.body.code, 'RATE_LIMITED');
    assert.equal(body.body.message, LOGIN_LIMIT_MESSAGE);
    assert.deepEqual(tokenCookies(res), [], '막혔는데 로그인 쿠키가 나감');
});

test('A15-B-185 다른 사람 ip는 따로 셈 — ip A 막힘 뒤 ip B 로그인 → 200', async (t) => {
    const { base, store } = await startAuthServer(t);
    await addUser(store, 'b185-real@example.com');
    const blocked = await sprayWrong(base, store, 'b185', 51, () => '198.51.100.185');
    assert.equal(blocked.status, 429, 'ip A가 안 막힘 (준비 실패)');
    const res = await login(base, '203.0.113.185', 'b185-real@example.com', PASSWORD);
    assert.equal(res.status, 200);
});

test('A15-B-186 X-Forwarded-For 앞 칸만 매번 바꿔도 맨 끝이 같으면 같은 사람 — 51번째 429', async (t) => {
    const { base, store } = await startAuthServer(t);
    const fifty = await sprayWrong(base, store, 'b186', 50, (i) => `10.${i}.0.1, 192.0.2.${i}, 198.51.100.186`);
    assert.equal(fifty.status, 401, '50번째가 이미 막힘 (준비 실패)');
    const last = await sprayWrong(base, store, 'b186-last', 1, () => '10.250.0.1, 198.51.100.186');
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMITED');
});

// ── 이메일 중복 확인 ip 10분 20번 ──

const checkEmailTimes = async (base, n, ip, prefix) => {
    let last;
    for (let i = 0; i < n; i += 1) {
        last = await json(await send(base, 'GET', `/auth/check-email?email=${prefix}-${i}%40example.com`, { headers: from(ip) }));
    }
    return last;
};

test('A15-B-187 이메일 중복 확인 ip 20번째 → 200', async (t) => {
    const { base } = await startAuthServer(t);
    const twentieth = await checkEmailTimes(base, 20, '198.51.100.187', 'b187');
    assert.equal(twentieth.status, 200);
});

test('A15-B-188 이메일 중복 확인 ip 21번째 → 429', async (t) => {
    const { base } = await startAuthServer(t);
    const last = await checkEmailTimes(base, 21, '198.51.100.188', 'b188');
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMITED');
});

// ── 가입 인증번호 (같은 주소 1시간 5번·하루 10번, 같은 ip 1시간 30번) ──
// 같은 주소는 1분 다시 보내기 대기가 따로 있음 → 가짜 시계(Date)로 61초씩 넘겨 그 대기는 피함

const requestCode = (base, ip, email) => send(base, 'POST', '/auth/signup/email-code', { body: { email }, headers: from(ip) });
const sameAddressTimes = async (t, base, ip, email, n) => {
    const results = [];
    for (let i = 0; i < n; i += 1) {
        results.push(await json(await requestCode(base, ip, email)));
        t.mock.timers.tick(61_000);
    }
    return results;
};
const mailsTo = (mail, email) => mail.outbox.filter((m) => m.to === email).length;

test('A15-B-189 가입 인증번호 같은 주소 5번째 → 받음', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-16T00:00:00Z') });
    const { base } = await startAuthServer(t);
    const results = await sameAddressTimes(t, base, '198.51.100.189', 'a15-189@example.com', 5);
    assert.equal(results[4].status, 200, JSON.stringify(results[4].body));
    assert.equal(results[4].body.ok, true);
});

test('A15-B-190 가입 인증번호 같은 주소 6번째 → 429, 그 주소로 간 메일 5통뿐', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-16T00:00:00Z') });
    const { base, mail } = await startAuthServer(t);
    const results = await sameAddressTimes(t, base, '198.51.100.190', 'a15-190@example.com', 6);
    assert.equal(results[5].status, 429);
    assert.equal(results[5].body.code, 'RATE_LIMITED');
    assert.equal(mailsTo(mail, 'a15-190@example.com'), 5);
});

test('A15-B-191 가입 인증번호 같은 주소 하루 10번 — 시간 한도 크게 둔 서버에서 11번째 429', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-11-16T00:00:00Z') });
    const { base, mail } = await startAuthServer(t, { SIGNUP_EMAIL_HOUR_MAX: '100' });
    const results = await sameAddressTimes(t, base, '198.51.100.191', 'a15-191@example.com', 11);
    assert.equal(results[9].status, 200, '10번째가 이미 막힘 (준비 실패)');
    assert.equal(results[10].status, 429);
    assert.equal(results[10].body.code, 'RATE_LIMITED');
    assert.equal(mailsTo(mail, 'a15-191@example.com'), 10);
});

test('A15-B-192 가입 인증번호 같은 ip 1시간 30번 — 주소를 매번 다르게 31번째 429', async (t) => {
    const { base } = await startAuthServer(t);
    let last;
    let thirtieth;
    for (let i = 1; i <= 31; i += 1) {
        last = await json(await requestCode(base, '198.51.100.192', `a15-192-${i}@example.com`));
        if (i === 30) thirtieth = last;
    }
    assert.equal(thirtieth.status, 200, '30번째가 이미 막힘 (준비 실패)');
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMITED');
});

// ── 아이디 찾기 같은 닉네임 10분 5번 ──

test('A15-B-193 아이디 찾기 같은 닉네임 6번째 → 429, 찾은 결과 없음', async (t) => {
    const { base, store } = await startAuthServer(t);
    await addUser(store, 'a15-193@example.com', { nickname: '찾기탐정', birth_date: '2000-01-02' });
    const results = [];
    for (let i = 1; i <= 6; i += 1) {
        // ip를 매번 바꿈 → ip 제한(10번) 말고 닉네임 제한만 걸리게
        const res = await send(base, 'POST', '/auth/find-id', { body: { nickname: '찾기탐정', birthDate: '2000-01-02' }, headers: from(`198.51.100.${i}`) });
        results.push(await json(res));
    }
    assert.equal(typeof results[0].body.maskedEmail, 'string', '첫 번째도 못 찾음 (준비 실패)');
    assert.equal(results[5].status, 429);
    assert.equal(results[5].body.code, 'RATE_LIMITED');
    assert.equal(results[5].body.maskedEmail, undefined);
    assert.doesNotMatch(results[5].text, /a15-193|\*\*\*|@/);
});

// ── 재설정 메일 (같은 주소 1시간 3번, ip 1시간 10번) ──

const resetRequest = (base, ip, email) => send(base, 'POST', '/auth/password-reset/request', { body: { email }, headers: from(ip) });

// 2·3번째는 1분 안 다시 요청이라 메일 없이 건너뛰지만 한도엔 셈 (2026-11-16 결정 다섯째 3)
test('A15-B-194 재설정 메일 같은 주소 4번째 → 429, 메일 1통뿐', async (t) => {
    const { base, store, mail } = await startAuthServer(t);
    await addUser(store, 'a15-194@example.com');
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push(await json(await resetRequest(base, '198.51.100.194', 'a15-194@example.com')));
    assert.equal(results[2].status, 200, '3번째가 이미 막힘 (준비 실패)');
    assert.equal(results[3].status, 429);
    assert.equal(results[3].body.code, 'RATE_LIMITED');
    assert.equal(mailsTo(mail, 'a15-194@example.com'), 1);
});

test('A15-B-195 대소문자만 바꾼 주소도 같은 셈 — 소문자 3번 뒤 대문자 섞은 같은 주소 → 429', async (t) => {
    const { base, store } = await startAuthServer(t);
    await addUser(store, 'a15-195@example.com');
    for (let i = 0; i < 3; i += 1) await resetRequest(base, '198.51.100.195', 'a15-195@example.com');
    const mixed = await json(await resetRequest(base, '198.51.100.195', 'A15-195@Example.COM'));
    assert.equal(mixed.status, 429);
    assert.equal(mixed.body.code, 'RATE_LIMITED');
});

test('A15-B-196 재설정 메일 ip 1시간 10번 — 주소를 매번 다르게 11번째 429', async (t) => {
    const { base } = await startAuthServer(t);
    let last;
    let tenth;
    for (let i = 1; i <= 11; i += 1) {
        last = await json(await resetRequest(base, '198.51.100.196', `a15-196-${i}@example.com`));
        if (i === 10) tenth = last;
    }
    assert.equal(tenth.status, 200, '10번째가 이미 막힘 (준비 실패)');
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMITED');
});

test('A15-B-197 링크 확인 10번 + 새 비번 저장 10번 → 21번째(저장) 429 (한도 하나를 같이 씀)', async (t) => {
    const { base } = await startAuthServer(t);
    const ip = '198.51.100.197';
    const fakeToken = 'A'.repeat(43);
    for (let i = 0; i < 10; i += 1) {
        const res = await send(base, 'GET', `/auth/password-reset/verify?token=${fakeToken}`, { headers: from(ip) });
        assert.notEqual(res.status, 429, `확인 ${i + 1}번째가 막힘`);
    }
    let twentieth;
    for (let i = 0; i < 10; i += 1) {
        twentieth = await send(base, 'POST', '/auth/password-reset/confirm', { body: { token: fakeToken, newPassword: 'new-pass-1234' }, headers: from(ip) });
    }
    assert.notEqual(twentieth.status, 429, '20번째가 이미 막힘 (준비 실패)');
    const last = await json(await send(base, 'POST', '/auth/password-reset/confirm', { body: { token: fakeToken, newPassword: 'new-pass-1234' }, headers: from(ip) }));
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMITED');
});

// ── refresh ip 10분 600번 · 소셜 가입 ip 10분 60번 ──

test('A15-B-198 refresh ip 601번째 → 429', async (t) => {
    const { base } = await startAuthServer(t);
    let res;
    for (let i = 1; i <= 600; i += 1) res = await send(base, 'POST', '/auth/refresh', { headers: from('198.51.100.198') });
    assert.notEqual(res.status, 429, '600번째가 이미 막힘 (준비 실패)');
    const last = await json(await send(base, 'POST', '/auth/refresh', { headers: from('198.51.100.198') }));
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMITED');
});

test('A15-B-199 소셜 가입 ip POST /auth/social/signup/intent 61번째 → 429', async (t) => {
    const { base } = await startAuthServer(t);
    let res;
    for (let i = 1; i <= 60; i += 1) res = await send(base, 'POST', '/auth/social/signup/intent', { body: { intentToken: `x-${i}` }, headers: from('198.51.100.199') });
    assert.notEqual(res.status, 429, '60번째가 이미 막힘 (준비 실패)');
    const last = await json(await send(base, 'POST', '/auth/social/signup/intent', { body: { intentToken: 'x-61' }, headers: from('198.51.100.199') }));
    assert.equal(last.status, 429);
    assert.equal(last.body.code, 'RATE_LIMITED');
});

// ── 로그인한 사람 기준 제한 (이메일 바꾸기·탈퇴) ──
// 세션은 늘 살아 있다고 보고, 서비스는 빠른 가짜로 (제한만 봄), 라우터는 시험마다 새로 불러 장부 비움

const USER_ROUTES = require.resolve('../../routes/user.routes');
const startUserServer = async (t) => {
    swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    swap(t, emailChangeService, 'requestEmailChangeCode', async () => ({ expiresInSec: 600, resendAfterSec: 60 }));
    swap(t, emailChangeService, 'confirmEmailChange', async () => { throw createError('인증번호가 일치하지 않습니다.', 400, 'CODE_MISMATCH'); });
    swap(t, authService, 'withdrawAccount', async () => { throw createError('비밀번호가 일치하지 않습니다.', 401); });
    delete require.cache[USER_ROUTES];
    return startRouterServer(t, [['/user', require(USER_ROUTES)]]);
};
const cookieFor = (uuid) => `accessToken=${jwt.sign({ uuid, role: 'USER', sessionId: `s-${uuid}` }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: 900 })}`;
// 같은 사람이 ip를 바꿔 가며 n번 → 응답 목록
const asUser = async (base, uuid, method, path, body, n) => {
    const out = [];
    for (let i = 1; i <= n; i += 1) {
        out.push(await json(await send(base, method, path, { cookie: cookieFor(uuid), body, headers: from(`203.0.113.${i}`) })));
    }
    return out;
};

test('A15-B-200 이메일 바꾸기 번호 요청 한 사람 5번째 → 429 아님', async (t) => {
    const base = await startUserServer(t);
    const out = await asUser(base, 'b200-user', 'POST', '/user/me/email/code', { newEmail: 'new-200@example.com' }, 5);
    assert.notEqual(out[4].status, 429);
    assert.equal(out[4].status, 200);
});

test('A15-B-201 이메일 바꾸기 번호 요청 한 사람 6번째 → 429', async (t) => {
    const base = await startUserServer(t);
    const out = await asUser(base, 'b201-user', 'POST', '/user/me/email/code', { newEmail: 'new-201@example.com' }, 6);
    assert.equal(out[5].status, 429);
    assert.equal(out[5].body.code, 'RATE_LIMITED');
});

test('A15-B-202 이메일 바꾸기 확인 15분 20번 — 21번째 429', async (t) => {
    const base = await startUserServer(t);
    const out = await asUser(base, 'b202-user', 'POST', '/user/me/email/verify', { newEmail: 'new-202@example.com', code: '000000' }, 21);
    assert.notEqual(out[19].status, 429, '20번째가 이미 막힘 (준비 실패)');
    assert.equal(out[20].status, 429);
    assert.equal(out[20].body.code, 'RATE_LIMITED');
});

test('A15-B-203 탈퇴 요청 15분 10번 — 11번째 429 (비번 틀림 잠금 WITHDRAW_LOCKED과 따로)', async (t) => {
    const base = await startUserServer(t);
    const out = await asUser(base, 'b203-user', 'POST', '/user/me/withdraw', { password: 'wrong-pass-123' }, 11);
    assert.notEqual(out[9].status, 429, '10번째가 이미 막힘 (준비 실패)');
    assert.equal(out[10].status, 429);
    assert.equal(out[10].body.code, 'RATE_LIMITED');
    assert.notEqual(out[10].body.code, 'WITHDRAW_LOCKED');
});

// ── 코드 입장 시도 사람마다 1분 20번 ──

test('A15-B-206 코드 입장 시도는 사람마다 따로 (정원 6) — A가 20번 넘게 시도해 막힌 뒤 B가 맞는 코드 → 입장 됨', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ host: 'a15-206-host', maxPlayers: 6 });
    w.connect('a15-206-a');
    w.connect('a15-206-b');
    const wrong = room.roomCode === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
    for (let i = 0; i < 20; i += 1) await w.joinByCode('a15-206-a', wrong);
    await w.joinByCode('a15-206-a', room.roomCode);
    assert.equal(w.lastFailed('a15-206-a')?.code, 'TOO_MANY_JOIN_ATTEMPTS', 'A가 안 막힘 (준비 실패)');
    assert.equal(w.lastJoined('a15-206-a'), undefined);
    await w.joinByCode('a15-206-b', room.roomCode);
    assert.equal(w.lastJoined('a15-206-b')?.roomId, room.roomId, JSON.stringify(w.lastFailed('a15-206-b')));
    assert.ok((await w.roster('a15-206-host')).includes('a15-206-b'));
});

