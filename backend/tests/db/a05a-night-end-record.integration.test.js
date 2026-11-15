'use strict';

// 밤 시험(DB 붙음) — 밤 암살로 끝난 판이 판 기록(game_results·game_result_players)에 남는 모습, 이어지는 밤엔 저장 안 함
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-196~200, 돌리기(잠금): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a05a-night-end-record.integration.test.js
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models require보다 먼저
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const db = require('../../models');
// gameFixtures는 DB 주소를 막아 버려서 안 씀 → 가짜 소켓만 매칭 도우미에서 가져옴
const { createFakeSocket, createFakeIo } = require('../helpers/matchmakingFixtures');
const core = require('../../game-core/gameSession');
const gs = require('../../socket/gameSession');

const T = gs.__testables;
const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
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
    gs.__resetStateForTests();
    core.__resetStateForTests();
    // 판 기록 뒤 이어지는 골드·업적 저장이 끝날 틈 (닫힌 연결에 쓰다 오류 찍히는 것 막기)
    await new Promise((resolve) => setTimeout(resolve, 500));
    await db.sequelize.close();
});

// ── 판 차리기 도우미 (이 파일 안에서만 씀) ──

// 판 기록 참가자 줄은 users를 가리킴 → 사람을 DB에 먼저 만듦 (시험마다 새 uuid)
async function createUsers(n) {
    const uuids = [];
    for (let i = 0; i < n; i += 1) {
        const uuid = crypto.randomUUID();
        await db.User.create({
            uuid,
            password_hash: 'not-a-real-hash',
            nickname: `n5a${uuid.slice(0, 5)}`,
            email: `a05a-${uuid}@example.test`,
        });
        uuids.push(uuid);
    }
    return uuids;
}

// 판 열기 (직업은 randomFn 0으로 늘 같게) + 판 전원 가짜 소켓
async function openGame(n, settings) {
    const uuids = await createUsers(n);
    const roomId = crypto.randomUUID();
    const room = {
        id: roomId,
        players: new Map(uuids.map((uuid, i) => [uuid, { uuid, nickname: `밤${i}`, isReady: true }])),
        settings,
    };
    const candidate = core.__testables.buildSessionCandidate(room, { randomFn: () => 0, gameIdFn: () => crypto.randomUUID() });
    assert.equal(candidate.ok, true, `판 만들기 거절(${candidate.reason})`);
    core.commitGameSession(candidate.session);
    const s = candidate.session;
    const sockets = uuids.map((uuid) => {
        const sock = createFakeSocket(uuid);
        sock.rooms.add(s.channelId);
        sock.data.activeGameId = s.id;
        return sock;
    });
    const io = createFakeIo(sockets);
    gs.setOnlineUsersRegistry(new Map(sockets.map((sock) => [sock.data.user.uuid, sock.id])));
    return { s, io };
}

const byRole = (s, role) => [...s.players.values()].filter((p) => p.role === role).map((p) => p.uuid);
const aliveUuids = (s) => [...s.players.values()].filter((p) => p.alive).map((p) => p.uuid);

// 낮을 모두 기권으로 넘김 → 재판 없이 밤
function passDay(s) {
    T.stopDayPhaseTimer(s.id);
    if (s.phase === 'ROLE_REVEAL') core.forceCompleteRoleReveal(s);
    core.__testables.enterDayVotePhase(s);
    const voters = aliveUuids(s);
    for (const uuid of voters) core.submitDayVote(uuid, s.id, null);
    const prepared = core.prepareDayVoteResolution(voters[0], s.id, s.dayIndex);
    core.commitDayVoteResolution(prepared.session, prepared.resolution);
    assert.equal(s.phase, 'NIGHT', '기권 낮 뒤 밤이 아님 (준비 잘못)');
}

// 낮에 한 사람 재판(모두 그 사람 찍음) → 모두 유죄 → 처형 뒤 밤
function executeDay(s, uuid) {
    T.stopDayPhaseTimer(s.id);
    if (s.phase === 'ROLE_REVEAL') core.forceCompleteRoleReveal(s);
    core.__testables.enterDayVotePhase(s);
    for (const voter of aliveUuids(s)) core.submitDayVote(voter, s.id, voter === uuid ? null : uuid);
    const day = core.prepareDayVoteResolution(uuid, s.id, s.dayIndex);
    core.commitDayVoteResolution(day.session, day.resolution);
    const voters = aliveUuids(s).filter((u) => u !== uuid);
    for (const voter of voters) core.submitTribunalVote(voter, s.id, s.dayIndex, 'GUILTY');
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(s.players.get(uuid).alive, false, '처형 안 됨 (준비 잘못)');
    assert.equal(s.phase, 'NIGHT', '처형 뒤 밤이 아님 (준비 잘못)');
}

// 밤 한 번: 준 행동 내고 나머지 산 사람은 건너뛰기 → 서버 밤 마무리 관문(판 끝이면 판 기록 저장 시작)
function runNight(s, io, actions = []) {
    for (const [actor, target] of actions) {
        const reply = core.submitNightAction(actor, s.id, target);
        assert.equal(reply.ok, true, `밤 행동 거절(${reply.code}) (준비 잘못)`);
    }
    for (const uuid of core.__testables.getEligibleNightActorUuids(s)) {
        if (!s.nightActions.has(uuid)) core.submitNightAction(uuid, s.id, null);
    }
    const finalized = T.finalizeNightForSession(io, s);
    assert.equal(finalized.ok, true, `밤 마무리 거절(${finalized.code})`);
    return finalized;
}

