'use strict';

// 로그·응답에 비밀 없음 시험 — 요청 로그 줄은 쿼리 뺀 경로만·재설정 경로는 가림, 로그인 응답 본문에 토큰 없음, 친구 찾기 결과에 개인 정보 없음
// 목록 A15-B-229~232 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: node --env-file=.env.test --test tests/flow/a15-log-response.test.js
// 모델이 DB에 안 붙게 닿지 않는 주소 (꼭 다른 require보다 먼저)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
// 시험 전용 서명 값 (시험 환경값에 없으면 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a15-log-response-test-only-secret-0123456789';
// 서버 시작 파일이 모르는 NODE_ENV면 멈추므로 없을 때만 test
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const db = require('../../models');
const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const economyService = require('../../services/economy');
const { useAuthStore, swap } = require('../audit-2026-11-09/authFakes');
const { startAuthServer, startRouterServer, send, json } = require('../audit-2026-11-09/securityHttp');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');

// 시험 전용 비번 (진짜 값 아님)
const PASSWORD = 'a15-log-pass-1';

// ── 진짜 서버 시작 파일(index.js)의 앱: 요청 로그 줄 모양을 그대로 봄 ──
// .env는 안 읽게 dotenv 읽기를 비우고, DB 준비 확인은 끝나지 않게 둬서 4000번 포트를 안 엶
let realApp = null;
const loadRealApp = () => {
    if (realApp) return realApp;
    require('dotenv').config = () => ({ parsed: {} });
    require('../../db/schemaReadiness').ensureSchemaReady = () => new Promise(() => {});
    require('../../services/presence/concurrency').startConcurrentSnapshotScheduler = () => {};
    realApp = require('../../index.js');
    test.after(() => realApp.io.close());
    return realApp;
};

// 진짜 앱을 빈 포트에 띄우기
const startRealApp = async (t) => {
    const { app } = loadRealApp();
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return url;
};

// 요청 로그 줄 모으기: 화면 출력 중 경로 글자가 든 줄만 잡고 나머지는 그대로 내보냄
const captureLogLines = (t, pattern) => {
    const lines = [];
    const original = process.stdout.write;
    process.stdout.write = function write(chunk, ...rest) {
        const text = String(chunk);
        if (pattern.test(text)) { lines.push(text); return true; }
        return original.call(process.stdout, chunk, ...rest);
    };
    t.after(() => { process.stdout.write = original; });
    return lines;
};

// 로그 줄은 응답이 끝난 뒤 쓰임 → 줄이 올 때까지 잠깐 (최대 2초)
const waitForLine = async (lines) => {
    const until = Date.now() + 2_000;
    while (lines.length === 0 && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 10));
    return lines;
};

test('A15-B-229 친구 찾기 쿼리 → 요청 로그 줄에 ?q=·그 글자 없음', async (t) => {
    const base = await startRealApp(t);
    const marker = 'a15q229marker';
    const lines = captureLogLines(t, /\/friends\/search/);
    await send(base, 'GET', `/friends/search?q=${marker}`);
    await waitForLine(lines);
    assert.equal(lines.length, 1, `로그 줄 수: ${lines.length}`);
    assert.match(lines[0], /GET \/friends\/search /);
    assert.doesNotMatch(lines[0], /\?q=/);
    assert.doesNotMatch(lines[0], new RegExp(marker));
});

test('A15-B-230 재설정 링크 확인 → 로그 줄 /auth/password-reset/[REDACTED], 토큰 글자 없음', async (t) => {
    useAuthStore(t);
    const base = await startRealApp(t);
    const fakeToken = 'a15fake230resettokenvalue0123456789abcdef';
    const lines = captureLogLines(t, /password-reset/);
    await send(base, 'GET', `/auth/password-reset/verify?token=${fakeToken}`);
    await waitForLine(lines);
    assert.equal(lines.length, 1, `로그 줄 수: ${lines.length}`);
    assert.match(lines[0], /\/auth\/password-reset\/\[REDACTED\]/);
    assert.doesNotMatch(lines[0], new RegExp(fakeToken));
    assert.doesNotMatch(lines[0], /verify\?token/);
});

test('A15-B-231 로그인 성공 → 본문에 access·refresh 토큰·비번 해시 없음, 토큰은 Set-Cookie로만', async (t) => {
    const { base, store } = await startAuthServer(t);
    const hash = await bcrypt.hash(PASSWORD, 4);
    store.data.users.push({
        uuid: 'a15-231-user', email: 'ok-231@example.test', nickname: '로그시험', role: 'USER', status: 'ACTIVE',
        password_hash: hash, failed_login_count: 0, locked_until: null,
    });
    const res = await json(await send(base, 'POST', '/auth/login', {
        body: { email: 'ok-231@example.test', password: PASSWORD, rememberMe: true },
    }));
    assert.equal(res.status, 200);
    // 쿠키에서 토큰 값 꺼내기 → "accessToken=<값>; …" 의 <값>
    const cookieValue = (name) => res.headers.getSetCookie()
        .map((c) => c.match(new RegExp(`^${name}=([^;]*)`))?.[1]).find(Boolean);
    const access = cookieValue('accessToken');
    const refresh = cookieValue('refreshToken');
    assert.ok(access, 'access 쿠키 없음');
    assert.ok(refresh, 'refresh 쿠키 없음');
    assert.equal(res.text.includes(access), false, '본문에 access 토큰');
    assert.equal(res.text.includes(decodeURIComponent(refresh)), false, '본문에 refresh 토큰');
    assert.equal(res.text.includes(hash), false, '본문에 비번 해시');
    assert.doesNotMatch(res.text, /password|hash|token/i);
});

test('A15-B-232 친구 찾기 결과 줄 → 이메일·생일·비번 해시 칸 없음', async (t) => {
    // 세션은 늘 살아 있음, 저장소 줄엔 개인 정보가 다 들어 있는 사람 하나
    swap(t, sessionLifecycle, 'resolveSession', async () => ({ ok: true }));
    const person = {
        uuid: 'a15-232-found', nickname: '찾을사람', profile_image_url: null, status: 'ACTIVE',
        email: 'private-232@example.test', birth_date: '2001-02-03', password_hash: '$2b$04$a15fakehashvalue232xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    };
    // 진짜 줄처럼: 고른 칸만 돌려줌
    swap(t, db.User, 'findAll', async ({ attributes } = {}) => [
        attributes ? Object.fromEntries(attributes.map((k) => [k, person[k]])) : { ...person },
    ]);
    for (const model of ['Friendship', 'FriendRequest', 'FriendBlock', 'OnlinePresence']) swap(t, db[model], 'findAll', async () => []);
    swap(t, economyService, 'getPublicProfileLoadouts', async () => ({}));
    const friendPath = require.resolve('../../routes/friend.routes');
    delete require.cache[friendPath];
    const base = await startRouterServer(t, [['/friends', require(friendPath)]]);
    const cookie = `accessToken=${jwt.sign({ uuid: 'a15-232-me', role: 'USER', sessionId: 's-232' }, process.env.JWT_SECRET)}`;
    const res = await json(await send(base, 'GET', `/friends/search?q=${encodeURIComponent('찾을')}`, { cookie }));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1, '찾은 줄이 없음');
    const row = res.body.data[0];
    for (const key of ['email', 'birth_date', 'birthDate', 'password_hash', 'passwordHash']) {
        assert.equal(Object.hasOwn(row, key), false, `${key} 칸이 실림`);
    }
    assert.doesNotMatch(res.text, /private-232|2001-02-03|a15fakehashvalue232/);
});
