'use strict';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const expandNicknameSnapshot = require('../../db/migrations/0002-expand-nickname-snapshot');
const addRefreshTokenRotation = require('../../db/migrations/0003-add-refresh-token-rotation');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const addVoteParticipations = require('../../db/migrations/0008-add-vote-participations');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
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

const db = require('../../models');
const gameResultRepository = require('../../repositories/gameResult.repositories');
const voteParticipationRepository = require('../../repositories/voteParticipation.repositories');
const gameSessionCore = require('../../game-core/gameSession');
const gameSessionSocket = require('../../socket/gameSession');
const { hashPassword } = require('../../utils/auth/credentials');

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

const makeRoom = (id, uuids, jokerCount = 1) => ({
    id,
    players: new Map(uuids.map((uuid) => [uuid, { uuid, nickname: `n-${uuid.slice(0, 6)}`, isReady: true }])),
    settings: { jokerCount },
});

const createRunningSessionAtDayVote = (uuids, { jokerCount = 1 } = {}) => {
    const room = makeRoom(crypto.randomUUID(), uuids, jokerCount);
    const prepared = gameSessionCore.prepareGameSession(room, { randomFn: () => 0 });
    gameSessionCore.commitGameSession(prepared.session);
    const session = prepared.session;
    for (const uuid of uuids) gameSessionCore.acknowledgeRoleReveal(uuid, session.id);
    for (const uuid of uuids) gameSessionCore.acknowledgeDayVoteReady(uuid, session.id);
    return session;
};

const fakeIo = { sockets: { sockets: new Map() }, to: () => ({ emit: () => {} }) };

const connectSocket = (uuid, id = `sock-${uuid}`) => {
    const socket = {
        id,
        data: { user: { uuid } },
        connected: true,
        rooms: new Set(),
        nsp: fakeIo.sockets,
        emit() {},
        to: () => ({ emit: () => {} }),
    };
    fakeIo.sockets.sockets.set(id, socket);
    return socket;
};

const socketFor = (uuid) => fakeIo.sockets.sockets.get(`sock-${uuid}`);

const registerOnline = (uuids) => {
    fakeIo.sockets.sockets.clear();
    gameSessionSocket.setOnlineUsersRegistry(new Map(uuids.map((uuid) => [uuid, `sock-${uuid}`])));
    for (const uuid of uuids) connectSocket(uuid);
};

const captureAck = () => {
    let response;
    return { callback: (payload) => { response = payload; }, get: () => response };
};

const submitVote = async (session, actor, targetId) => {
    const ack = captureAck();
    await gameSessionSocket.__testables.handleSubmitDayVote(
        fakeIo, socketFor(actor), actor, { gameId: session.id, targetId }, ack.callback,
    );
    return ack.get();
};

const countVoteParticipations = async (gameId) => db.VoteParticipation.count({ where: { game_id: gameId } });

const assertVoteAckOk = (response, message) => {
    assert.deepEqual(Object.keys(response).sort(), ['ok', 'sfxEvent'], message);
    assert.equal(response.ok, true, message);
};

test('AC-01/AC-03: 정상 대상 투표는 성공 ack 전에 vote_participations에 저장되고, 기권은 사건을 만들지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b, c] = [await createLocalUser('vp1a'), await createLocalUser('vp1b'), await createLocalUser('vp1c')];
    const session = createRunningSessionAtDayVote([a, b, c]);
    registerOnline([a, b, c]);

    const voteResponse = await submitVote(session, a, b);
    assertVoteAckOk(voteResponse);
    const abstainResponse = await submitVote(session, c, null);
    assertVoteAckOk(abstainResponse);

    assert.equal(await countVoteParticipations(session.id), 1, '비기권 투표 하나만 사건으로 저장되어야 한다');
    const row = await db.VoteParticipation.findOne({ where: { game_id: session.id, user_id: a }, raw: true });
    assert.ok(row, '투표자 a의 사건이 저장되어야 한다');
    assert.equal(row.day_index, session.dayIndex);
    assert.equal(await db.VoteParticipation.count({ where: { game_id: session.id, user_id: c } }), 0, '기권자 c의 사건은 저장되면 안 된다');
});

