'use strict';

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const addVoteParticipations = require('../../db/migrations/0008-add-vote-participations');
const addAchievementGrants = require('../../db/migrations/0009-add-achievement-grants');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests,
    addVoteParticipations, addAchievementGrants, migrationRunner,
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

const db = require('../../models');
const gameResultRepository = require('../../repositories/game/result');
const gameSessionCore = require('../../game-core/gameSession');
const gameSessionSocketLayer = require('../../socket/gameSession');
const achievementService = require('../../services/achievement');
const kickReceiptStore = require('../../socket/kickReceiptStore');
const { hashPassword } = require('../../utils/auth/credentials');

const { handleKickGamePlayer, handleLeaveGameSession, __getTerminalPersistRunsForTests } =
    gameSessionSocketLayer.__testables;

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const setUp = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    gameSessionCore.__resetStateForTests();
    gameSessionSocketLayer.__resetStateForTests();
    gameSessionSocketLayer.setOnlineUsersRegistry(new Proxy(new Map(), {
        get(target, prop, receiver) {
            if (prop === 'get') return (uuid) => `sock-${uuid}`;
            return Reflect.get(target, prop, receiver);
        },
    }));
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, Math.max(1, 8 - label.length))}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await hashPassword('correct-horse-battery-1'),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    await db.UserStats.create({ user_id: uuid });
    return uuid;
};

function connectSocket(io, uuid) {
    const rooms = new Set();
    const socket = {
        id: `sock-${uuid}`,
        data: { user: { uuid } },
        connected: true,
        rooms,
        nsp: io.sockets,
        emitted: [],
        async join(roomId) { rooms.add(roomId); },
        async leave(roomId) { rooms.delete(roomId); },
        emit(event, payload) { this.emitted.push({ event, payload }); },
        to() { return { emit: () => {} }; },
    };
    io.sockets.sockets.set(socket.id, socket);
    return socket;
}

function createFakeIo() {
    const broadcasts = [];
    return {
        sockets: { sockets: new Map() },
        broadcasts,
        emit(event, payload) { broadcasts.push({ roomId: null, event, payload }); },
        to(roomId) {
            return { emit: (event, payload) => { broadcasts.push({ roomId, event, payload }); } };
        },
        in() { return { socketsLeave: () => {} }; },
    };
}

function commitTerminalReadySession({ roomId, gameId, hostUuid, uuids }) {
    const players = new Map(uuids.map((uuid) => [uuid, {
        uuid, nickname: `n-${uuid.slice(0, 6)}`, isReady: true, membershipId: `mem-${uuid}`,
    }]));
    const prepared = gameSessionCore.prepareGameSession(
        { id: roomId, instanceId: `inst-${roomId}`, hostUuid, players, settings: { jokerCount: 1 } },
        { randomFn: () => 0, gameIdFn: () => gameId },
    );
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    gameSessionCore.commitGameSession(prepared.session);
    gameSessionCore.__testables.enterDayPhase(prepared.session);
    return prepared.session;
}

function withClockOnSecondBoundary(fn) {
    const originalNow = Date.now;
    const fixed = Math.floor(originalNow() / 1_000) * 1_000;
    Date.now = () => fixed;
    try {
        return fn();
    } finally {
        Date.now = originalNow;
    }
}

