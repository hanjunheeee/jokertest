'use strict';

// 판 끝 뒤 같은 방과 탈주 기록 시험(DB 붙음) — 탈주한 사람은 대기 시간 동안 그 코드로 못 들어옴·끝나면 들어옴, 60초 탈락자도 같음, 죽고 나감·결과 화면 로비로·180초 닫힘·새로고침·대기방으로 갔다 나감은 탈주 아님(game_desertions 0줄)
// 목록 A08-B-211~218, 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a08-return-desertion.integration.test.js
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

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
const db = require('../../models');
// 판 세상은 models 다음에 (DB 주소를 안 건드림)
const { makeWorld } = require('../flow/a08-world');

const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });
// 가짜 시계 시작: 2026-11-16 12:00 (한국 시각, 그날 첫 탈주가 되게)
const START = Date.UTC(2026, 10, 16, 3, 0, 0);
const COOLDOWN_MS = 5 * 60_000;

const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 with-lock.sh testdb로 돌림');
    return true;
};

test.before(async () => {
    if (!TEST_DB_URL) return;
    await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
    await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
});

test.after(async () => {
    // 판 끝 저장·골드가 끝날 틈 (닫힌 연결에 쓰다 오류 찍히는 것 막기)
    await waitReal(500);
    await db.sequelize.close();
});

