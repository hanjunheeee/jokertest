'use strict';

// 로비 입장 정리 시험(시험 DB) — 로비 정리는 DB에 안 씀, 산 사람·죽은 사람 로비는 탈주 아님, 풀린 죽은 사람도 판 끝 골드, 탈주 대기 중엔 정리는 되고 만들기는 막힘
// 목록 A10-B-301~310·320 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models·socket require보다 먼저
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
// 모델을 세상 도우미보다 먼저 불러 시험 DB에 붙여 둠 (도우미가 DB 주소를 막아도 이미 붙은 모델은 그대로)
const db = require('../../models');
const gameSettings = require('../../services/ops/gameSettings');
const desertion = require('../../services/game/desertion');
const desertionRepository = require('../../repositories/game/desertion');
const { makeWorld, NOTHING } = require('../flow/a10-world');

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

// 시험마다 새 사람 n명 (uuid가 달라 같은 파일 시험끼리 안 섞임)
async function createUsers(label, n) {
    const uuids = [];
    for (let i = 0; i < n; i += 1) {
        const uuid = crypto.randomUUID();
        await db.User.create({
            uuid,
            password_hash: 'not-a-real-hash',
            nickname: `${label}${i}${uuid.slice(0, 3)}`.slice(0, 8),
            email: `${label}-${i}-${uuid}@example.test`,
        });
        uuids.push(uuid);
    }
    return uuids;
}

// DB 일이 끝날 때까지 기다림 (가짜 시계라 setTimeout 대신 setImmediate로 돌리고 진짜 시간으로 끊음)
async function waitFor(check, label, timeoutMs = 8_000) {
    const until = performance.now() + timeoutMs;
    while (performance.now() < until) {
        if (await check()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error(`기다려도 안 됨: ${label}`);
}

// 표 줄 수 (회원·장부·전적·탈주)
async function countRows() {
    const tables = ['users', 'economy_ledger_entries', 'game_results', 'game_result_players', 'game_desertions'];
    const out = {};
    for (const table of tables) {
        const [rows] = await db.sequelize.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
        out[table] = Number(rows[0].n);
    }
    return out;
}

// 그 사람 판 골드 장부 줄 (값만)
const rewardsOf = async (uuid) => (await db.EconomyLedgerEntry.findAll({ where: { user_id: uuid, reason: 'GAME_REWARD' }, raw: true }))
    .map((row) => Number(row.amount));
// 그 사람 지갑 골드 (줄 없으면 0)
async function goldOf(uuid) {
    const [rows] = await db.sequelize.query('SELECT balance_gold FROM economy_wallets WHERE user_id = :uuid', { replacements: { uuid } });
    return rows.length ? Number(rows[0].balance_gold) : 0;
}
// 그 사람 탈주 줄 수
const desertionsOf = (uuid) => db.GameDesertion.count({ where: { user_id: uuid } });

// 광대 아닌 사람
const citizens = (g) => g.uuids.filter((u) => !g.jokers.includes(u));

// DB 세상 + n명 판 (광대 = 맨 끝 사람)
async function dbGame(t, label, n, extra = {}) {
    const w = makeWorld(t, { realDb: true });
    const uuids = await createUsers(label, n);
    const g = await w.openGame({ prefix: label, n, uuids, ...extra });
    return { w, g };
}

test('A10-B-301 정리할 것 없는 사람 로비 → 회원·장부·전적·탈주 표 줄 수 그대로', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true });
    const [a] = await createUsers('b301', 1);
    await w.connect(a);
    const before = await countRows();
    assert.deepEqual((await w.lobby(a)).cleared, { ...NOTHING });
    assert.deepEqual(await countRows(), before);
});

test('A10-B-302 6명 방 방장 로비 정리 → 회원·장부·전적·탈주 표 줄 수 그대로', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true });
    const uuids = await createUsers('b302', 6);
    const r = await w.openRoom({ prefix: 'b302', n: 6, uuids });
    const before = await countRows();
    assert.equal((await w.lobby(r.host)).cleared.room, true);
    assert.deepEqual(await countRows(), before);
});

test('A10-B-303 7명 판 산 사람 로비 → game_desertions 그 사람 0줄', async (t) => {
    if (noDb(t)) return;
    const { w, g } = await dbGame(t, 'b303', 7);
    await w.toDay(g);
    const a = citizens(g)[1];
    assert.equal((await w.lobby(a)).redirect, 'INGAME');
    await w.tickBy(5_000);
    assert.equal(await desertionsOf(a), 0);
});

test('A10-B-304 8명 판 처형된 사람 로비 → game_desertions 0줄', async (t) => {
    if (noDb(t)) return;
    const { w, g } = await dbGame(t, 'b304', 8);
    const a = citizens(g)[1];
    await w.voteOut(g, a);
    assert.equal((await w.lobby(a)).cleared.liveGame, true);
    await w.tickBy(5_000);
    assert.equal(await desertionsOf(a), 0);
});

test('A10-B-305 6명 판 시민 A 1일 밤 죽음 → A 로비 → 시민 승 → A GAME_REWARD 1줄 값 1, 지갑 +1', async (t) => {
    if (noDb(t)) return;
    const { w, g } = await dbGame(t, 'b305', 6);
    const a = citizens(g)[1];
    const goldBefore = await goldOf(a);
    await w.killFirstNight(g, a);
    assert.equal((await w.lobby(a)).cleared.liveGame, true);
    await w.voteOut(g, g.joker);
    assert.equal(w.phaseOf(g.gameId), 'ENDED', '준비: 판이 안 끝남');
    await waitFor(async () => (await rewardsOf(a)).length >= 1, 'A 판 골드 장부 줄');
    assert.deepEqual(await rewardsOf(a), [1]);
    assert.equal(await goldOf(a), goldBefore + 1);
});

