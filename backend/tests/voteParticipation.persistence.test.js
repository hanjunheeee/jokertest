'use strict';

// F-11 투표 참여 영속 집계 — 실제 격리 MySQL DB에서 AC-01~AC-05를 검증한다.
//
// roleStatistics.mysql.test.js/f01~f09 DB 통합 시험과 같은 원칙(F01_TEST_DATABASE_URL 전용
// 격리 MySQL, backend/tests/helpers/isolatedTestDb.js의 관리 목록·대상 DB 확인)을 따른다.
// F01_TEST_DATABASE_URL이 없으면 각 테스트는 실패로 표시하지 않고 명시적으로 skip하며
// "미검증"임을 로그에 남긴다 — 격리 DB를 구할 수 없다고 통과를 꾸미지 않는다.

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../db/migrationRunner');
const baseline = require('../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../db/migrations/0005-add-social-auth');
const addEconomy = require('../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../db/migrations/0007-add-economy-purchase-requests');
const addVoteParticipations = require('../db/migrations/0008-add-vote-participations');
const { buildManagedSchema, resetManagedSchema } = require('./helpers/isolatedTestDb');

const { MIGRATIONS } = require('../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests,
    addVoteParticipations, migrationRunner,
});

let sequelize;
let connectionError = null;

test.before(async () => {
    if (!TEST_DB_URL) return;
    sequelize = new Sequelize(TEST_DB_URL, { logging: false });
    try {
        await sequelize.authenticate();
    } catch (error) {
        connectionError = error;
    }
});

test.after(async () => {
    if (sequelize) await sequelize.close();
});

const unavailable = (t) => {
    if (!TEST_DB_URL) {
        t.skip('F01_TEST_DATABASE_URL이 설정되지 않았습니다 — 실제 MySQL 격리 DB 없이는 AC를 검증할 수 없습니다 (미검증).');
        return true;
    }
    if (connectionError) throw connectionError;
    return false;
};

const resetSchema = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
};

// require 캐시 싱글턴이라, 파일 맨 위에서 맞춰둔 process.env.DATABASE_URL로 처음
// require되는 이 시점에 격리 DB에 연결된다(roleStatistics.mysql.test.js와 같은 이유).
const db = require('../models');
const gameResultRepository = require('../repositories/gameResult.repositories');
const voteParticipationRepository = require('../repositories/voteParticipation.repositories');
const gameSessionCore = require('../game-core/gameSession');
const gameSessionSocket = require('../socket/gameSession');
const { hashPassword } = require('../utils/hash');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const setUp = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    gameSessionCore.__resetStateForTests();
    gameSessionSocket.__resetStateForTests();
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, 8 - label.length)}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await hashPassword('correct-horse-battery-1'),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    return uuid;
};

// ── game-core로 실제 DAY_VOTE 상태까지 진행시킨 세션을 조립한다 ─────────────────

const makeRoom = (id, uuids, jokerCount = 1) => ({
    id,
    players: new Map(uuids.map((uuid) => [uuid, { uuid, nickname: `n-${uuid.slice(0, 6)}`, isReady: true }])),
    settings: { jokerCount },
});

/** N인 세션을 커밋하고 전원 ROLE_REVEAL 확인 + DAY_VOTE 준비를 마쳐 투표 제출 가능 상태로 만든다. */
const createRunningSessionAtDayVote = (uuids, { jokerCount = 1 } = {}) => {
    const room = makeRoom(crypto.randomUUID(), uuids, jokerCount);
    const prepared = gameSessionCore.prepareGameSession(room, { randomFn: () => 0 });
    gameSessionCore.commitGameSession(prepared.session);
    const session = prepared.session;
    for (const uuid of uuids) gameSessionCore.acknowledgeRoleReveal(uuid, session.id);
    for (const uuid of uuids) gameSessionCore.acknowledgeDayVoteReady(uuid, session.id);
    return session;
};

const fakeIo = { to: () => ({ emit: () => {} }) };
const createFakeSocket = (uuid) => ({ id: `sock-${uuid}`, data: {} });

const registerOnline = (uuids) => {
    gameSessionSocket.setOnlineUsersRegistry(new Map(uuids.map((uuid) => [uuid, `sock-${uuid}`])));
};

const captureAck = () => {
    let response;
    return { callback: (payload) => { response = payload; }, get: () => response };
};