async function waitForPersistSettled({ timeoutMs = 15_000, stepMs = 10 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (__getTerminalPersistRunsForTests().length === 0) {
            await new Promise((resolve) => setImmediate(resolve));
            return true;
        }
        if (Date.now() >= deadline) return false;
        await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
}

const TEARDOWN_DRAIN_TIMEOUT_MS = 5_000;
const TEARDOWN_DRAIN_ROUNDS = 3;

function captureAchievementEvaluations(t) {
    const pending = [];
    const restores = [];
    const drains = [];
    const originalEvaluate = achievementService.evaluateAndGrantForUser;
    gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests((userId) => {
        const promise = Promise.resolve(originalEvaluate(userId));
        pending.push(promise.catch(() => {}));
        return promise;
    });
    restores.push(() => gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests());

    const settled = async () => {
        for (let guard = 0; guard < 50; guard += 1) {
            const before = pending.length;
            await Promise.all(pending);
            await new Promise((resolve) => setImmediate(resolve));
            if (pending.length === before) return true;
        }
        return false;
    };

    t.after(async () => {
        let drained = false;
        for (let round = 0; round < TEARDOWN_DRAIN_ROUNDS && !drained; round += 1) {
            for (const drain of drains) {
                try { drain(); } catch (error) { console.error('[F-21 시험 정리] 대기 해제 실패', error); }
            }
            drained = await waitForPersistSettled({ timeoutMs: TEARDOWN_DRAIN_TIMEOUT_MS });
        }
        const evaluated = await settled();
        if (!drained || !evaluated) {
            console.error('[F-21 시험 정리] 비동기 작업이 기한 안에 끝나지 않았다', { drained, evaluated });
        }
        for (const restore of [...restores].reverse()) {
            try { restore(); } catch (error) { console.error('[F-21 시험 정리] 대역 복구 실패', error); }
        }
    });

    return {
        count: () => pending.length,
        settled,
        onRestore(restore) { restores.push(restore); },
        onDrain(drain) { drains.push(drain); },
    };
}

function makeSessionRewardEligible(session) {
    session.gameSource = 'production';
}

const ITEM_REWARD_ROLE = 'CITIZEN';
const ITEM_REWARD_WINS = 30;
const ITEM_REWARD_ACHIEVEMENT_ID = 'noble-win-30';
const ITEM_REWARD_ITEM_ID = 'profile-border-귀족';

async function seedCompletedHistory(uuids, count, { role = ITEM_REWARD_ROLE, won = true } = {}) {
    const results = [];
    const players = [];
    for (let i = 0; i < count; i += 1) {
        const gameId = crypto.randomUUID();
        results.push({
            id: gameId,
            room_id: `seed-room-${i}`,
            player_count: uuids.length,
            winner: 'CITIZEN',
            win_reason: 'ALL_JOKERS_ELIMINATED',
            completed: true,
            day_index: 1,
            started_at: new Date(1_000),
            ended_at: new Date(2_000),
            settings: { gameSource: { v: 1, value: 'production' } },
        });
        for (const uuid of uuids) {
            players.push({
                game_id: gameId,
                user_id: uuid,
                nickname_snapshot: 'seed',
                role,
                team: role === 'JOKER' ? 'JOKER' : 'CITIZEN',
                is_alive: true,
                won,
                death_reason: null,
            });
        }
    }
    await db.GameResult.bulkCreate(results);
    await db.GameResultPlayer.bulkCreate(players);
}

async function rewardSnapshotFor(uuid) {
    const entitlementRows = await db.sequelize.models.EconomyEntitlement.findAll({
        where: { user_id: uuid }, attributes: ['item_id', 'item_type', 'source'], raw: true,
    });
    return {
        grants: (await db.AchievementGrant.findAll({
            where: { user_id: uuid }, attributes: ['achievement_id'], raw: true,
        })).map((row) => row.achievement_id).sort(),
        ledger: await db.EconomyLedgerEntry.count({ where: { user_id: uuid } }),
        entitlements: entitlementRows.length,
        entitlementItems: entitlementRows.map((row) => row.item_id).sort(),
    };
}

function assertItemRewardGranted(reward, label) {
    assert.ok(reward.grants.includes(ITEM_REWARD_ACHIEVEMENT_ID), `${label}: ITEM 보상 업적이 지급되지 않았다`);
    assert.equal(
        reward.entitlementItems.filter((itemId) => itemId === ITEM_REWARD_ITEM_ID).length,
        1,
        `${label}: 직업 테두리 소유권이 정확히 1행이어야 한다(0=미지급, 2+=중복 지급)`,
    );
    assert.equal(
        new Set(reward.entitlementItems).size,
        reward.entitlementItems.length,
        `${label}: 같은 item_id 소유권이 중복으로 생겼다`,
    );
    assert.equal(
        new Set(reward.grants).size,
        reward.grants.length,
        `${label}: 같은 업적이 중복으로 지급됐다`,
    );
}

const kickPayload = (session, hostUuid, targetUuid) => ({
    requestId: `db-kick-${crypto.randomUUID()}`,
    bootEpoch: kickReceiptStore.BOOT_EPOCH,
    roomId: session.roomId,
    roomInstanceId: session.roomInstanceId,
    requesterMembershipId: session.players.get(hostUuid).membershipId,
    targetUuid,
    targetMembershipId: session.players.get(targetUuid).membershipId,
    gameId: session.id,
});

const playerRowsOf = async (gameId) => db.GameResultPlayer.findAll({
    where: { game_id: gameId }, order: [['user_id', 'ASC']], raw: true,
});
const statsOf = async (userId) => db.UserStats.findOne({ where: { user_id: userId }, raw: true });

test('AC-03: 추방으로 끝난 판과 일반 이탈로 끝난 판은 식별자를 빼면 전적·통계·업적·원장·소유권이 정확히 같다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const kickHost = await createLocalUser('kh');
    const kickStay = await createLocalUser('ks');
    const kickGone = await createLocalUser('kg');
    const leaveHost = await createLocalUser('lh');
    const leaveStay = await createLocalUser('ls');
    const leaveGone = await createLocalUser('lg');

    await seedCompletedHistory([kickHost, kickStay, kickGone], ITEM_REWARD_WINS);
    await seedCompletedHistory([leaveHost, leaveStay, leaveGone], ITEM_REWARD_WINS);

    const evaluations = captureAchievementEvaluations(t);
    const io = createFakeIo();

    const kicked = commitTerminalReadySession({
        roomId: 'db-room-kick', gameId: crypto.randomUUID(),
        hostUuid: kickHost, uuids: [kickHost, kickStay, kickGone],
    });
    makeSessionRewardEligible(kicked);
    handleKickGamePlayer(io, connectSocket(io, kickHost), kickHost, kickPayload(kicked, kickHost, kickGone), () => {});
    assert.equal(kicked.phase, 'ENDED', '3인 판에서 한 명이 빠지면 parity로 종결돼야 한다');
    assert.ok(await waitForPersistSettled(), '추방 판의 저장이 끝나지 않았다');

    const left = commitTerminalReadySession({
        roomId: 'db-room-leave', gameId: crypto.randomUUID(),
        hostUuid: leaveHost, uuids: [leaveHost, leaveStay, leaveGone],
    });
    makeSessionRewardEligible(left);
    handleLeaveGameSession(io, connectSocket(io, leaveGone), leaveGone, { gameId: left.id }, () => {});
    assert.equal(left.phase, 'ENDED');
    assert.ok(await waitForPersistSettled(), '이탈 판의 저장이 끝나지 않았다');
    assert.ok(await evaluations.settled(), '업적 평가가 끝나지 않았다');

    const kickedHeader = await db.GameResult.findOne({ where: { id: kicked.id }, raw: true });
    const leftHeader = await db.GameResult.findOne({ where: { id: left.id }, raw: true });
    assert.ok(kickedHeader && leftHeader, '두 판 모두 game_results에 저장돼야 한다');
    assert.equal(kickedHeader.completed, leftHeader.completed);
    assert.equal(kickedHeader.winner, leftHeader.winner);
    assert.equal(kickedHeader.win_reason, leftHeader.win_reason);
    assert.equal(kickedHeader.player_count, leftHeader.player_count);

    const normalize = (rows, mapping) => rows
        .map((row) => ({
            slot: mapping[row.user_id],
            role: row.role,
            team: row.team,
            won: row.won,
            is_alive: Boolean(row.is_alive),
            death_reason: row.death_reason,
        }))
        .sort((a, b) => a.slot.localeCompare(b.slot));

    const kickedRows = normalize(await playerRowsOf(kicked.id), {
        [kickHost]: 'host', [kickStay]: 'stay', [kickGone]: 'gone',
    });
    const leftRows = normalize(await playerRowsOf(left.id), {
        [leaveHost]: 'host', [leaveStay]: 'stay', [leaveGone]: 'gone',
    });

    assert.equal(kickedRows.length, 3);
    assert.deepEqual(kickedRows, leftRows, '추방과 일반 이탈의 참가자 행이 달라졌다');
    const gone = kickedRows.find((row) => row.slot === 'gone');
    assert.equal(gone.is_alive, false);
    assert.equal(gone.death_reason, 'DISCONNECT');

    for (const [a, b] of [[kickHost, leaveHost], [kickStay, leaveStay], [kickGone, leaveGone]]) {
        const statsA = await statsOf(a);
        const statsB = await statsOf(b);
        assert.equal(statsA.total_games, statsB.total_games);
        assert.equal(statsA.survival_count, statsB.survival_count);
        assert.equal(statsA.execution_count, statsB.execution_count);
        assert.equal(statsA.most_played_role, statsB.most_played_role);
        assert.equal(statsA.total_games, 1, '이 판이 실제로 집계돼야 한다');
    }

    for (const [a, b] of [[kickHost, leaveHost], [kickStay, leaveStay], [kickGone, leaveGone]]) {
        const rewardA = await rewardSnapshotFor(a);
        const rewardB = await rewardSnapshotFor(b);
        assert.ok(
            rewardA.grants.length > 0,
            '보상 조건을 심었는데도 업적 지급이 하나도 없다 — 이 비교는 아무것도 증명하지 못한다',
        );
        assert.ok(rewardA.ledger > 0, '업적을 지급했는데 재화 원장 항목이 없다');
        assert.ok(rewardA.entitlements > 0, '업적을 지급했는데 소유권이 없다');
        assertItemRewardGranted(rewardA, '추방 판');
        assertItemRewardGranted(rewardB, '일반 이탈 판');
        assert.deepEqual(rewardA, rewardB, '추방과 일반 이탈의 보상 결과가 달라졌다');
    }
});

