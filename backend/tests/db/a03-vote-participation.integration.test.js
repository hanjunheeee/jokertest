'use strict';

// 낮 투표 참여 기록(vote_participations) DB 시험 — 진짜 낮 표를 서버 손잡이로 내고 시험 DB에 남은 줄을 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A03-낮투표.md A03-B-291~300, 돌리기: AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a03-vote-participation.integration.test.js
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 모델이 읽는 주소를 시험 DB로 (값 없으면 닿지 않는 곳 → 아래에서 건너뜀), 꼭 models·gameFixtures require보다 먼저
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
// 모델을 먼저 불러 시험 DB에 묶어 둠 (gameFixtures가 주소를 막힌 곳으로 바꿔도 이미 묶인 연결은 그대로)
const db = require('../../models');
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');

const T = gs.__testables;
const { core } = gf;
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
    await db.sequelize.close();
});

// 시험마다 새 사람 (참여 기록 user_id가 users.uuid를 가리켜서 진짜 계정이 있어야 함)
async function createUser(label) {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: 'not-a-real-hash',
        nickname: `${label}${uuid.slice(0, 6)}`,
        email: `${label}-${uuid}@example.test`,
    });
    return uuid;
}

const aliveUuids = (s) => [...s.players.values()].filter((p) => p.alive).map((p) => p.uuid);

// 판 하나 차리기: 진짜 계정 n명, 광대 1·나머지 시민 고정, 첫 낮까지 (판 id도 uuid 모양 — DB 칸이 UUID)
async function setupGame(t, n) {
    gf.resetCore();
    const uuids = [];
    for (let i = 0; i < n; i += 1) uuids.push(await createUser('a3v'));
    const gameId = crypto.randomUUID();
    const room = {
        id: `a03db-${gameId.slice(0, 8)}`,
        players: new Map(uuids.map((uuid, i) => [uuid, { uuid, nickname: `닉${i}`, isReady: true }])),
        settings: {
            maxPlayers: 10, jokerCount: 1, roleCompositionMode: 'custom',
            roleCounts: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0 },
        },
    };
    const candidate = gf.T.buildSessionCandidate(room, { randomFn: () => 0, gameIdFn: () => gameId });
    assert.equal(candidate.ok, true, `판 후보 실패: ${candidate.reason}`);
    core.commitGameSession(candidate.session);
    const session = candidate.session;
    gf.toDay(session);
    // 참여 기록은 진짜 저장소로, 업적 평가만 끔 (이 시험 대상이 아니고 뒤에 DB를 더 읽음)
    T.__setRecordVoteParticipationForTests(null);
    T.__setEvaluateAchievementsForTests(async () => {});
    t.after(() => {
        T.stopDayPhaseTimer(session.id);
        T.stopTribunalTimer(session.id);
        T.stopNightTurnSequence(session.id);
        T.__setRecordVoteParticipationForTests(null);
        T.__setEvaluateAchievementsForTests(null);
        gf.resetCore();
    });
    return session;
}

// 소켓·가짜 시계 붙이고 낮 타이머 시작 → 토론 30초 흘려 투표 단계로
function openVote(session) {
    const world = gf.socketWorld(gs, session);
    const clock = gf.fakeClock();
    T.startDayPhaseTimer(world.io, session, {
        nowFn: clock.nowFn, setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn,
        discussionDurationMs: 30_000, voteDurationMs: 30_000,
    });
    clock.advance(30_000);
    return { world, clock };
}

// 화면이 보내는 것처럼 낮 표 하나 (target null = 기권)
const vote = (world, session, uuid, targetId) => gf.call(
    T.handleSubmitDayVote, world.io, world.sock(uuid), uuid, { gameId: session.id, targetId },
);

// 이 판의 참여 기록 줄 (겉으로 보이는 결과 = DB 줄)
const rowsOf = (gameId) => db.VoteParticipation.findAll({
    where: { game_id: gameId }, raw: true, order: [['day_index', 'ASC']],
});

// 판정 길 거쳐 날 넘기기 (메모리 판만): 남은 산 사람 기권 → 판정 → 밤 → 광대가 victim 죽이거나(null 안 죽임) → 다음 날 낮
function passDayAndNight(session, victim) {
    for (const uuid of aliveUuids(session)) {
        if (!session.dayVotes.has(uuid)) assert.equal(core.submitDayVote(uuid, session.id, null).ok, true);
    }
    const prepared = core.prepareDayVoteResolution(aliveUuids(session)[0], session.id, session.dayIndex);
    assert.equal(prepared.ok, true, `판정 준비 실패: ${prepared.code}`);
    assert.equal(core.commitDayVoteResolution(prepared.session, prepared.resolution).ok, true);
    const joker = gf.firstOf(session, 'JOKER');
    const { committed } = gf.resolveNightDirect(session, { [joker]: victim });
    assert.equal(committed?.ok, true, '밤 판정 실패');
}

test('A03-B-291 ① 6명 판 1일 X 찍음 → 참여 기록 (판, 1일, 그 사람) 한 줄', async (t) => {
    if (noDb(t)) return;
    const s = await setupGame(t, 6);
    const { world } = openVote(s);
    const [X, A] = aliveUuids(s);
    assert.equal((await vote(world, s, A, X)).ok, true);
    const rows = await rowsOf(s.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].game_id, s.id);
    assert.equal(rows[0].day_index, 1);
    assert.equal(rows[0].user_id, A);
});

test('A03-B-292 ② 기권 → 줄 없음', async (t) => {
    if (noDb(t)) return;
    const s = await setupGame(t, 6);
    const { world } = openVote(s);
    const [A] = aliveUuids(s);
    assert.equal((await vote(world, s, A, null)).ok, true);
    assert.equal((await rowsOf(s.id)).length, 0);
});

