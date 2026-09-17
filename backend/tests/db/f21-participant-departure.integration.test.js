'use strict';

// F-21 방장 추방 — 실제 격리 MySQL DB에서 AC-03/AC-05(A-05/A-09)를 검증한다.
//
// 이 파일만이 답할 수 있는 질문은 셋이다.
//   1) 추방과 일반 이탈이 **실제 DB 행**에서 같은가 — 승패·생존·사망 원인·통계 증분까지.
//   2) 첫 저장이 실패한 뒤의 재시도가 **같은 레코드**를 쓰는가 — ended_at·roster·delta 불변.
//   3) 재시도와 중복 종료가 겹쳐도 경기·참가자·통계·업적·원장이 **한 번만** 반영되는가.
// 셋 다 fake 트랜잭션으로는 증명할 수 없다(PK/유일 제약이 없으므로). 로직 자체의 단위
// 검증은 backend/socket/__tests__/kickPlayers.test.js와
// backend/__tests__/gameResultPersistence.test.js가 담당하고, 이 파일은 그 근거를 보완한다.
//
// f12-achievements.integration.test.js와 같은 원칙을 따른다: F01_TEST_DATABASE_URL 전용
// 격리 MySQL, backend/tests/helpers/isolatedTestDb.js의 관리 목록·대상 DB 확인. 값이 없으면
// 실패로 표시하지 않고 명시적으로 skip하며 **미검증**임을 남긴다 — 격리 DB를 구할 수 없다고
// 통과를 꾸미지 않는다.

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

// require 캐시 싱글턴이라, 파일 맨 위에서 맞춰둔 process.env.DATABASE_URL로 처음 require되는
// 이 시점에 격리 DB에 연결된다(f12/roleStatistics.mysql.test.js와 같은 이유·같은 자리).
const db = require('../../models');
const gameResultRepository = require('../../repositories/gameResult.repositories');
const gameSessionCore = require('../../game-core/gameSession');
const gameSessionSocketLayer = require('../../socket/gameSession');
const kickReceiptStore = require('../../socket/kickReceiptStore');
const { hashPassword } = require('../../utils/hash');

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

// ── 소켓 대역 ────────────────────────────────────────────────────────────────