test('A-09: 첫 저장이 실패해도 재시도가 **같은 레코드**를 실제 DB에 커밋한다 — 그 사이 세션이 정리돼도 ended_at·roster는 불변이다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const host = await createLocalUser('rh');
    const stay = await createLocalUser('rs');
    const gone = await createLocalUser('rg');

    const evaluations = captureAchievementEvaluations(t);

    const original = gameResultRepository.persistGameResultRecord;
    const seen = [];
    let failNext = true;
    gameResultRepository.persistGameResultRecord = (record) => {
        seen.push(record);
        if (failNext) {
            failNext = false;
            return Promise.reject(new Error('DB 다운(주입)'));
        }
        return original(record);
    };
    evaluations.onRestore(() => { gameResultRepository.persistGameResultRecord = original; });

    const scheduled = [];
    gameSessionSocketLayer.__testables.__setTerminalPersistTimersForTests({
        setTimeoutFn: (fn) => { scheduled.push(fn); return scheduled.length; },
        clearTimeoutFn: () => {},
    });
    evaluations.onRestore(() => gameSessionSocketLayer.__testables.__setTerminalPersistTimersForTests());
    evaluations.onDrain(() => {
        for (let fired = 0; fired < 8 && scheduled.length > 0; fired += 1) scheduled.shift()();
    });

    const io = createFakeIo();
    const session = commitTerminalReadySession({
        roomId: 'db-room-retry', gameId: crypto.randomUUID(), hostUuid: host, uuids: [host, stay, gone],
    });
    withClockOnSecondBoundary(() => {
        handleKickGamePlayer(io, connectSocket(io, host), host, kickPayload(session, host, gone), () => {});
    });
    assert.equal(session.phase, 'ENDED');
    assert.equal(
        session.endedAt % 1_000, 0,
        '종료 시각 fixture가 초 경계가 아니다 — DATE(소수초 없음)와 밀리초 비교가 다시 어긋난다',
    );

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(seen.length, 1);
    assert.equal(__getTerminalPersistRunsForTests().length, 1);
    assert.equal(await db.GameResult.count({ where: { id: session.id } }), 0, '실패한 시도는 아무 것도 쓰지 않는다');

    const endedAtBefore = seen[0].result.ended_at.getTime();
    session.players.clear();
    session.endedAt = 1;
    session.dayIndex = 99;

    assert.equal(scheduled.length, 1, '재시도 타이머는 정확히 하나여야 한다');
    scheduled.shift()();
    assert.ok(await waitForPersistSettled(), '재시도 저장이 끝나지 않았다');

    assert.equal(seen.length, 2);
    assert.equal(seen[1], seen[0]);
    assert.equal(seen[1].result.ended_at.getTime(), endedAtBefore);

    const header = await db.GameResult.findOne({ where: { id: session.id }, raw: true });
    assert.ok(header, '재시도가 실제로 커밋해야 한다');
    assert.equal(new Date(header.ended_at).getTime(), endedAtBefore);
    assert.equal(header.player_count, 3);
    assert.equal((await playerRowsOf(session.id)).length, 3);
    for (const uuid of [host, stay, gone]) assert.equal((await statsOf(uuid)).total_games, 1);

    assert.equal(await db.GameResult.count({ where: { id: session.id } }), 1);
    assert.ok(evaluations.count() > 0, '커밋을 확인했으면 원 참가자들의 업적 평가가 시작돼야 한다');
    assert.ok(await evaluations.settled(), '업적 평가가 끝나지 않은 채 시험을 끝내면 다음 시험의 스키마 재생성과 겹친다');
});

