'use strict';

// 재판 판 끝 기록 DB 시험: 처형 죽은 이유·처형 횟수·재판 중 피고 나감·끊김 탈주 줄·처형 뒤 나감 골드를 시험 DB에 진짜로 쓰고 읽음
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-301~310 (돌리기: with-lock.sh testdb, 시험_도우미.md 3-3)
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
// 모델을 먼저 불러 시험 DB에 붙여 둠 (gameFixtures가 DATABASE_URL을 막는 값으로 바꾸기 전에)
const db = require('../../models');
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const gameSettings = require('../../services/ops/gameSettings');

process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const { core } = gf;
const T = gs.__testables;
const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

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
    gs.__resetStateForTests();
    await db.sequelize.close();
});

// 시험마다 새 사람 n명 (계정 + 통계 한 줄), uuid가 달라 시험끼리 안 섞임
async function createUsers(n, label) {
    const uuids = [];
    for (let i = 0; i < n; i += 1) {
        const uuid = crypto.randomUUID();
        await db.User.create({
            uuid,
            password_hash: 'not-a-real-hash',
            nickname: `${label}${i}${uuid.slice(0, 4)}`.slice(0, 12),
            email: `${label}-${i}-${uuid}@example.test`,
        });
        await db.UserStats.create({ user_id: uuid });
        uuids.push(uuid);
    }
    return uuids;
}

// 진짜 계정으로 판 열기 (직업 고정 randomFn 0, 광대 1·나머지 시민) + 첫 낮 + 판 골드 값(판 시작이 넣는 값과 같게)
async function startGame(t, n, label) {
    const uuids = await createUsers(n, label);
    const room = {
        id: crypto.randomUUID(),
        players: new Map(uuids.map((uuid, i) => [uuid, { uuid, nickname: `${label}${i}`, isReady: true }])),
        settings: { maxPlayers: 10, jokerCount: 1, roleCompositionMode: 'custom', roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 } },
    };
    const candidate = core.__testables.buildSessionCandidate(room, { randomFn: () => 0, gameIdFn: () => crypto.randomUUID() });
    assert.equal(candidate.ok, true, `판 만들기 거절: ${candidate.reason ?? candidate.code}`);
    core.commitGameSession(candidate.session);
    const session = candidate.session;
    session.goldReward = gameSettings.getGameGoldReward();
    gf.toDay(session);
    // 이탈 반영이 방송하는 곳 (가짜 소켓), 시험 끝에 타이머·유예 전부 끔
    const world = gf.socketWorld(gs, session);
    t.after(() => gs.__resetStateForTests());
    return { session, world, joker: gf.firstOf(session, 'JOKER'), citizens: gf.nonJokers(session) };
}

// 피고 세우고 투표할 사람 전원 같은 표 → 판정 확정
function tribunal(session, defendant, vote) {
    gf.toTribunal(session, defendant);
    for (const uuid of core.getTribunalVoterUuids(session, defendant)) {
        assert.equal(core.submitTribunalVote(uuid, session.id, session.dayIndex, vote).ok, true);
    }
    const anyone = [...session.players.values()].find((p) => p.alive && p.isParticipating !== false).uuid;
    const prepared = core.prepareTribunalVoteResolution(anyone, session.id, session.dayIndex);
    assert.equal(prepared.ok, true, `재판 준비 실패: ${prepared.code}`);
    const committed = core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true, `재판 확정 실패: ${committed.code}`);
    return committed;
}

// 밤 하나 끝내기 (victim 주면 광대가 죽임), 확정 결과
// 이탈 반영이 건 진짜 밤 차례 타이머는 끄고 판 규칙 함수로 바로 판정 (이 파일은 기록만 봄)
function night(session, victim = null) {
    T.stopNightTurnSequence(session.id);
    gf.toNight(session);
    const joker = gf.firstOf(session, 'JOKER');
    if (victim) assert.equal(core.submitNightAction(joker, session.id, victim).ok, true);
    gf.skipAllNight(session);
    const prepared = core.prepareNightResolution(joker, session.id);
    assert.equal(prepared.ok, true, `밤 준비 실패: ${prepared.code}`);
    const committed = core.commitNightResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true, `밤 확정 실패: ${committed.code}`);
    return committed;
}

