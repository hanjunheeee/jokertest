'use strict';

// 관리자 회원 상세 탈주 기록 시험 — GET /admin-api/members/:uuid 의 desertions 칸 (최근 것 먼저·막힘 중 표시·다른 회원 안 섞임·최근 50줄)
// 목록 A09-B-445~448 (docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { prepareAdminDb, adminTestApp } = require('./helpers/adminTestApp');
const db = require('../../models');

let prepared = null;

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 test:with-db·with-lock.sh testdb로 돌림');
    return true;
};

test.before(async () => {
    if (!TEST_DB_URL) return;
    prepared = await prepareAdminDb();
});

test.after(async () => {
    if (prepared) await prepared.close();
    else await db.sequelize.close();
});

// 시험마다 새 회원 하나
async function createMember(label) {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: 'not-a-real-hash',
        nickname: `${label}${uuid.slice(0, 4)}`.slice(0, 12),
        email: `${label}-${uuid}@example.test`,
    });
    return uuid;
}

// 탈주 줄 하나 (시각 ms), 넣은 판 id 돌려줌
async function addDesertion(userId, { desertedAt, blockedUntil, reason = 'LEFT_ALIVE' }) {
    const gameId = crypto.randomUUID();
    await db.GameDesertion.create({
        user_id: userId, game_id: gameId, reason, deserted_at: new Date(desertedAt), blocked_until: new Date(blockedUntil),
    });
    return gameId;
}

// 관리자로 회원 상세 받기
async function memberDetail(t, uuid) {
    const { agent } = await adminTestApp({ t });
    const res = await agent.get(`/admin-api/members/${uuid}`);
    assert.equal(res.status, 200, `회원 상세 실패 ${res.status} ${res.body?.code}`);
    return res.body;
}

test('A09-B-445 탈주 2줄 회원 → desertions 2개, 최근 것 먼저, 칸 gameId·reason·desertedAt·blockedUntil·active', async (t) => {
    if (noDb(t)) return;
    const uuid = await createMember('m445');
    const base = Date.UTC(2026, 10, 16, 3, 0, 0);
    const older = await addDesertion(uuid, { desertedAt: base, blockedUntil: base + 5 * 60_000 });
    const newer = await addDesertion(uuid, { desertedAt: base + 3_600_000, blockedUntil: base + 3_600_000 + 30 * 60_000, reason: 'DISCONNECT_TIMEOUT' });
    const body = await memberDetail(t, uuid);
    assert.equal(body.desertions.length, 2);
    assert.deepEqual(body.desertions.map((r) => r.gameId), [newer, older]);
    const [first] = body.desertions;
    for (const key of ['gameId', 'reason', 'desertedAt', 'blockedUntil', 'active']) assert.ok(key in first, `${key} 칸 없음`);
    assert.equal(first.reason, 'DISCONNECT_TIMEOUT');
    assert.equal(first.desertedAt, new Date(base + 3_600_000).toISOString());
    assert.equal(first.blockedUntil, new Date(base + 3_600_000 + 30 * 60_000).toISOString());
});

test('A09-B-446 막힘 끝 = 지금 − 1초 줄 → active false, 지금 + 1초 → true', async (t) => {
    if (noDb(t)) return;
    const uuid = await createMember('m446');
    const now = Date.now();
    // DB 시각은 초 단위로 저장될 수 있어 초 경계에 맞춤 (끝났음 ≤ 지금 − 1초, 막힘 중 ≥ 지금 + 1초)
    const past = Math.floor(now / 1000) * 1000 - 1000;
    const future = Math.ceil(now / 1000) * 1000 + 1000;
    const ended = await addDesertion(uuid, { desertedAt: past - 5 * 60_000, blockedUntil: past });
    const active = await addDesertion(uuid, { desertedAt: future - 5 * 60_000, blockedUntil: future });
    const body = await memberDetail(t, uuid);
    const byGame = new Map(body.desertions.map((r) => [r.gameId, r]));
    assert.equal(byGame.get(ended).active, false);
    assert.equal(byGame.get(active).active, true);
});

test('A09-B-447 탈주 없는 회원 → desertions [], 다른 회원 줄 0개', async (t) => {
    if (noDb(t)) return;
    const clean = await createMember('m447a');
    const other = await createMember('m447b');
    const now = Date.now();
    const otherGame = await addDesertion(other, { desertedAt: now, blockedUntil: now + 5 * 60_000 });
    const body = await memberDetail(t, clean);
    assert.deepEqual(body.desertions, []);
    const otherBody = await memberDetail(t, other);
    assert.deepEqual(otherBody.desertions.map((r) => r.gameId), [otherGame]);
});

test('A09-B-448 60줄 회원 → 최근 50개 [지금 동작]', async (t) => {
    if (noDb(t)) return;
    const uuid = await createMember('m448');
    const base = Date.UTC(2026, 10, 1, 3, 0, 0);
    const rows = Array.from({ length: 60 }, (_, i) => ({
        user_id: uuid,
        game_id: crypto.randomUUID(),
        reason: 'LEFT_ALIVE',
        deserted_at: new Date(base + i * 60_000),
        blocked_until: new Date(base + i * 60_000 + 5 * 60_000),
    }));
    await db.GameDesertion.bulkCreate(rows);
    const body = await memberDetail(t, uuid);
    assert.equal(body.desertions.length, 50);
    // 최근 것 먼저 → 맨 앞은 마지막에 넣은 줄
    assert.equal(body.desertions[0].gameId, rows[59].game_id);
});