const submitVote = async (session, actor, targetId) => {
    const ack = captureAck();
    await gameSessionSocket.__testables.handleSubmitDayVote(
        fakeIo, createFakeSocket(actor), actor, { gameId: session.id, targetId }, ack.callback,
    );
    return ack.get();
};

const countVoteParticipations = async (gameId) => db.VoteParticipation.count({ where: { game_id: gameId } });

// ── AC-01/AC-03: 실제 소켓 경로 — 정상 투표는 저장되고, 기권은 저장되지 않는다 ─────

test('AC-01/AC-03: 정상 대상 투표는 성공 ack 전에 vote_participations에 저장되고, 기권은 사건을 만들지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b, c] = [await createLocalUser('vp1a'), await createLocalUser('vp1b'), await createLocalUser('vp1c')];
    const session = createRunningSessionAtDayVote([a, b, c]);
    registerOnline([a, b, c]);

    const voteResponse = await submitVote(session, a, b);
    assert.deepEqual(voteResponse, { ok: true });
    const abstainResponse = await submitVote(session, c, null);
    assert.deepEqual(abstainResponse, { ok: true });

    assert.equal(await countVoteParticipations(session.id), 1, '비기권 투표 하나만 사건으로 저장되어야 한다');
    const row = await db.VoteParticipation.findOne({ where: { game_id: session.id, user_id: a }, raw: true });
    assert.ok(row, '투표자 a의 사건이 저장되어야 한다');
    assert.equal(row.day_index, session.dayIndex);
    assert.equal(await db.VoteParticipation.count({ where: { game_id: session.id, user_id: c } }), 0, '기권자 c의 사건은 저장되면 안 된다');
});

// ── AC-02: 같은 요청의 중복 제출·네트워크 재시도는 한 번만 반영된다 ────────────────

test('AC-02: 같은 (game_id, day_index, user_id) 재제출은 한 번만 반영된다(응답 유실 후 재시도와 동일한 모양)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b] = [await createLocalUser('vp2a'), await createLocalUser('vp2b')];
    const session = createRunningSessionAtDayVote([a, b], { jokerCount: 0 });
    registerOnline([a, b]);

    const first = await submitVote(session, a, b);
    assert.deepEqual(first, { ok: true });
    // 클라이언트가 첫 ack를 못 받았다고 믿고 똑같은 요청을 재시도하는 상황을 흉내낸다.
    const retry = await submitVote(session, a, b);
    assert.deepEqual(retry, { ok: true });

    assert.equal(await countVoteParticipations(session.id), 1, '재시도는 새 사건을 만들면 안 된다');
});

test('AC-02: 실제 DB 경합(동시 요청)에서도 같은 집계 키는 정확히 한 번만 저장된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userId = await createLocalUser('vp2race');
    const gameId = crypto.randomUUID();
    const params = { gameId, dayIndex: 1, userId };

    const [r1, r2] = await Promise.all([
        voteParticipationRepository.recordValidDayVoteParticipation(params),
        voteParticipationRepository.recordValidDayVoteParticipation(params),
    ]);
    const recordedCount = [r1, r2].filter((r) => r.recorded).length;
    assert.equal(recordedCount, 1, '동시 요청 중 정확히 하나만 실제로 기록되어야 한다(나머지는 recorded:false)');
    assert.equal(await db.VoteParticipation.count({ where: { game_id: gameId } }), 1);
});

// ── AC-03: 재투표는 같은 day_index에 귀속되어 새 사건을 만들지 않는다 ─────────────

test('AC-03: 3인 전원 동점 재투표(2라운드 전원 기권)에서도 day_index당 사건 수는 라운드 1에서 확정된 그대로다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b, c] = [await createLocalUser('vp3a'), await createLocalUser('vp3b'), await createLocalUser('vp3c')];
    const session = createRunningSessionAtDayVote([a, b, c]);
    registerOnline([a, b, c]);
    const dayIndexBefore = session.dayIndex;

    // 순환 동점: a→b, b→c, c→a. 셋 다 비기권이므로 라운드 1에서 3건이 저장된다.
    await submitVote(session, a, b);
    await submitVote(session, b, c);
    await submitVote(session, c, a);
    assert.equal(await countVoteParticipations(session.id), 3);

    const prepared = gameSessionCore.prepareDayVoteResolution(a, session.id, session.dayIndex);
    assert.equal(prepared.ok, true);
    const committed = gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true);
    assert.equal(session.phase, 'DAY', 'REVOTE는 phase를 DAY에 남긴다');
    assert.equal(session.dayIndex, dayIndexBefore, '재투표는 day_index를 바꾸지 않는다');

    // 3인 세션의 순환 동점은 라운드 2에서 생존자 전원이 후보에서 제외되므로 전원 기권만 가능하다
    // (backend/game-core/__tests__/gameSession.dayVote.test.js의 기존 계약과 동일).
    for (const uuid of [a, b, c]) {
        const response = await submitVote(session, uuid, null);
        assert.deepEqual(response, { ok: true });
    }

    // 라운드 2는 전원 기권이므로 새 사건이 생기지 않는다 — 총 사건 수는 라운드 1의 3건 그대로다.
    assert.equal(await countVoteParticipations(session.id), 3, '재투표(같은 day_index)는 이미 기록된 사건 수를 넘지 않는다');
});