test('A10-B-306 7명 판 광대 A 처형 → A 로비 → 시민 승 → A GAME_REWARD 1줄 값 1', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true });
    const uuids = await createUsers('b306', 7);
    // 광대 둘 (A 처형 뒤에도 판이 이어지게): A = 5번, 남은 광대 = 6번
    const roles = { [uuids[5]]: 'JOKER', [uuids[6]]: 'JOKER' };
    const g = await w.openGame({ prefix: 'b306', n: 7, uuids, roles, jokerCount: 2 });
    const a = uuids[5];
    await w.voteOut(g, a);
    assert.notEqual(w.phaseOf(g.gameId), 'ENDED', '준비: 판이 끝남');
    assert.equal((await w.lobby(a)).cleared.liveGame, true);
    await w.voteOut(g, uuids[6]);
    assert.equal(w.phaseOf(g.gameId), 'ENDED', '준비: 판이 안 끝남');
    await waitFor(async () => (await rewardsOf(a)).length >= 1, 'A 판 골드 장부 줄');
    assert.deepEqual(await rewardsOf(a), [1]);
});

test('A10-B-307 5명 판 죽은 A 로비 → 판 끝 → 전적에 A 줄 있음, 탈주 표시 없음', async (t) => {
    if (noDb(t)) return;
    const { w, g } = await dbGame(t, 'b307', 5);
    const a = citizens(g)[1];
    await w.killFirstNight(g, a);
    await w.lobby(a);
    await w.voteOut(g, g.joker);
    await waitFor(async () => (await db.GameResultPlayer.count({ where: { game_id: g.gameId } })) === 5, '전적 줄');
    const row = await db.GameResultPlayer.findOne({ where: { game_id: g.gameId, user_id: a }, raw: true });
    assert.ok(row, '전적에 A 줄 없음');
    assert.notEqual(row.death_reason, 'DISCONNECT', '탈주로 남음');
    assert.equal(await desertionsOf(a), 0);
});

test('A10-B-308 10명 판 끝(골드 1줄) → A 로비 → A GAME_REWARD 여전히 1줄', async (t) => {
    if (noDb(t)) return;
    const { w, g } = await dbGame(t, 'b308', 10);
    const a = citizens(g)[3];
    await w.playToCitizenWin(g);
    await waitFor(async () => (await rewardsOf(a)).length >= 1, 'A 판 골드 장부 줄');
    assert.equal((await w.lobby(a)).cleared.endedGame, true);
    await w.tickBy(5_000);
    await w.settle(50);
    assert.deepEqual(await rewardsOf(a), [1]);
});

test('A10-B-309 6명 판 산 A 로비(→ 판으로) → 판 끝까지 → A GAME_REWARD 1줄', async (t) => {
    if (noDb(t)) return;
    const { w, g } = await dbGame(t, 'b309', 6);
    const a = citizens(g)[1];
    await w.toDay(g);
    assert.equal((await w.lobby(a)).redirect, 'INGAME');
    await w.playToCitizenWin(g);
    await waitFor(async () => (await rewardsOf(a)).length >= 1, 'A 판 골드 장부 줄');
    assert.deepEqual(await rewardsOf(a), [1]);
});

test('A10-B-310 판 골드 값 2로 바꾼 뒤 시작한 8명 판, 죽은 A 로비 → 판 끝 → A GAME_REWARD 값 2', async (t) => {
    if (noDb(t)) return;
    // 관리자가 저장한 것처럼 표 값을 바꾸고 다시 읽음 (끝에 1로 되돌림)
    await db.GameSetting.update({ value_int: 2 }, { where: { key: 'GAME_GOLD_REWARD' } });
    await gameSettings.reloadGameSettings();
    t.after(async () => {
        await db.GameSetting.update({ value_int: 1 }, { where: { key: 'GAME_GOLD_REWARD' } });
        await gameSettings.reloadGameSettings();
    });
    const { w, g } = await dbGame(t, 'b310', 8);
    const a = citizens(g)[1];
    await w.killFirstNight(g, a);
    await w.lobby(a);
    await w.voteOut(g, g.joker);
    await waitFor(async () => (await rewardsOf(a)).length >= 1, 'A 판 골드 장부 줄');
    assert.deepEqual(await rewardsOf(a), [2]);
});

test('A10-B-320 오늘 1번째 탈주 줄(5분 대기) + 대기방 없음 → 로비 ok → create_room 탈주 거절, 남은 시간 안내', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t, { realDb: true });
    const [a] = await createUsers('b320', 1);
    const desertedAt = new Date(Date.now() - 60_000);
    await desertionRepository.insertDesertion({
        userId: a, gameId: crypto.randomUUID(), reason: 'LEFT_ALIVE', desertedAt, blockedUntil: new Date(desertedAt.getTime() + 5 * 60_000),
    });
    // 서버 켤 때처럼 막힘 표를 DB에서 읽음
    desertion.__resetForTests();
    assert.equal((await desertion.loadActiveDesertions()).ok, true);
    await w.connect(a);
    const reply = await w.lobby(a);
    assert.equal(reply.ok, true);
    assert.deepEqual(reply.cleared, { ...NOTHING });
    const created = await w.createRoom(a);
    assert.equal(created.ok, false);
    assert.equal(created.code, 'DESERTION_COOLDOWN');
    assert.equal(created.message, '탈주로 4분 0초 뒤에 참여할 수 있습니다.');
});