// 밤마다 광대가 남은 산 시민을 죽여 광대 승으로 판 끝냄
function finishByNightKills(session) {
    for (let i = 0; i < 10 && session.phase !== 'ENDED'; i += 1) {
        const victim = [...session.players.values()].find((p) => p.alive && p.role !== 'JOKER').uuid;
        night(session, victim);
    }
    assert.equal(session.phase, 'ENDED');
}

// 판 끝 전적 저장(진짜 저장소·판 골드)을 시작하고 판 줄이 생길 때까지 기다림
async function persistAndWait(session) {
    T.persistTerminalSession(session, { completed: true });
    await waitFor(async () => (await db.GameResult.count({ where: { id: session.id } })) === 1, '판 기록 줄');
}

// 조건이 맞을 때까지 잠깐씩 다시 봄 (DB 쓰기는 기다리지 않는 길이라), 5초 넘으면 실패
async function waitFor(check, label, timeoutMs = 5_000) {
    const until = Date.now() + timeoutMs;
    for (;;) {
        if (await check()) return;
        if (Date.now() > until) assert.fail(`${label} 기다리다 시간 넘김`);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

const playerRow = (gameId, uuid) => db.GameResultPlayer.findOne({ where: { game_id: gameId, user_id: uuid }, raw: true });
const executionCount = async (uuid) => (await db.UserStats.findOne({ where: { user_id: uuid }, raw: true })).execution_count;
const desertionRows = (uuid, gameId) => db.GameDesertion.count({ where: { user_id: uuid, game_id: gameId } });

// 끊긴 피고: 소켓 끊고 60초 유예를 가짜 시계로 걸어 둠
function disconnectWithClock(world, session, uuid) {
    const clock = gf.fakeClock();
    world.sock(uuid).connected = false;
    T.beginDisconnectGrace(world.io, session, uuid, {
        nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn,
    });
    return clock;
}

test('A04-B-301 7명 판 1일 처형 뒤 판 끝 → game_result_players.death_reason = EXECUTION', async (t) => {
    if (noDb(t)) return;
    const { session, citizens } = await startGame(t, 7, 'r301');
    const a = citizens[0];
    tribunal(session, a, 'GUILTY');
    finishByNightKills(session);
    await persistAndWait(session);
    assert.equal((await playerRow(session.id, a)).death_reason, 'EXECUTION');
});

test('A04-B-302 7명 판 판 끝 → 처형된 A execution_count +1, 다른 6명 그대로', async (t) => {
    if (noDb(t)) return;
    const { session, citizens } = await startGame(t, 7, 'r302');
    const a = citizens[0];
    tribunal(session, a, 'GUILTY');
    finishByNightKills(session);
    await persistAndWait(session);
    for (const uuid of session.players.keys()) {
        assert.equal(await executionCount(uuid), uuid === a ? 1 : 0, `${uuid} 처형 횟수`);
    }
});

test('A04-B-303 6명 판 1일 무죄 피고 → execution_count 그대로', async (t) => {
    if (noDb(t)) return;
    const { session, citizens } = await startGame(t, 6, 'r303');
    const d = citizens[0];
    tribunal(session, d, 'NOT_GUILTY');
    finishByNightKills(session);
    await persistAndWait(session);
    assert.equal(await executionCount(d), 0);
});

test('A04-B-304 8명 판 2일 A·3일 B 처형 → 두 사람 각 +1, death_reason 둘 다 EXECUTION', async (t) => {
    if (noDb(t)) return;
    const { session, citizens } = await startGame(t, 8, 'r304');
    const [a, b] = citizens;
    night(session);
    tribunal(session, a, 'GUILTY');
    night(session);
    tribunal(session, b, 'GUILTY');
    finishByNightKills(session);
    await persistAndWait(session);
    for (const uuid of [a, b]) {
        assert.equal(await executionCount(uuid), 1);
        assert.equal((await playerRow(session.id, uuid)).death_reason, 'EXECUTION');
    }
});

test('A04-B-305 6명 판 재판 중 피고 나감 → death_reason ≠ EXECUTION, execution_count 그대로', async (t) => {
    if (noDb(t)) return;
    const { session, world, citizens } = await startGame(t, 6, 'r305');
    const d = citizens[0];
    gf.toTribunal(session, d);
    assert.equal(T.applyParticipantDeparture(world.io, session, d, { reason: 'PLAYER_LEFT' }).tribunalCancelled, true);
    finishByNightKills(session);
    await persistAndWait(session);
    assert.notEqual((await playerRow(session.id, d)).death_reason, 'EXECUTION');
    assert.equal(await executionCount(d), 0);
});

test('A04-B-306 6명 판 재판 중 산 피고가 나감 → game_desertions 그 사람·그 판 1줄', async (t) => {
    if (noDb(t)) return;
    const { session, world, citizens } = await startGame(t, 6, 'r306');
    const d = citizens[0];
    gf.toTribunal(session, d);
    T.applyParticipantDeparture(world.io, session, d, { reason: 'PLAYER_LEFT' });
    await waitFor(async () => (await desertionRows(d, session.id)) >= 1, '탈주 줄');
    assert.equal(await desertionRows(d, session.id), 1);
});

test('A04-B-307 7명 판 재판 중 끊긴 피고 60초 지남 → game_desertions 1줄, death_reason ≠ EXECUTION', async (t) => {
    if (noDb(t)) return;
    const { session, world, citizens } = await startGame(t, 7, 'r307');
    const d = citizens[0];
    gf.toTribunal(session, d);
    const clock = disconnectWithClock(world, session, d);
    clock.advance(60_000);
    assert.equal(session.phase, 'NIGHT');
    await waitFor(async () => (await desertionRows(d, session.id)) >= 1, '탈주 줄');
    assert.equal(await desertionRows(d, session.id), 1);
    finishByNightKills(session);
    await persistAndWait(session);
    assert.notEqual((await playerRow(session.id, d)).death_reason, 'EXECUTION');
});

test('A04-B-308 5명 판 처형된 A가 나감 → game_desertions 0줄, 판 끝 장부 GAME_REWARD A 1줄', async (t) => {
    if (noDb(t)) return;
    const { session, world, citizens } = await startGame(t, 5, 'r308');
    const a = citizens[0];
    tribunal(session, a, 'GUILTY');
    const left = T.applyParticipantDeparture(world.io, session, a, { reason: 'PLAYER_LEFT' });
    assert.equal(left.ok, true);
    assert.equal(left.wasAlive, false);
    finishByNightKills(session);
    await persistAndWait(session);
    const reference = `game-reward:${session.id}`;
    const ledgerOf = () => db.sequelize.query(
        'SELECT user_id, reason FROM economy_ledger_entries WHERE reference_event_id = :reference AND user_id = :a',
        { replacements: { reference, a }, type: db.Sequelize.QueryTypes.SELECT },
    );
    await waitFor(async () => (await ledgerOf()).length >= 1, 'A 판 골드 장부 줄');
    const rows = await ledgerOf();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, 'GAME_REWARD');
    assert.equal(await desertionRows(a, session.id), 0);
});

test('A04-B-309 6명 판 끊긴 피고가 60초 안에 유죄 → EXECUTION, execution_count +1, 탈주 0줄', async (t) => {
    if (noDb(t)) return;
    const { session, world, citizens } = await startGame(t, 6, 'r309');
    const d = citizens[0];
    gf.toTribunal(session, d);
    const clock = disconnectWithClock(world, session, d);
    clock.advance(30_000);
    for (const uuid of core.getTribunalVoterUuids(session, d)) {
        assert.equal(core.submitTribunalVote(uuid, session.id, session.dayIndex, 'GUILTY').ok, true);
    }
    const prepared = core.prepareTribunalVoteResolution(citizens[1], session.id, session.dayIndex);
    assert.equal(core.commitTribunalVoteResolution(prepared.session, prepared.resolution).ok, true);
    // 끊긴 때부터 60초가 지나도 이미 처형돼 탈락·탈주 없음
    clock.advance(31_000);
    finishByNightKills(session);
    await persistAndWait(session);
    assert.equal((await playerRow(session.id, d)).death_reason, 'EXECUTION');
    assert.equal(await executionCount(d), 1);
    assert.equal(await desertionRows(d, session.id), 0);
});

test('A04-B-310 10명 판 마지막 광대 처형으로 끝 → game_results 1줄, 승자 시민', async (t) => {
    if (noDb(t)) return;
    const { session, joker } = await startGame(t, 10, 'r310');
    assert.deepEqual(tribunal(session, joker, 'GUILTY').terminal, { winner: 'CITIZEN' });
    await persistAndWait(session);
    const rows = await db.GameResult.findAll({ where: { id: session.id }, raw: true });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].winner, 'CITIZEN');
});