test('AC-03: TRIBUNAL 전이는 그 낮의 비기권 사건 수를 바꾸지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b, c] = [await createLocalUser('vp3ta'), await createLocalUser('vp3tb'), await createLocalUser('vp3tc')];
    const session = createRunningSessionAtDayVote([a, b, c]);
    registerOnline([a, b, c]);

    await submitVote(session, a, c);
    await submitVote(session, b, c);
    await submitVote(session, c, null);
    assert.equal(await countVoteParticipations(session.id), 2, '기권자를 제외한 두 건만 저장되어야 한다');

    const prepared = gameSessionCore.prepareDayVoteResolution(a, session.id, session.dayIndex);
    const committed = gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true);
    assert.equal(session.phase, 'TRIBUNAL');

    assert.equal(await countVoteParticipations(session.id), 2, 'TRIBUNAL 전이 자체는 낮 투표 사건을 새로 만들거나 지우지 않는다');
});

// ── 재접속: 영속 계정 ID(uuid) 기준이므로 소켓이 바뀌어도 같은 계정은 같은 사건으로 묶인다 ──

test('재접속: 같은 계정이 새 소켓으로 재제출해도 집계 키는 uuid 기준이라 사건이 늘지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b] = [await createLocalUser('vp4a'), await createLocalUser('vp4b')];
    const session = createRunningSessionAtDayVote([a, b], { jokerCount: 0 });
    registerOnline([a, b]);

    await submitVote(session, a, b);

    // 재접속을 흉내낸다 — 같은 uuid가 새 소켓 id로 등록되고, 그 새 연결로 같은 대상에 재제출한다.
    gameSessionSocket.setOnlineUsersRegistry(new Map([[a, `sock-${a}-reconnected`], [b, `sock-${b}`]]));
    const ack = captureAck();
    await gameSessionSocket.__testables.handleSubmitDayVote(
        fakeIo, { id: `sock-${a}-reconnected`, data: {} }, a, { gameId: session.id, targetId: b }, ack.callback,
    );
    assert.deepEqual(ack.get(), { ok: true });

    assert.equal(await countVoteParticipations(session.id), 1, '연결이 바뀌어도 같은 계정의 같은 날 사건은 하나여야 한다');
});

// ── A-03: 저장 실패는 재시도 가능한 실패로 전달되고, 메모리 투표는 재시도를 막지 않는다 ──

test('저장 실패는 VOTE_PERSIST_FAILED로 ack되고, 메모리 투표는 남아 있어 재시도가 거절되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b] = [await createLocalUser('vp5a'), await createLocalUser('vp5b')];
    const session = createRunningSessionAtDayVote([a, b], { jokerCount: 0 });
    registerOnline([a, b]);

    const original = db.VoteParticipation.findOrCreate;
    db.VoteParticipation.findOrCreate = () => Promise.reject(new Error('시뮬레이션된 저장 실패'));
    t.after(() => { db.VoteParticipation.findOrCreate = original; });

    const failed = await submitVote(session, a, b);
    assert.deepEqual(failed, { ok: false, code: 'VOTE_PERSIST_FAILED', message: '투표 저장에 실패했습니다. 다시 시도해 주세요.' });
    assert.equal(session.dayVotes.get(a), b, '저장 실패 후에도 메모리 투표는 그대로 남아야 한다');
    assert.equal(await countVoteParticipations(session.id), 0);

    db.VoteParticipation.findOrCreate = original;
    const retried = await submitVote(session, a, b);
    assert.deepEqual(retried, { ok: true }, '저장이 복구되면 같은 요청의 재시도는 거절되지 않고 성공해야 한다');
    assert.equal(await countVoteParticipations(session.id), 1, '재시도 성공 후에도 사건은 하나여야 한다');
});