test('A03-B-293 ③ 같은 날 세 번 바꿈 → 한 줄', async (t) => {
    if (noDb(t)) return;
    const s = await setupGame(t, 6);
    const { world } = openVote(s);
    const [X, Y, Z, A] = aliveUuids(s);
    for (const target of [X, Y, Z]) assert.equal((await vote(world, s, A, target)).ok, true);
    const rows = await rowsOf(s.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, A);
});

test('A03-B-294 ④ 2일 표 → 2일 줄 따로', async (t) => {
    if (noDb(t)) return;
    const s = await setupGame(t, 6);
    const first = openVote(s);
    const [X, A] = aliveUuids(s);
    assert.equal((await vote(first.world, s, A, X)).ok, true);
    // 1일 판정·밤은 메모리 판에서 바로 넘김 (밤 차례 타이머 안 씀), 2일 낮 타이머 새로
    T.stopDayPhaseTimer(s.id);
    passDayAndNight(s, null);
    assert.equal(s.dayIndex, 2);
    const second = openVote(s);
    assert.equal((await vote(second.world, s, A, X)).ok, true);
    const rows = await rowsOf(s.id);
    assert.deepEqual(rows.map((r) => [r.day_index, r.user_id]), [[1, A], [2, A]]);
});

test('A03-B-295 ⑤ DB 끊김 → 답 VOTE_PERSIST_FAILED, 표는 남아 판정에 셈', async (t) => {
    if (noDb(t)) return;
    const s = await setupGame(t, 6);
    const { world, clock } = openVote(s);
    const [X, A, B, C, D, E] = aliveUuids(s);
    // B·C → X, E → D, D·X 기권 (A 빼고 다 냄)
    assert.equal((await vote(world, s, B, X)).ok, true);
    assert.equal((await vote(world, s, C, X)).ok, true);
    assert.equal((await vote(world, s, E, D)).ok, true);
    assert.equal((await vote(world, s, D, null)).ok, true);
    assert.equal((await vote(world, s, X, null)).ok, true);
    // 마지막 A의 X 표 저장 때 DB 연결이 끊긴 것처럼 실패시킴
    T.__setRecordVoteParticipationForTests(async () => {
        throw new db.Sequelize.ConnectionRefusedError(new Error('connect ECONNREFUSED'));
    });
    const reply = await vote(world, s, A, X);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'VOTE_PERSIST_FAILED');
    // A 표가 세지면 X 3 > 기권 2 → 재판 X (안 세지면 X 2 < 기권 3 → 밤)
    clock.advance(5_000);
    const [resolved] = world.received(B, 'day_vote_resolved');
    assert.ok(resolved, '판정 알림이 안 옴');
    assert.equal(resolved.payload.outcome, 'TRIBUNAL');
    assert.equal(resolved.payload.tribunalTargetUuid, X);
});

test('A03-B-296 ⑥ 같은 순간 같은 표 두 번 → 한 줄', async (t) => {
    if (noDb(t)) return;
    const s = await setupGame(t, 6);
    const { world } = openVote(s);
    const [X, A] = aliveUuids(s);
    await Promise.all([vote(world, s, A, X), vote(world, s, A, X)]);
    const rows = await rowsOf(s.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, A);
});

test('A03-B-297 ⑦ 7명 판 6명 진짜 표 → 6줄', async (t) => {
    if (noDb(t)) return;
    const s = await setupGame(t, 7);
    const { world } = openVote(s);
    const [X, ...rest] = aliveUuids(s);
    for (const uuid of rest) assert.equal((await vote(world, s, uuid, X)).ok, true);
    assert.equal((await vote(world, s, X, null)).ok, true);
    const rows = await rowsOf(s.id);
    assert.equal(rows.length, 6);
    assert.deepEqual(rows.map((r) => r.user_id).sort(), [...rest].sort());
});

test('A03-B-298 ⑧ 기권 → X로 바꿈 → 한 줄', async (t) => {
    if (noDb(t)) return;
    const s = await setupGame(t, 6);
    const { world } = openVote(s);
    const [X, A] = aliveUuids(s);
    assert.equal((await vote(world, s, A, null)).ok, true);
    assert.equal((await vote(world, s, A, X)).ok, true);
    const rows = await rowsOf(s.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, A);
});

test('A03-B-299 ⑨ 마감에 기권으로 채운 사람 → 줄 없음', async (t) => {
    if (noDb(t)) return;
    const s = await setupGame(t, 6);
    const { world, clock } = openVote(s);
    const [X, A] = aliveUuids(s);
    assert.equal((await vote(world, s, A, X)).ok, true);
    // 투표 30초 마감 → 안 낸 5명은 기권으로 채워 판정
    clock.advance(30_000);
    await gf.flush();
    assert.equal(world.received(A, 'day_vote_resolved').length, 1);
    const rows = await rowsOf(s.id);
    assert.deepEqual(rows.map((r) => r.user_id), [A]);
});

test('A03-B-300 ⑩ 거절된 죽은 사람 표 → 줄 없음', async (t) => {
    if (noDb(t)) return;
    const s = await setupGame(t, 6);
    // 첫 밤에 광대가 시민 하나 죽임 → 2일 낮
    const dead = gf.nonJokers(s).at(-1);
    gf.toVote(s);
    passDayAndNight(s, dead);
    assert.equal(s.players.get(dead).alive, false);
    const { world } = openVote(s);
    const [X] = aliveUuids(s);
    const reply = await vote(world, s, dead, X);
    assert.equal(reply.ok, false);
    const rows = await db.VoteParticipation.findAll({ where: { user_id: dead }, raw: true });
    assert.equal(rows.length, 0);
});
