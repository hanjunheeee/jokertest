'use strict';

// 같은 방 두 판 기록 시험(DB 붙음) — 대기방으로 모여 둘째 판을 해도 전적은 판마다 따로, 판 골드도 판마다 한 번
// 목록 A08-B-219~220, 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a08-second-game-record.integration.test.js
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
const START = Date.UTC(2026, 10, 16, 3, 0, 0);

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
    await waitReal(500);
    await db.sequelize.close();
});

// 진짜 시간으로 기다리기 (가짜 시계가 setTimeout을 잡고 있어서 setImmediate로 돌림)
async function waitReal(ms) {
    const until = performance.now() + ms;
    while (performance.now() < until) await new Promise((resolve) => setImmediate(resolve));
}
async function waitFor(check, label, ms = 15_000) {
    const until = performance.now() + ms;
    while (performance.now() < until) {
        if (await check()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.fail(`${label} 기다리다 시간 넘김`);
}

async function createUsers(n) {
    const uuids = [];
    for (let i = 0; i < n; i += 1) {
        const uuid = crypto.randomUUID();
        await db.User.create({ uuid, password_hash: 'not-a-real-hash', nickname: `a8${uuid.slice(0, 6)}`, email: `a08r-${uuid}@example.test` });
        uuids.push(uuid);
    }
    return uuids;
}

// 판1 끝 → 전원 대기방으로(방장 먼저)·준비 → 판2 끝
async function twoGames(t, n) {
    const w = makeWorld(t, { now: START, realDb: true });
    const uuids = await createUsers(n);
    const g1 = await w.openAndStart({ uuids, n });
    await w.endGame(g1);
    for (const uuid of uuids) assert.equal((await w.ret(uuid, g1.gameId)).ok, true, `${uuid} 대기방으로 실패`);
    for (const uuid of uuids) assert.equal((await w.ready(uuid)).ok, true, `${uuid} 준비 실패`);
    const g2 = await w.startGame(uuids, g1.host, w.jokerPresets(uuids, 1));
    await w.endGame(g2);
    return { w, g1, g2, uuids };
}

const resultPlayerRows = (uuids) => db.GameResultPlayer.findAll({ where: { user_id: uuids }, raw: true });

test('A08-B-219 5명 판1 끝 → 대기방으로 → 판2 끝 → 전적 표에 판 id 두 개, 사람마다 줄 두 개', async (t) => {
    if (noDb(t)) return;
    const { g1, g2, uuids } = await twoGames(t, 5);
    assert.notEqual(g1.gameId, g2.gameId);
    await waitFor(async () => (await resultPlayerRows(uuids)).length >= uuids.length * 2, '전적 줄');
    const games = await db.GameResult.findAll({ where: { id: [g1.gameId, g2.gameId] }, raw: true });
    assert.deepEqual(games.map((r) => r.id).sort(), [g1.gameId, g2.gameId].sort());
    const rows = await resultPlayerRows(uuids);
    for (const uuid of uuids) {
        const mine = rows.filter((r) => r.user_id === uuid).map((r) => r.game_id).sort();
        assert.deepEqual(mine, [g1.gameId, g2.gameId].sort(), `${uuid} 전적 줄`);
    }
});

test('A08-B-220 6명 판1·판2 끝 → 장부 GAME_REWARD 사람마다 2줄(game-reward:<판1>·game-reward:<판2>), 대기방으로 간 것과 상관없음', async (t) => {
    if (noDb(t)) return;
    const { g1, g2, uuids } = await twoGames(t, 6);
    const refs = [`game-reward:${g1.gameId}`, `game-reward:${g2.gameId}`].sort();
    const ledger = () => db.sequelize.query(
        'SELECT user_id, reason, reference_event_id FROM economy_ledger_entries WHERE user_id IN (:uuids) AND reason = :reason',
        { replacements: { uuids, reason: 'GAME_REWARD' }, type: db.Sequelize.QueryTypes.SELECT },
    );
    await waitFor(async () => (await ledger()).length >= uuids.length * 2, '판 골드 장부 줄');
    await waitReal(200);
    const rows = await ledger();
    for (const uuid of uuids) {
        const mine = rows.filter((r) => r.user_id === uuid).map((r) => r.reference_event_id).sort();
        assert.deepEqual(mine, refs, `${uuid} 판 골드 줄`);
    }
});