// ── AC-03/A-04: 중단된 경기·개발 경기는 업적 집계(F-12 연결점)에서 제외된다 ─────────

test('AC-03/A-04: 중단된 경기에 속한 사건은 countEligibleDayVoteParticipations에서 제외된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b] = [await createLocalUser('vp6a'), await createLocalUser('vp6b')];
    const session = createRunningSessionAtDayVote([a, b], { jokerCount: 0 });
    registerOnline([a, b]);
    await submitVote(session, a, b);

    const result = await gameResultRepository.persistGameResult(session, { completed: false, disconnectedUuid: b });
    assert.equal(result.persisted, true);

    assert.equal(await voteParticipationRepository.countEligibleDayVoteParticipations(a), 0, '중단 경기의 사건은 업적 집계에서 제외되어야 한다');
});

test('A-04: 개발 경기에 속한 사건은 countEligibleDayVoteParticipations에서 제외된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b] = [await createLocalUser('vp7a'), await createLocalUser('vp7b')];
    const session = createRunningSessionAtDayVote([a, b], { jokerCount: 0 });
    registerOnline([a, b]);
    await submitVote(session, a, b);

    session.winResult = { winner: 'CITIZEN' };
    session.endedAt = Date.now();
    session.gameSource = 'development';
    const result = await gameResultRepository.persistGameResult(session, { completed: true });
    assert.equal(result.persisted, true);

    assert.equal(await voteParticipationRepository.countEligibleDayVoteParticipations(a), 0, '개발 경기의 사건은 업적 집계에서 제외되어야 한다');
});

// ── AC-04/A-05: 과거 무기록은 0으로 간주되고 임의로 생성되지 않는다 ───────────────

test('AC-04/A-05: 사건이 하나도 없는 계정은 0을 돌려받는다(과거 무기록을 임의로 만들지 않는다)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userWithNoEvents = await createLocalUser('vp8none');
    assert.equal(await voteParticipationRepository.countEligibleDayVoteParticipations(userWithNoEvents), 0);
});

// ── AC-05: F-12가 소비할 조회 연결점 — 정상 확정된 운영 경기의 사건은 정확히 집계된다 ──

test('AC-05: 정상 확정된 운영 경기의 비기권 투표는 F-12 조회 연결점(countEligibleDayVoteParticipations)에서 정확히 집계된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b, c] = [await createLocalUser('vp9a'), await createLocalUser('vp9b'), await createLocalUser('vp9c')];
    const session = createRunningSessionAtDayVote([a, b, c]);
    registerOnline([a, b, c]);
    await submitVote(session, a, b);
    await submitVote(session, c, null);

    session.winResult = { winner: 'CITIZEN' };
    session.endedAt = Date.now();
    session.gameSource = 'production';
    const result = await gameResultRepository.persistGameResult(session, { completed: true });
    assert.equal(result.persisted, true);

    assert.equal(await voteParticipationRepository.countEligibleDayVoteParticipations(a), 1);
    assert.equal(await voteParticipationRepository.countEligibleDayVoteParticipations(c), 0, '기권자는 애초에 사건이 없다');
});

// ── AC-01: 스키마 자체 — 재실행 안전한 마이그레이션과 유일 제약 ────────────────────

test('AC-01: vote_participations 마이그레이션은 재실행해도 안전하고(0008), (game_id, day_index, user_id) 유일 제약을 실제 DB가 강제한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    // 이미 적용된 마이그레이션을 다시 적용해도 스킵되고 에러가 없어야 한다(재실행 안전성).
    const again = await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    assert.deepEqual(again.applied, []);

    const userId = await createLocalUser('vp10');
    const gameId = crypto.randomUUID();
    await db.VoteParticipation.create({ game_id: gameId, day_index: 1, user_id: userId, accepted_at: new Date() });

    await assert.rejects(
        () => db.VoteParticipation.create({ game_id: gameId, day_index: 1, user_id: userId, accepted_at: new Date() }),
        (error) => error instanceof db.Sequelize.UniqueConstraintError,
        '같은 (game_id, day_index, user_id)의 두 번째 INSERT는 실제 DB 유일 제약으로 거부되어야 한다',
    );
});