test('AC-02: 같은 (game_id, day_index, user_id) 재제출은 한 번만 반영된다(응답 유실 후 재시도와 동일한 모양)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b] = [await createLocalUser('vp2a'), await createLocalUser('vp2b')];
    const session = createRunningSessionAtDayVote([a, b], { jokerCount: 0 });
    registerOnline([a, b]);

    const first = await submitVote(session, a, b);
    assertVoteAckOk(first);
    const retry = await submitVote(session, a, b);
    assertVoteAckOk(retry);
    assert.equal(retry.sfxEvent.eventId, first.sfxEvent.eventId);

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

test('AC-03: 3인 전원 동점 재투표(2라운드 전원 기권)에서도 day_index당 사건 수는 라운드 1에서 확정된 그대로다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b, c] = [await createLocalUser('vp3a'), await createLocalUser('vp3b'), await createLocalUser('vp3c')];
    const session = createRunningSessionAtDayVote([a, b, c]);
    registerOnline([a, b, c]);
    const dayIndexBefore = session.dayIndex;

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

    for (const uuid of [a, b, c]) {
        const response = await submitVote(session, uuid, null);
        assertVoteAckOk(response);
    }

    assert.equal(await countVoteParticipations(session.id), 3, '재투표(같은 day_index)는 이미 기록된 사건 수를 넘지 않는다');
});

test('AC-03/A-01: 최초 라운드에서 기권한 참가자가 재투표에서 비기권으로 돌아서도 새 사건이 생기지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b, c] = [await createLocalUser('vp3ra'), await createLocalUser('vp3rb'), await createLocalUser('vp3rc')];
    const session = createRunningSessionAtDayVote([a, b, c]);
    registerOnline([a, b, c]);

    await submitVote(session, a, b);
    const bAbstainResponse = await submitVote(session, b, null);
    assertVoteAckOk(bAbstainResponse);
    await submitVote(session, c, a);
    assert.equal(await countVoteParticipations(session.id), 2, '기권한 b를 제외한 a·c의 사건만 저장되어야 한다');

    const prepared = gameSessionCore.prepareDayVoteResolution(a, session.id, session.dayIndex);
    assert.equal(prepared.ok, true);
    assert.equal(prepared.resolution.outcome, 'REVOTE');
    const committed = gameSessionCore.commitDayVoteResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true);

    const bRevoteResponse = await submitVote(session, b, c);
    assertVoteAckOk(bRevoteResponse, '재투표 제출 자체는 ack가 성공해야 한다');
    assert.equal(bRevoteResponse.sfxEvent.round, 2);
    await submitVote(session, a, c);

    assert.equal(await countVoteParticipations(session.id), 2, '재투표의 비기권 제출은 새 사건을 만들지 않는다');
    assert.equal(
        await db.VoteParticipation.count({ where: { game_id: session.id, user_id: b } }),
        0,
        '최초 라운드에 기권한 b는 재투표에서 비기권으로 돌아서도 사건이 생기면 안 된다',
    );
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

test('재접속: 같은 계정이 새 소켓으로 재제출해도 집계 키는 uuid 기준이라 사건이 늘지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const [a, b] = [await createLocalUser('vp4a'), await createLocalUser('vp4b')];
    const session = createRunningSessionAtDayVote([a, b], { jokerCount: 0 });
    registerOnline([a, b]);

    await submitVote(session, a, b);

    fakeIo.sockets.sockets.delete(`sock-${a}`);
    gameSessionSocket.setOnlineUsersRegistry(new Map([[a, `sock-${a}-reconnected`], [b, `sock-${b}`]]));
    const reconnected = connectSocket(a, `sock-${a}-reconnected`);
    const ack = captureAck();
    await gameSessionSocket.__testables.handleSubmitDayVote(
        fakeIo, reconnected, a, { gameId: session.id, targetId: b }, ack.callback,
    );
    assertVoteAckOk(ack.get());

    assert.equal(await countVoteParticipations(session.id), 1, '연결이 바뀌어도 같은 계정의 같은 날 사건은 하나여야 한다');
});

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
    assertVoteAckOk(retried, '저장이 복구되면 같은 요청의 재시도는 거절되지 않고 성공해야 한다');
    assert.equal(await countVoteParticipations(session.id), 1, '재시도 성공 후에도 사건은 하나여야 한다');
});

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

test('AC-04/A-05: 사건이 하나도 없는 계정은 0을 돌려받는다(과거 무기록을 임의로 만들지 않는다)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const userWithNoEvents = await createLocalUser('vp8none');
    assert.equal(await voteParticipationRepository.countEligibleDayVoteParticipations(userWithNoEvents), 0);
});

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

test('AC-01: vote_participations 마이그레이션은 재실행해도 안전하고(0008), (game_id, day_index, user_id) 유일 제약을 실제 DB가 강제한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

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