function createFakeSocket(uuid) {
    const rooms = new Set();
    return {
        id: `sock-${uuid}`,
        data: { user: { uuid } },
        connected: true,
        rooms,
        emitted: [],
        async join(roomId) { rooms.add(roomId); },
        async leave(roomId) { rooms.delete(roomId); },
        emit(event, payload) { this.emitted.push({ event, payload }); },
        to() { return { emit: () => {} }; },
    };
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

/**
 * 3인(광대 1 + 시민 2) 결정적 세션 하나. 여기서 시민 한 명이 빠지면 광대 1 : 시민 1 parity에
 * 도달해 **그 이탈 자체가 종결**이 된다 — 그래야 저장 경로까지 실제로 돈다.
 */
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

/** 저장은 fire-and-forget이다 — 그 gameId의 작업이 실제로 끝날 때까지 기다린다. */
async function waitForPersistSettled({ tries = 200 } = {}) {
    for (let i = 0; i < tries; i += 1) {
        if (__getTerminalPersistRunsForTests().length === 0) {
            // 성공 뒤의 업적 평가·무효화까지 마이크로태스크를 한 번 더 비운다.
            await new Promise((resolve) => setImmediate(resolve));
            return true;
        }
        await new Promise((resolve) => setImmediate(resolve));
    }
    return false;
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

// ═════════════════════════════════════════════════════════════════════════════
// AC-03 — 추방과 일반 이탈의 최종 전적은 DB에서도 같다
// ═════════════════════════════════════════════════════════════════════════════

test('AC-03: 추방으로 끝난 판과 일반 이탈로 끝난 판은 식별자를 빼면 game_result_players·user_stats가 정확히 같다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    // 두 판에 서로 다른 계정을 쓴다(통계가 섞이면 "같다"를 판정할 수 없다). 역할 배정은
    // randomFn 고정으로 두 판이 동일하므로, 남는 차이는 uuid뿐이다.
    const kickHost = await createLocalUser('kh');
    const kickStay = await createLocalUser('ks');
    const kickGone = await createLocalUser('kg');
    const leaveHost = await createLocalUser('lh');
    const leaveStay = await createLocalUser('ls');
    const leaveGone = await createLocalUser('lg');

    const io = createFakeIo();

    const kicked = commitTerminalReadySession({
        roomId: 'db-room-kick', gameId: crypto.randomUUID(),
        hostUuid: kickHost, uuids: [kickHost, kickStay, kickGone],
    });
    handleKickGamePlayer(io, createFakeSocket(kickHost), kickHost, kickPayload(kicked, kickHost, kickGone), () => {});
    assert.equal(kicked.phase, 'ENDED', '3인 판에서 한 명이 빠지면 parity로 종결돼야 한다');
    assert.ok(await waitForPersistSettled(), '추방 판의 저장이 끝나지 않았다');

    const left = commitTerminalReadySession({
        roomId: 'db-room-leave', gameId: crypto.randomUUID(),
        hostUuid: leaveHost, uuids: [leaveHost, leaveStay, leaveGone],
    });
    handleLeaveGameSession(io, createFakeSocket(leaveGone), leaveGone, { gameId: left.id }, () => {});
    assert.equal(left.phase, 'ENDED');
    assert.ok(await waitForPersistSettled(), '이탈 판의 저장이 끝나지 않았다');

    // ── 경기 헤더 ────────────────────────────────────────────────────────────
    const kickedHeader = await db.GameResult.findOne({ where: { id: kicked.id }, raw: true });
    const leftHeader = await db.GameResult.findOne({ where: { id: left.id }, raw: true });
    assert.ok(kickedHeader && leftHeader, '두 판 모두 game_results에 저장돼야 한다');
    assert.equal(kickedHeader.completed, leftHeader.completed);
    assert.equal(kickedHeader.winner, leftHeader.winner);
    assert.equal(kickedHeader.win_reason, leftHeader.win_reason);
    assert.equal(kickedHeader.player_count, leftHeader.player_count);

    // ── 참가자 행 ────────────────────────────────────────────────────────────
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
    // 그리고 그 공통 결과가 실제로 "빠진 사람만 DISCONNECT 사망"이다(빈 비교로 통과하지 않게).
    const gone = kickedRows.find((row) => row.slot === 'gone');
    assert.equal(gone.is_alive, false);
    assert.equal(gone.death_reason, 'DISCONNECT');

    // ── 통계 증분 ────────────────────────────────────────────────────────────
    for (const [a, b] of [[kickHost, leaveHost], [kickStay, leaveStay], [kickGone, leaveGone]]) {
        const statsA = await statsOf(a);
        const statsB = await statsOf(b);
        assert.equal(statsA.total_games, statsB.total_games);
        assert.equal(statsA.survival_count, statsB.survival_count);
        assert.equal(statsA.execution_count, statsB.execution_count);
        assert.equal(statsA.most_played_role, statsB.most_played_role);
        assert.equal(statsA.total_games, 1, '이 판이 실제로 집계돼야 한다');
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// A-09 — 첫 저장 실패 → 재시도 성공 → 중복 종료
// ═════════════════════════════════════════════════════════════════════════════

test('A-09: 첫 저장이 실패해도 재시도가 **같은 레코드**를 실제 DB에 커밋한다 — 그 사이 세션이 정리돼도 ended_at·roster는 불변이다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const host = await createLocalUser('rh');
    const stay = await createLocalUser('rs');
    const gone = await createLocalUser('rg');

    // 첫 시도만 실패시킨다. 두 번째부터는 **실제** 저장소가 돈다 — 재시도가 진짜 DB에
    // 쓰는지를 보려는 것이므로 대역으로 성공을 흉내내지 않는다.
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
    t.after(() => { gameResultRepository.persistGameResultRecord = original; });

    // 실제 1초를 기다리지 않도록 재시도 타이머만 수동으로 돌린다(판정 로직은 그대로다).
    const scheduled = [];
    gameSessionSocketLayer.__testables.__setTerminalPersistTimersForTests({
        setTimeoutFn: (fn) => { scheduled.push(fn); return scheduled.length; },
        clearTimeoutFn: () => {},
    });
    t.after(() => gameSessionSocketLayer.__testables.__setTerminalPersistTimersForTests());

    const io = createFakeIo();
    const session = commitTerminalReadySession({
        roomId: 'db-room-retry', gameId: crypto.randomUUID(), hostUuid: host, uuids: [host, stay, gone],
    });
    handleKickGamePlayer(io, createFakeSocket(host), host, kickPayload(session, host, gone), () => {});
    assert.equal(session.phase, 'ENDED');

    // 첫 시도는 실패했고 작업은 남아 있다 — 실패한 판이 아무도 다시 쓰지 않는 상태가 되면 안 된다.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(seen.length, 1);
    assert.equal(__getTerminalPersistRunsForTests().length, 1);
    assert.equal(await db.GameResult.count({ where: { id: session.id } }), 0, '실패한 시도는 아무 것도 쓰지 않는다');

    // 저장을 기다리는 동안 그 세션이 정리된 상황을 재현한다. 레코드가 session을 다시 읽는다면
    // 여기서 ended_at·roster·player_count가 무너진다.
    const endedAtBefore = seen[0].result.ended_at.getTime();
    session.players.clear();
    session.endedAt = 1;
    session.dayIndex = 99;

    assert.equal(scheduled.length, 1, '재시도 타이머는 정확히 하나여야 한다');
    scheduled.shift()();
    assert.ok(await waitForPersistSettled(), '재시도 저장이 끝나지 않았다');

    // 재시도는 문자 그대로 같은 객체를 다시 썼다.
    assert.equal(seen.length, 2);
    assert.equal(seen[1], seen[0]);
    assert.equal(seen[1].result.ended_at.getTime(), endedAtBefore);

    // 실제 DB에도 그 값 그대로 커밋됐다.
    const header = await db.GameResult.findOne({ where: { id: session.id }, raw: true });
    assert.ok(header, '재시도가 실제로 커밋해야 한다');
    assert.equal(new Date(header.ended_at).getTime(), endedAtBefore);
    assert.equal(header.player_count, 3);
    assert.equal((await playerRowsOf(session.id)).length, 3);
    for (const uuid of [host, stay, gone]) assert.equal((await statsOf(uuid)).total_games, 1);

    // 실패한 시도가 남긴 흔적은 없다 — 성공한 커밋이 유일한 행이다.
    assert.equal(await db.GameResult.count({ where: { id: session.id } }), 1);
    // (중복 종료의 DB 멱등성은 아래 A-05 시험이 원 세션 그대로 다시 밟아 확인한다.)
});

// ═════════════════════════════════════════════════════════════════════════════
// A-05 — 업적·원장·소유권은 재시도·중복 종료에도 한 번만 반영된다
// ═════════════════════════════════════════════════════════════════════════════

test('A-05: 재시도와 중복 종료를 거쳐도 업적 지급·원장 항목·소유권은 중복되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const host = await createLocalUser('ah');
    const stay = await createLocalUser('as');
    const gone = await createLocalUser('ag');

    const io = createFakeIo();
    const session = commitTerminalReadySession({
        roomId: 'db-room-ach', gameId: crypto.randomUUID(), hostUuid: host, uuids: [host, stay, gone],
    });
    handleKickGamePlayer(io, createFakeSocket(host), host, kickPayload(session, host, gone), () => {});
    assert.ok(await waitForPersistSettled(), '저장이 끝나지 않았다');
    // 업적 평가는 저장 확인 뒤에 fire-and-forget으로 돈다 — 실제 DB 왕복이 끝날 여지를 준다.
    for (let i = 0; i < 50; i += 1) await new Promise((resolve) => setImmediate(resolve));

    const snapshot = async () => ({
        grants: await db.AchievementGrant.count(),
        ledger: await db.EconomyLedgerEntry.count(),
        entitlements: await db.sequelize.models.EconomyEntitlement.count(),
    });
    const before = await snapshot();

    // 같은 판의 종결 훅이 다시 밟히면 저장은 "이미 저장됨"으로 확인되고, 업적 평가가 한 번
    // 더 돈다 — 그 재평가가 이미 지급한 것을 다시 지급하면 안 된다(유일 제약이 근거다).
    gameSessionSocketLayer.__testables.persistTerminalSession(session, { completed: true });
    assert.ok(await waitForPersistSettled(), '중복 종료 훅의 저장이 끝나지 않았다');
    for (let i = 0; i < 50; i += 1) await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(await snapshot(), before, '중복 종료가 업적·원장·소유권을 다시 반영했다');
    assert.equal(await db.GameResult.count({ where: { id: session.id } }), 1);
    assert.equal((await playerRowsOf(session.id)).length, 3);
    for (const uuid of [host, stay, gone]) assert.equal((await statsOf(uuid)).total_games, 1);
});
