'use strict';

// 다른 기기 새 로그인에 밀린 소켓의 끊김 안내 시험(시험 DB, 서버 한 대) — 5초 주기 검사·다음 사건이 먼저 봐도 "세션 만료" 말고 다른 로그인 안내
// 목록 A11-B-395~397 (docs/게임_의도_2026-11-15/시험목록/A11a-가입-로그인-세션.md "세션 끊김 까닭으로 더한 것"), 돌리기: with-lock.sh testdb
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models·socket require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
// 시험 전용 서명 값 (시험 환경값에 없으면 넣음, 진짜 값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a11e-replaced-login-test-only';

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
const { issueSessionForUser } = require('../../services/auth/account/session');
const { authenticateSocket } = require('../../socket/connection/auth');
const { makeWorld } = require('../flow/a10-world');

const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// 다른 로그인 안내 글 (socket/connection/replace.js가 다른 Node 밀어내기에 쓰는 글과 같음, 결정 MN-064)
const REPLACED = {
    code: 'REPLACED_BY_OTHER_LOGIN',
    message: '다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.',
};

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
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

// 새 사람 (비번 칸은 쓰지 않음 — 로그인은 세션 발급 함수로 바로 함)
async function createUser(label) {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: 'a11e-not-a-real-hash',
        nickname: `${label}${uuid.slice(0, 4)}`.slice(0, 8),
        email: `${label}-${uuid}@example.test`,
    });
    return uuid;
}

// 로그인 (진짜 로그인처럼 거래 하나 안에서 옛 세션 끊고 새 세션) → access 토큰
async function login(uuid) {
    const user = await db.User.findByPk(uuid);
    const issued = await db.sequelize.transaction((transaction) => issueSessionForUser(user, {}, { ip: '127.0.0.1' }, transaction));
    return issued.token;
}

// 로그인 → 접속 인증 → 세상에 소켓 붙이기 (기기 하나)
async function connectDevice(w, uuid) {
    const token = await login(uuid);
    const socket = { data: {}, handshake: { headers: { cookie: `accessToken=${token}` } } };
    const err = await new Promise((resolve) => authenticateSocket(socket, resolve));
    assert.equal(err, undefined, `준비: 접속 거절 ${err?.message}`);
    return w.connect(uuid, { user: socket.data.user });
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

// 끊김 안내 첫 번째 (화면은 첫 안내를 띄우고 로그인 화면으로 감)
const firstNotice = (w, socket) => w.received(socket, 'force_disconnect')[0];

test('A11-B-395 기기1 접속 → 기기2 새 로그인(소켓 아직 안 붙음) → 5초 주기 검사 → 기기1 다른 로그인 안내', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true, realSessions: true });
    const a = await createUser('r395');
    const device1 = await connectDevice(w, a);
    await login(a);
    await w.tick(5_000);
    await waitFor(() => device1.connected === false, '기기1 끊김');
    assert.deepEqual(firstNotice(w, device1), REPLACED);
});

test('A11-B-396 기기1 접속 → 기기2 새 로그인 → 기기1 다음 사건 거절 답 + 다른 로그인 안내', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true, realSessions: true });
    const a = await createUser('r396');
    const device1 = await connectDevice(w, a);
    await login(a);
    const reply = await w.lobby(device1);
    // 답 code는 사건 거절 하나(SESSION_EXPIRED)로 그대로, 글은 다른 로그인 안내
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'SESSION_EXPIRED');
    assert.equal(reply.message, REPLACED.message);
    assert.equal(device1.connected, false);
    assert.deepEqual(firstNotice(w, device1), REPLACED);
});

test('A11-B-397 기기1 접속 → 로그아웃만(새 로그인 없음) → 5초 주기 검사 → 세션 만료 안내 그대로', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true, realSessions: true });
    const a = await createUser('r397');
    const device1 = await connectDevice(w, a);
    await userRepository.recordLogout(a, device1.data.user.sessionId);
    await w.tick(5_000);
    await waitFor(() => device1.connected === false, '기기1 끊김');
    assert.deepEqual(firstNotice(w, device1), {
        code: 'SESSION_EXPIRED',
        message: '세션이 만료되었습니다. 다시 로그인해주세요.',
    });
});
