'use strict';

// 소켓 세션 시험(시험 DB) — 접속 때 진짜 세션 확인(로그인·로그아웃·정지·탈퇴·새 로그인), 접속 중 정지·새 로그인·탈퇴·세션 만료면 끊김
// 목록 A10-B-311~319 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models·socket require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
// 시험 전용 서명 값 (시험 환경값에 없으면 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a10-socket-session-test-only';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
// 모델을 세상 도우미보다 먼저 불러 시험 DB에 붙여 둠
const db = require('../../models');
const userRepository = require('../../repositories/user');
const { hashPassword } = require('../../utils/auth/credentials');
const { issueSessionForUser } = require('../../services/auth/account/session');
const { withdrawAccount } = require('../../services/auth/account/withdraw');
const { authenticateSocket } = require('../../socket/connection/auth');
const { makeWorld } = require('../flow/a10-world');

const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음), 있으면 파일 처음에 한 번 비우고 끝까지 올림
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

test.before(async () => {
    if (!TEST_DB_URL) return;
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
});

test.after(async () => {
    await db.sequelize.close();
});

// 시험 전용 비번 (탈퇴 본인 확인에 씀, 진짜 값 아님)
const PASSWORD = 'a10-test-pw-1';
let passwordHash = null;

// 새 사람 (비번 있음)
async function createUser(label) {
    passwordHash ??= await hashPassword(PASSWORD);
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: passwordHash,
        nickname: `${label}${uuid.slice(0, 4)}`.slice(0, 8),
        email: `${label}-${uuid}@example.test`,
    });
    return uuid;
}

// 로그인 (세션 발급: 그 사람 옛 세션 끊고 새 세션 + 토큰) → { token, sessionId }
async function login(uuid) {
    const user = await db.User.findByPk(uuid);
    const issued = await db.sequelize.transaction((transaction) => issueSessionForUser(user, {}, { ip: '127.0.0.1' }, transaction));
    const decoded = JSON.parse(Buffer.from(issued.token.split('.')[1], 'base64url').toString());
    return { token: issued.token, sessionId: decoded.sessionId };
}

// 접속 인증 한 번 → { err, socket } (통과면 err 없음, socket.data.user에 토큰 값)
function handshake(token) {
    const socket = { data: {}, handshake: { headers: { cookie: `accessToken=${token}` } } };
    return new Promise((resolve) => authenticateSocket(socket, (err) => resolve({ err, socket })));
}

// 로그인 → 접속 인증 → 세상에 소켓 붙이기
async function connectLoggedIn(w, uuid) {
    const { token, sessionId } = await login(uuid);
    const { err, socket: authed } = await handshake(token);
    assert.equal(err, undefined, `준비: 접속 거절 ${err?.message}`);
    const socket = await w.connect(uuid, { user: authed.data.user });
    return { socket, sessionId };
}

// DB 일이 끝날 때까지 기다림 (가짜 시계라 setImmediate로 돌리고 진짜 시간으로 끊음)
async function waitFor(check, label, timeoutMs = 8_000) {
    const until = performance.now() + timeoutMs;
    while (performance.now() < until) {
        if (await check()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error(`기다려도 안 됨: ${label}`);
}

// 거절 모양 확인: UNAUTHORIZED 하나, 까닭 안 실림
function expectRejected({ err, socket }) {
    assert.ok(err instanceof Error, '접속이 통과됨');
    assert.equal(err.message, 'UNAUTHORIZED');
    assert.equal(err.data, undefined);
    assert.equal(socket.data.user, undefined);
}

test('A10-B-311 로그인 세션 → 소켓 접속 됨', async (t) => {
    if (noDb(t)) return;
    makeWorld(t, { realDb: true, realSessions: true });
    const a = await createUser('b311');
    const { token } = await login(a);
    const { err, socket } = await handshake(token);
    assert.equal(err, undefined);
    assert.equal(socket.data.user.uuid, a);
});

test('A10-B-312 로그아웃한 세션 → UNAUTHORIZED', async (t) => {
    if (noDb(t)) return;
    makeWorld(t, { realDb: true, realSessions: true });
    const a = await createUser('b312');
    const { token, sessionId } = await login(a);
    await userRepository.recordLogout(a, sessionId);
    expectRejected(await handshake(token));
});

test('A10-B-313 정지 계정 → UNAUTHORIZED', async (t) => {
    if (noDb(t)) return;
    makeWorld(t, { realDb: true, realSessions: true });
    const a = await createUser('b313');
    const { token } = await login(a);
    await db.UserBan.create({ user_id: a, reason: '시험 정지', is_permanent: true });
    expectRejected(await handshake(token));
});

test('A10-B-314 탈퇴 계정 → UNAUTHORIZED', async (t) => {
    if (noDb(t)) return;
    makeWorld(t, { realDb: true, realSessions: true });
    const a = await createUser('b314');
    const { token } = await login(a);
    assert.deepEqual(await withdrawAccount({ uuid: a, password: PASSWORD }), { ok: true });
    expectRejected(await handshake(token));
});

test('A10-B-315 다른 기기 새 로그인 뒤 옛 세션 토큰 → UNAUTHORIZED', async (t) => {
    if (noDb(t)) return;
    makeWorld(t, { realDb: true, realSessions: true });
    const a = await createUser('b315');
    const first = await login(a);
    const second = await login(a);
    expectRejected(await handshake(first.token));
    assert.equal((await handshake(second.token)).err, undefined, '새 로그인 토큰도 거절됨');
});

test('A10-B-316 접속 뒤 DB에서 정지 → 5초 주기 검사 → force_disconnect ACCOUNT_BANNED', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true, realSessions: true });
    const a = await createUser('b316');
    const { socket } = await connectLoggedIn(w, a);
    await db.UserBan.create({ user_id: a, reason: '시험 정지', is_permanent: true });
    await w.tick(5_000);
    await waitFor(() => socket.connected === false, '끊김');
    assert.equal(w.received(socket, 'force_disconnect').at(-1)?.code, 'ACCOUNT_BANNED');
});

test('A10-B-317 접속 뒤 같은 계정 새 로그인 → 옛 소켓 다음 사건 SESSION_EXPIRED 거절 + 끊김', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true, realSessions: true });
    const a = await createUser('b317');
    const { socket } = await connectLoggedIn(w, a);
    await login(a);
    const reply = await w.lobby(socket);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'SESSION_EXPIRED');
    assert.equal(socket.connected, false);
});

test('A10-B-318 접속 뒤 탈퇴 처리 → force_disconnect ACCOUNT_WITHDRAWN', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true, realSessions: true });
    const a = await createUser('b318');
    const { socket } = await connectLoggedIn(w, a);
    assert.deepEqual(await withdrawAccount({ uuid: a, password: PASSWORD }), { ok: true });
    await w.settle();
    assert.equal(w.received(socket, 'force_disconnect').at(-1)?.code, 'ACCOUNT_WITHDRAWN');
    assert.equal(socket.connected, false);
});

test('A10-B-319 접속 중 세션 끝 시각 지남 → force_disconnect SESSION_EXPIRED', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true, realSessions: true });
    const a = await createUser('b319');
    const { socket, sessionId } = await connectLoggedIn(w, a);
    await db.UserSession.update({ refresh_token_expires_at: new Date(Date.now() + 1_000) }, { where: { id: sessionId } });
    await w.tick(5_000);
    await waitFor(() => socket.connected === false, '끊김');
    assert.equal(w.received(socket, 'force_disconnect').at(-1)?.code, 'SESSION_EXPIRED');
});