test('A-05: 재시도와 중복 종료를 거쳐도 업적 지급·원장 항목·소유권은 중복되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const host = await createLocalUser('ah');
    const stay = await createLocalUser('as');
    const gone = await createLocalUser('ag');
    const participants = [host, stay, gone];

    await seedCompletedHistory(participants, ITEM_REWARD_WINS);

    const evaluations = captureAchievementEvaluations(t);
    const io = createFakeIo();
    const session = commitTerminalReadySession({
        roomId: 'db-room-ach', gameId: crypto.randomUUID(), hostUuid: host, uuids: participants,
    });
    makeSessionRewardEligible(session);
    handleKickGamePlayer(io, connectSocket(io, host), host, kickPayload(session, host, gone), () => {});
    assert.ok(await waitForPersistSettled(), '저장이 끝나지 않았다');
    assert.ok(await evaluations.settled(), '업적 평가가 끝나지 않았다');
    const evaluationsAfterFirst = evaluations.count();

    const snapshot = async () => ({
        byUser: Object.fromEntries(await Promise.all(
            participants.map(async (uuid) => [uuid, await rewardSnapshotFor(uuid)]),
        )),
        totalGrants: await db.AchievementGrant.count(),
        totalLedger: await db.EconomyLedgerEntry.count(),
        totalEntitlements: await db.sequelize.models.EconomyEntitlement.count(),
    });
    const before = await snapshot();

    assert.ok(before.totalGrants > 0, '보상 조건을 심었는데도 최초 지급이 하나도 없다');
    assert.ok(before.totalLedger > 0, '최초 지급인데 재화 원장 항목이 없다');
    assert.ok(before.totalEntitlements > 0, '최초 지급인데 소유권이 없다');
    for (const uuid of participants) {
        assert.ok(before.byUser[uuid].grants.length > 0, `${uuid}에게 지급이 하나도 없다`);
        assertItemRewardGranted(before.byUser[uuid], `${uuid} 최초 지급`);
    }

    gameSessionSocketLayer.__testables.persistTerminalSession(session, { completed: true });
    assert.ok(await waitForPersistSettled(), '중복 종료 훅의 저장이 끝나지 않았다');
    assert.ok(await evaluations.settled(), '중복 종료의 업적 평가가 끝나지 않았다');

    const after = await snapshot();
    assert.deepEqual(after, before, '중복 종료가 업적·원장·소유권을 다시 반영했다');
    for (const uuid of participants) assertItemRewardGranted(after.byUser[uuid], `${uuid} 재평가 후`);
    assert.equal(await db.GameResult.count({ where: { id: session.id } }), 1);
    assert.equal((await playerRowsOf(session.id)).length, 3);
    for (const uuid of participants) assert.equal((await statsOf(uuid)).total_games, 1);

    assert.ok(
        evaluations.count() >= evaluationsAfterFirst,
        '평가 호출 수가 줄어드는 것은 계측 오류다',
    );
});