// 판 기록 줄이 생길 때까지 기다림 (저장은 판정 방송을 안 막게 따로 돎)
// 표를 새로 만든 직후 첫 저장이 7~13초 걸린 적 있음 → 30초 넘으면 실패
async function waitForResult(gameId) {
    for (let i = 0; i < 600; i += 1) {
        const [rows] = await db.sequelize.query('SELECT * FROM game_results WHERE id = ?', { replacements: [gameId] });
        if (rows.length > 0) return rows;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return [];
}

async function playerRows(gameId) {
    const [rows] = await db.sequelize.query('SELECT * FROM game_result_players WHERE game_id = ?', { replacements: [gameId] });
    return new Map(rows.map((row) => [row.user_id, row]));
}

// MySQL 참·거짓은 0·1로 옴
const yes = (value) => Boolean(Number(value));

// ── 5명 광대2 첫 밤 암살로 판 끝 (B-196~198이 같은 판을 봄, 한 번만 만듦) ──
let firstNightGame = null;
function firstNightEnd() {
    firstNightGame ??= (async () => {
        const { s, io } = await openGame(5, { jokerCount: 2 });
        passDay(s);
        const [jokerA, jokerB] = byRole(s, 'JOKER');
        const [victim] = byRole(s, 'CITIZEN');
        const finalized = runNight(s, io, [[jokerA, victim], [jokerB, victim]]);
        assert.deepEqual(finalized.terminal, { winner: 'JOKER' }, '첫 밤에 판이 안 끝남 (준비 잘못)');
        const results = await waitForResult(s.id);
        return { s, results, players: await playerRows(s.id), jokers: [jokerA, jokerB], victim };
    })();
    return firstNightGame;
}

test('A05-B-196 5명 광대2 첫 밤 암살로 판 끝 → 판 기록 한 줄, 승자 광대', async (t) => {
    if (noDb(t)) return;
    const { results } = await firstNightEnd();
    assert.equal(results.length, 1);
    assert.equal(results[0].winner, 'JOKER');
});

test('A05-B-197 같은 판: 밤에 죽은 사람 참가 기록은 살아 있음 거짓, 죽은 이유 암살', async (t) => {
    if (noDb(t)) return;
    const { players, victim } = await firstNightEnd();
    const row = players.get(victim);
    assert.ok(row, '죽은 사람 참가 기록이 없음');
    assert.equal(yes(row.is_alive), false);
    assert.equal(row.death_reason, 'ASSASSINATION');
});

test('A05-B-198 같은 판: 광대 둘 이김, 시민 셋(죽은 시민 포함) 짐', async (t) => {
    if (noDb(t)) return;
    const { s, players, jokers } = await firstNightEnd();
    assert.equal(players.size, 5);
    for (const uuid of jokers) assert.equal(yes(players.get(uuid).won), true, `광대 ${uuid}가 안 이김`);
    const citizens = byRole(s, 'CITIZEN');
    assert.equal(citizens.length, 3);
    for (const uuid of citizens) assert.equal(yes(players.get(uuid).won), false, `시민 ${uuid}가 짐이 아님`);
});

test('A05-B-199 6명: 의사가 살려 판이 이어지면 그 밤엔 판 기록 0줄', async (t) => {
    if (noDb(t)) return;
    const { s, io } = await openGame(6, { jokerCount: 1 });
    passDay(s);
    const [a] = byRole(s, 'CITIZEN');
    const finalized = runNight(s, io, [[byRole(s, 'JOKER')[0], a], [byRole(s, 'DOCTOR')[0], a]]);
    assert.equal(finalized.terminal, null, '판이 끝나 버림 (준비 잘못)');
    // 저장이 걸렸다면 잡힐 만큼 기다린 뒤 셈 (판 끝 저장은 보통 바로 들어감)
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const [rows] = await db.sequelize.query('SELECT COUNT(*) AS n FROM game_results WHERE id = ?', { replacements: [s.id] });
    assert.equal(Number(rows[0].n), 0);
    T.stopDayPhaseTimer(s.id);
});

test('A05-B-200 10명 광대2: 처형·암살을 거쳐 셋째 밤 암살로 광대 승 → 승자 광대, 처형 = 처형·암살 = 암살', async (t) => {
    if (noDb(t)) return;
    const { s, io } = await openGame(10, { jokerCount: 2 });
    const [jokerA, jokerB] = byRole(s, 'JOKER');
    const [c1, c2, c3, c4, c5] = byRole(s, 'CITIZEN');
    const guard = byRole(s, 'GUARD')[0];
    const kill = (target) => [[jokerA, target], [jokerB, target]];
    executeDay(s, c1);
    assert.equal(runNight(s, io, kill(c2)).terminal, null);
    executeDay(s, c3);
    assert.equal(runNight(s, io, kill(c4)).terminal, null);
    executeDay(s, c5);
    assert.equal(s.dayIndex, 3, '셋째 밤이 아님 (준비 잘못)');
    const finalized = runNight(s, io, kill(guard));
    assert.deepEqual(finalized.terminal, { winner: 'JOKER' }, '셋째 밤에 판이 안 끝남 (준비 잘못)');

    const results = await waitForResult(s.id);
    assert.equal(results.length, 1);
    assert.equal(results[0].winner, 'JOKER');
    const players = await playerRows(s.id);
    for (const uuid of [c1, c3, c5]) assert.equal(players.get(uuid)?.death_reason, 'EXECUTION', `처형된 ${uuid}`);
    for (const uuid of [c2, c4, guard]) assert.equal(players.get(uuid)?.death_reason, 'ASSASSINATION', `암살된 ${uuid}`);
});