// 진짜 시간으로 기다리기 (가짜 시계가 setTimeout을 잡고 있어서 setImmediate로 돌림)
async function waitReal(ms) {
    const until = performance.now() + ms;
    while (performance.now() < until) await new Promise((resolve) => setImmediate(resolve));
}
async function waitFor(check, label, ms = 10_000) {
    const until = performance.now() + ms;
    while (performance.now() < until) {
        if (await check()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.fail(`${label} 기다리다 시간 넘김`);
}

// 판 사람을 DB에 먼저 만듦 (시험마다 새 uuid)
async function createUsers(n) {
    const uuids = [];
    for (let i = 0; i < n; i += 1) {
        const uuid = crypto.randomUUID();
        await db.User.create({ uuid, password_hash: 'not-a-real-hash', nickname: `a8${uuid.slice(0, 6)}`, email: `a08-${uuid}@example.test` });
        uuids.push(uuid);
    }
    return uuids;
}

const desertionRows = (uuid) => db.GameDesertion.findAll({ where: { user_id: uuid }, raw: true });
const desertionCount = async (uuids) => (await db.GameDesertion.count({ where: { user_id: uuids } }));

// 판 하나 열기 (진짜 uuid, 판 저장·탈주 기록은 진짜 DB)
async function openGame(t, n) {
    const w = makeWorld(t, { now: START, realDb: true });
    const uuids = await createUsers(n);
    const g = await w.openAndStart({ uuids, n });
    return { w, g };
}

const WAIT_MESSAGE = /^탈주로 \d+분 \d+초 뒤에 참여할 수 있습니다/;

// 판 중 X가 산 채로 나감(그날 1번째) → 광대도 나가 판 끝 → 탈주 시각
async function xLeavesAlive(t, n) {
    const { w, g } = await openGame(t, n);
    const x = g.uuids[1];
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    const desertedAt = Date.now();
    assert.equal((await w.lobby(x, g.gameId)).ok, true);
    await w.endGame(g, 'jokerLeaves');
    await waitFor(async () => (await desertionRows(x)).length === 1, 'X 탈주 줄');
    return { w, g, x, desertedAt };
}

test('A08-B-211 6명 판 산 채로 나감(그날 1번째) → 판 끝 뒤 남은 4:59에 코드 입장 → DESERTION_COOLDOWN, "탈주로 ○분 ○초 뒤에 참여할 수 있습니다"', async (t) => {
    if (noDb(t)) return;
    const { w, g, x, desertedAt } = await xLeavesAlive(t, 6);
    w.tick(desertedAt + 1_000 - Date.now());
    const joined = await w.joinCode(x, g.roomCode);
    assert.equal(joined.ok, false);
    assert.equal(joined.code, 'DESERTION_COOLDOWN');
    assert.match(joined.message, WAIT_MESSAGE);
    assert.equal(joined.message, '탈주로 4분 59초 뒤에 참여할 수 있습니다.');
});

test('A08-B-212 6명 판 B-211 사람이 탈주 5:00 뒤 코드 입장 → 들어감', async (t) => {
    if (noDb(t)) return;
    const { w, g, x, desertedAt } = await xLeavesAlive(t, 6);
    // 방이 180초 뒤에도 남게 한 사람이 먼저 들어가 있음 (빈 방은 180초에 없어짐)
    assert.equal((await w.ret(g.uuids[2], g.gameId)).ok, true);
    w.tick(desertedAt + COOLDOWN_MS - Date.now());
    const joined = await w.joinCode(x, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code} ${joined.message}`);
});

test('A08-B-213 7명 판 끊긴 뒤 60초 탈락(그날 1번째) → 판 끝 뒤 코드 입장 → DESERTION_COOLDOWN, return_to_room도 거절', async (t) => {
    if (noDb(t)) return;
    const { w, g } = await openGame(t, 7);
    const x = g.uuids[1];
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    await w.disconnect(x);
    w.tick(61_000);
    await waitFor(async () => (await desertionRows(x)).length === 1, 'X 탈주 줄');
    assert.equal((await desertionRows(x))[0].reason, 'DISCONNECT_TIMEOUT');
    await w.endGame(g, 'jokerLeaves');
    await w.reconnect(x);
    const joined = await w.joinCode(x, g.roomCode);
    assert.equal(joined.ok, false);
    assert.equal(joined.code, 'DESERTION_COOLDOWN');
    const back = await w.ret(x, g.gameId);
    assert.equal(back.ok, false);
});

test('A08-B-214 6명 판 처형 뒤 나감 → game_desertions 0줄, 판 끝 뒤 코드 입장 → 들어감', async (t) => {
    if (noDb(t)) return;
    const { w, g } = await openGame(t, 6);
    const x = g.uuids[1];
    await w.day(g, x);
    assert.equal(w.alivePlayers(g).includes(x), false, '처형 안 됨 (준비 잘못)');
    assert.equal((await w.lobby(x, g.gameId)).ok, true);
    await w.endGame(g);
    await waitReal(200);
    assert.equal((await desertionRows(x)).length, 0);
    const joined = await w.joinCode(x, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code} ${joined.message}`);
});

test('A08-B-215 5명 판 결과 화면 "로비로" → game_desertions 0줄, 바로 다른 방 입장 됨', async (t) => {
    if (noDb(t)) return;
    const { w, g } = await openGame(t, 5);
    await w.endGame(g);
    const b = g.uuids[1];
    assert.equal((await w.lobby(b, g.gameId)).ok, true);
    const other = (await createUsers(1))[0];
    w.connect(other);
    const created = await w.createRoom(other, w.roomPayload({ maxPlayers: 5 }));
    assert.equal(created.ok, true);
    const joined = await w.joinCode(b, created.room.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code} ${joined.message}`);
    await waitReal(200);
    assert.equal((await desertionRows(b)).length, 0);
});

test('A08-B-216 6명 판 결과 화면 그대로 180초 → 0줄', async (t) => {
    if (noDb(t)) return;
    const { w, g } = await openGame(t, 6);
    await w.endGame(g);
    w.tickToSinceEnd(g, 180_000);
    assert.equal(w.received(g.uuids[1], 'game_result_closed').length, 1, '결과 화면이 안 닫힘 (준비 잘못)');
    await waitReal(200);
    assert.equal(await desertionCount(g.uuids), 0);
});

test('A08-B-217 5명 판 결과 화면 끊김 → 0줄', async (t) => {
    if (noDb(t)) return;
    const { w, g } = await openGame(t, 5);
    await w.endGame(g);
    const c = g.uuids[2];
    await w.disconnect(c);
    w.tick(61_000);
    await waitReal(200);
    assert.equal((await desertionRows(c)).length, 0);
});

test('A08-B-218 6명 판 대기방으로 → 대기방에서 나감 → 0줄', async (t) => {
    if (noDb(t)) return;
    const { w, g } = await openGame(t, 6);
    await w.endGame(g);
    const c = g.uuids[2];
    assert.equal((await w.ret(c, g.gameId)).ok, true);
    await w.leaveRoom(c);
    assert.equal(await w.currentRoom(c), null);
    await waitReal(200);
    assert.equal((await desertionRows(c)).length, 0);
});
