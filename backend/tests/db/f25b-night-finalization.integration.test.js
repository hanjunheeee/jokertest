'use strict';

// F-25b 밤 최종 사망·승패·기록 확정 시점 — 실제 격리 MySQL DB에서 AC-01~AC-05를 검증한다.
//
// 이 파일만이 답할 수 있는 질문은 넷이다.
//   1) 킬 직후·치료 판정 전 시점에 **경기 기록이 실제로 한 행도 쓰이지 않는가**(AC-01).
//   2) 치료가 성공한 밤이 전적·통계·업적·원장·소유권을 **하나도 움직이지 않는가**(AC-02).
//   3) 미치료 밤의 확정이 **정확히 한 번**만 사망·승패·저장을 만드는가(AC-03/AC-04).
//   4) 자동 최종화와 수동 resolve_night가 겹쳐도 경기 1행·참가자 1행/인·통계 +1·보상 1회인가(AC-05).
//
// 호출 부재(0회)는 DB가 0행이라는 사실만으로 대신하지 않는다 — game-core의 실제 호출 지점에
// 관찰 통로(__setNightCommitObserverForTests)를 붙여 사망 확정·승패 평가·종료 확정 횟수를 직접
// 세고, 저장·업적 경계는 각각 저장소 호출과 평가 Promise로 센다.
//
// backend/tests/db/f21-participant-departure.integration.test.js와 같은 원칙을 따른다:
// F01_TEST_DATABASE_URL 전용 격리 MySQL, backend/tests/helpers/isolatedTestDb.js의 관리 목록·
// 대상 DB 확인. 값이 없으면 실패로 표시하지 않고 명시적으로 skip하며 **미검증**임을 남긴다 —
// 격리 DB를 구할 수 없다고 통과를 꾸미지 않는다.

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
const { buildManagedSchema, resetManagedSchema, assertDedicatedTestDatabase } = require('../helpers/isolatedTestDb');

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
// 이 시점에 격리 DB에 연결된다(f12/f21과 같은 이유·같은 자리).
const db = require('../../models');
const gameResultRepository = require('../../repositories/gameResult.repositories');
const gameSessionCore = require('../../game-core/gameSession');
const gameSessionSocketLayer = require('../../socket/gameSession');
const achievementService = require('../../services/achievementService');
const { hashPassword } = require('../../utils/hash');

const {
    handleSubmitNightAction,
    handleResolveNight,
    startNightTurnSequence,
    persistTerminalSession,
    __getTerminalPersistRunsForTests,
    // F-27a: 실제 연출 대기 게이트가 열리면(진짜 사건 + 현재 적격 수신자) 완료 보고 또는 상한
    // 경과 전까지 다음 역할·최종화가 시작되지 않는다. 이 파일의 구동은 그 판에 실제로 주입된
    // 수동 시계를 상한만큼 흘려보내 **진짜 상한 경과**로 대기를 드레인한다(drainWait 참고) —
    // 내부 해제 함수를 직접 부르지 않는다.
    __getNightTurnRunForTests,
} = gameSessionSocketLayer.__testables;

/**
 * F-27a: 진행 중인 연출 대기(있다면)를 실제 상한 경과로 해제한다.
 *
 * run에 주입된 그 판의 수동 시계(clock)를 run.presentationWaitTimeoutMs만큼 흘려보낸다 —
 * activateNightPresentationWait가 건 바로 그 상한 타이머가 실제로 발화해 releaseNightPresentationWait를
 * 부르는 것과 동일한 경로다(내부 해제 함수를 우회 호출하지 않는다). 완료 ACK를 대신 보내지
 * 않으므로 수신 기록은 completed:false로 남고, 이 파일이 보는 사망·승패·저장 단언에는 영향이
 * 없다.
 */
function drainWait(session, clock) {
    for (let guard = 0; guard < 20; guard += 1) {
        const run = __getNightTurnRunForTests(session.id);
        if (!run || !run.wait || run.wait.active !== true) return;
        clock.advance(run.presentationWaitTimeoutMs);
    }
}

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

/**
 * A-04: destructive reset과 실제 질의가 **둘 다** 전용 DB에서만 일어나게 한다.
 *
 * resetManagedSchema는 시험이 직접 만든 Sequelize만 확인한다. 그런데 이 파일의 단언은
 * backend/models가 쥔 **또 다른** Sequelize(db.sequelize)로 읽고 쓴다 — 그쪽도 같은 전용 DB를
 * 가리키는지 확인하지 않으면 "격리된 DB에서 검증했다"가 성립하지 않는다.
 */
const setUp = async () => {
    await assertDedicatedTestDatabase(db.sequelize, TEST_DB_URL);
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

// ── 소켓 대역 (f21과 같은 등록 절차: namespace registry에 실제로 들어간 소켓이어야 한다) ──

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

/** advance(ms) 전에는 어떤 타이머도 돌지 않는 수동 시계(gameSession.nightTurns.test.js와 같은 계약). */
function createManualClock(startMs = 1_000_000) {
    let now = startMs;
    let nextId = 1;
    const timers = new Map();
    return {
        nowFn: () => now,
        setTimeoutFn(fn, delayMs) {
            const id = nextId++;
            timers.set(id, { at: now + Math.max(0, delayMs), fn });
            return id;
        },
        clearTimeoutFn(id) { timers.delete(id); },
        advance(ms) {
            const target = now + ms;
            for (;;) {
                let dueId = null;
                let due = null;
                for (const [id, timer] of timers) {
                    if (timer.at <= target && (due === null || timer.at < due.at)) {
                        dueId = id;
                        due = timer;
                    }
                }
                if (due === null) break;
                timers.delete(dueId);
                now = due.at;
                due.fn();
            }
            now = target;
        },
    };
}

/**
 * JOKER 1 · DOCTOR 1 · 나머지 CITIZEN 구성의 세션을 만들어 **그 밤**(NIGHT)까지 맞춘다.
 *
 * GUARD/WITCH_HUNTER는 두지 않는다 — 구성 0 역할은 턴 없이 즉시 확정되므로(2026-09-22 운영자
 * 결정, socket/gameSession.js advanceNightTurn) 의사 차례가 끝나는 순간 그 밤이 최종화된다. 이
 * 파일이 보려는 킬·치료·최종화 순서를 흐리지 않으면서도 네 역할의 판정 자료는 그대로 남는다.
 */
function commitNightSession({ roomId, gameId, hostUuid, uuids }) {
    const players = new Map(uuids.map((uuid) => [uuid, {
        uuid, nickname: `n-${uuid.slice(0, 6)}`, isReady: true, membershipId: `mem-${uuid}`,
    }]));
    const prepared = gameSessionCore.prepareGameSession({
        id: roomId,
        instanceId: `inst-${roomId}`,
        hostUuid,
        players,
        settings: {
            maxPlayers: 10,
            jokerCount: 1,
            roleCompositionMode: 'custom',
            roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
        },
    }, { randomFn: () => 0, gameIdFn: () => gameId });
    assert.equal(prepared.ok, true, JSON.stringify(prepared));
    gameSessionCore.commitGameSession(prepared.session);

    const session = prepared.session;
    for (const uuid of session.players.keys()) gameSessionCore.acknowledgeRoleReveal(uuid, session.id);
    // 전원 확인은 초기 DAY로 데려간다 — 이 파일이 보는 것은 밤이므로 canonical NIGHT 상태로 맞춘다.
    session.phase = 'NIGHT';
    session.dayIndex = 0;
    session.nightActions = new Map();
    session.nightResolution = null;
    session.dayVotes = new Map();
    session.dayVoteResolution = null;
    session.tribunal = null;

    const byRole = (role) => [...session.players.values()].filter((p) => p.role === role).map((p) => p.uuid);
    return {
        session,
        jokerUuid: byRole('JOKER')[0],
        doctorUuid: byRole('DOCTOR')[0],
        citizenUuids: byRole('CITIZEN'),
    };
}

/** 실제 사망 확정·승패 평가·종료 확정 지점의 호출 횟수(DB 0행으로 대신하지 않는 근거). */
function captureCommitEvents() {
    const events = [];
    gameSessionCore.__setNightCommitObserverForTests((event, detail) => events.push({ event, ...detail }));
    return {
        events,
        countOf: (event) => events.filter((e) => e.event === event).length,
        winEvaluations: (source) => events.filter((e) => e.event === 'WIN_EVALUATED' && e.source === source).length,
    };
}

/** 저장 경계(레코드 조립→저장소 호출)의 실제 호출을 센다. */
function captureRepositoryCalls() {
    const calls = [];
    const original = gameResultRepository.persistGameResultRecord;
    gameResultRepository.persistGameResultRecord = (record) => {
        calls.push(record);
        return original(record);
    };
    return {
        calls,
        restore() { gameResultRepository.persistGameResultRecord = original; },
    };
}

/** f21과 같은 대기 계약 — 저장 작업이 실제로 끝날 때까지 시간으로 기다린다. */
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

/**
 * 업적 평가의 **실제 완료**를 기다리고, 이 시험이 설치한 대역의 되돌리기를 한 곳에 모은다
 * (f21과 같은 이유·같은 순서: 저장 → 평가 → 대역 복구).
 */
function captureAchievementEvaluations(t) {
    const pending = [];
    const restores = [];
    const originalEvaluate = achievementService.evaluateAndGrantForUser;
    gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests((userId) => {
        const promise = Promise.resolve(originalEvaluate(userId));
        pending.push(promise.catch(() => {}));
        return promise;
    });
    restores.push(() => gameSessionSocketLayer.__testables.__setEvaluateAchievementsForTests());
    // 관찰 통로도 반드시 되돌린다 — 남으면 다음 시험의 커밋이 이 배열에 사건을 쌓는다.
    restores.push(() => gameSessionCore.__setNightCommitObserverForTests());

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
        const drained = await waitForPersistSettled({ timeoutMs: TEARDOWN_DRAIN_TIMEOUT_MS });
        const evaluated = await settled();
        if (!drained || !evaluated) {
            console.error('[F-25b 시험 정리] 비동기 작업이 기한 안에 끝나지 않았다', { drained, evaluated });
        }
        for (const restore of [...restores].reverse()) {
            try { restore(); } catch (error) { console.error('[F-25b 시험 정리] 대역 복구 실패', error); }
        }
    });

    return {
        count: () => pending.length,
        settled,
        onRestore(restore) { restores.push(restore); },
    };
}

/** 이 판이 보상 대상이 되도록 출처를 production으로 고정한다(f21과 같은 이유). */
function makeSessionRewardEligible(session) {
    session.gameSource = 'production';
}

// ITEM 보상(직업 30승 → 프로필 테두리)의 실제 임계값. f21과 같은 상수·같은 근거다.
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
        where: { user_id: uuid }, attributes: ['item_id'], raw: true,
    });
    return {
        grants: (await db.AchievementGrant.findAll({
            where: { user_id: uuid }, attributes: ['achievement_id'], raw: true,
        })).map((row) => row.achievement_id).sort(),
        ledger: await db.EconomyLedgerEntry.count({ where: { user_id: uuid } }),
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
}

const playerRowsOf = async (gameId) => db.GameResultPlayer.findAll({
    where: { game_id: gameId }, order: [['user_id', 'ASC']], raw: true,
});
const statsOf = async (userId) => db.UserStats.findOne({ where: { user_id: userId }, raw: true });

/** 이 판과 무관한 축까지 포함한 전역 표본 — "아무 것도 쓰이지 않았다"의 근거다. */
async function globalRecordSnapshot() {
    return {
        gameResults: await db.GameResult.count(),
        gameResultPlayers: await db.GameResultPlayer.count(),
        grants: await db.AchievementGrant.count(),
        ledger: await db.EconomyLedgerEntry.count(),
        entitlements: await db.sequelize.models.EconomyEntitlement.count(),
        stats: (await db.UserStats.findAll({
            attributes: ['user_id', 'total_games', 'survival_count', 'execution_count'],
            order: [['user_id', 'ASC']], raw: true,
        })),
    };
}

/**
 * 실제 submit_night_action 경로를 그대로 탄다.
 *
 * 생산 시그니처는 backend/socket/gameSession.js::handleSubmitNightAction(socket, uuid, payload,
 * callback) 네 개다 — io를 받지 않는다(같은 파일 4016행의 socket.on 등록도 이 네 개로 부른다).
 * io를 앞에 끼워 넣으면 callback 자리에 payload 객체가 들어가 `typeof callback !== 'function'`
 * 에서 조용히 반환되고, 제출이 실제로는 한 건도 들어가지 않은 채 ack만 null로 남는다.
 */
const submitNight = (socket, uuid, session, targetId) => {
    let response = null;
    handleSubmitNightAction(socket, uuid, { gameId: session.id, targetId }, (r) => { response = r; });
    return response;
};

// ═════════════════════════════════════════════════════════════════════════════
// AC-01 — 킬 직후·치료 판정 전에는 승패·종료·기록 저장이 시작되지 않는다
// ═════════════════════════════════════════════════════════════════════════════

test('AC-01: 킬 직후·치료 판정 전 시점에는 승패 판정·경기 종료·경기 기록 저장이 하나도 시작되지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const host = await createLocalUser('n1h');
    const doc = await createLocalUser('n1d');
    const cit = await createLocalUser('n1c');
    const uuids = [host, doc, cit];
    // 보상이 실제로 발생할 수 있는 조건까지 갖춘 상태에서 "아무 것도 쓰이지 않았다"를 본다 —
    // 조건 자체가 없으면 0 == 0으로 통과해 아무것도 증명하지 못한다.
    await seedCompletedHistory(uuids, ITEM_REWARD_WINS);

    const evaluations = captureAchievementEvaluations(t);
    const repo = captureRepositoryCalls();
    evaluations.onRestore(() => repo.restore());

    const io = createFakeIo();
    const { session, jokerUuid, citizenUuids } = commitNightSession({
        roomId: 'db-f25b-ac01', gameId: crypto.randomUUID(), hostUuid: host, uuids,
    });
    makeSessionRewardEligible(session);
    const sockets = new Map(uuids.map((uuid) => [uuid, connectSocket(io, uuid)]));
    const targetUuid = citizenUuids[0] ?? uuids.find((uuid) => uuid !== jokerUuid);

    const baseline = await globalRecordSnapshot();
    const observed = captureCommitEvents();
    const clock = createManualClock();

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 });
    // 실제 입력 경로: submit_night_action → handleSubmitNightAction → submitNightAction →
    // maybeEndNightTurnOnCompletion → endNightTurn → completeNightRole.
    assert.deepEqual(submitNight(sockets.get(jokerUuid), jokerUuid, session, targetUuid), { ok: true });
    // F-27a: 실제 KILL 사건이 연출 대기를 연다 — 실제 상한 경과로 드레인해야 DOCTOR 차례가
    // 실제로 시작된다(드레인은 완료 ACK를 보내지 않으므로 수신 기록은 completed:false로
    // 남고, 아래 사망·승패·저장 단언에는 영향이 없다).
    drainWait(session, clock);

    // ── 킬 직후, 의사 판정 전의 canonical 상태 ────────────────────────────────
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR', '의사 차례에서 멈춰 있어야 한다');
    assert.equal(session.players.get(targetUuid).alive, true, '임시 사망은 canonical alive를 바꾸지 않는다');
    assert.equal(session.phase, 'NIGHT');
    assert.equal(session.nightResolution, null, '현재 밤의 확정 결과가 없어야 한다');
    assert.equal(Object.hasOwn(session, 'winResult'), false);
    const progress = gameSessionCore.__testables.getNightProgress(session);
    assert.deepEqual(progress.events, [{ type: 'KILL', targetId: targetUuid }]);
    assert.equal(progress.recoveryStates.get(targetUuid), 'PENDING_RECOVERY');
    assert.equal(progress.healingClosed, false);

    // ── 호출 부재는 계측된 사건 구간에서 판정한다(0회) ────────────────────────
    assert.deepEqual(observed.events, [], '승패 평가·사망 확정·종료 확정이 하나도 실행되면 안 된다');
    // 저장소 호출보다 한 단계 앞선 **레코드 조립**도 시작되지 않았다 — 이 통로가 실제 조립에서는
    // 반드시 울린다는 양성 대조는 아래 저장 재시도 시험과 game-core 시험이 함께 본다.
    assert.equal(observed.countOf('RESULT_RECORD_BUILD_STARTED'), 0, '경기 기록 조립이 시작되면 안 된다');
    assert.equal(repo.calls.length, 0, '경기 기록 저장이 시작되면 안 된다');
    assert.equal(__getTerminalPersistRunsForTests().length, 0, '종결 저장 작업이 등록되면 안 된다');
    assert.equal(evaluations.count(), 0, '업적 평가가 시작되면 안 된다');

    // ── 실제 DB도 전혀 움직이지 않았다 ────────────────────────────────────────
    assert.equal(await db.GameResult.count({ where: { id: session.id } }), 0);
    assert.equal(await db.GameResultPlayer.count({ where: { game_id: session.id } }), 0);
    assert.deepEqual(await globalRecordSnapshot(), baseline, '이 시점에 어떤 기록·보상도 쓰이면 안 된다');
});

// ═════════════════════════════════════════════════════════════════════════════
// AC-02 — 치료가 성공한 밤
// ═════════════════════════════════════════════════════════════════════════════

test('AC-02: 치료가 성공한 밤은 최종 사망 0이고 승패 상태와 실제 DB 기록이 전혀 변하지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const host = await createLocalUser('n2h');
    const doc = await createLocalUser('n2d');
    const citA = await createLocalUser('n2a');
    const citB = await createLocalUser('n2b');
    const uuids = [host, doc, citA, citB];
    await seedCompletedHistory(uuids, ITEM_REWARD_WINS);

    const evaluations = captureAchievementEvaluations(t);
    const repo = captureRepositoryCalls();
    evaluations.onRestore(() => repo.restore());

    const io = createFakeIo();
    const { session, jokerUuid, doctorUuid, citizenUuids } = commitNightSession({
        roomId: 'db-f25b-ac02', gameId: crypto.randomUUID(), hostUuid: host, uuids,
    });
    makeSessionRewardEligible(session);
    const sockets = new Map(uuids.map((uuid) => [uuid, connectSocket(io, uuid)]));
    const targetUuid = citizenUuids[0];
    const aliveBefore = [...session.players.values()].filter((p) => p.alive).length;

    const baseline = await globalRecordSnapshot();
    const observed = captureCommitEvents();
    const clock = createManualClock();

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 });
    submitNight(sockets.get(jokerUuid), jokerUuid, session, targetUuid);
    drainWait(session, clock); // F-27a: 실제 KILL 사건의 대기를 풀어야 DOCTOR 차례가 시작된다.
    submitNight(sockets.get(doctorUuid), doctorUuid, session, targetUuid);
    drainWait(session, clock); // F-27a: 실제 HEAL 사건의 대기를 풀어야 GUARD 차례가 시작된다.
    // 남은 두 역할(GUARD/WITCH_HUNTER)은 구성 0이라 턴 없이 확정되고 그 밤은 자동 최종화된다 —
    // 시계를 더 돌려도 다시 확정되지 않아야 아래 1회 단언이 성립한다.
    clock.advance(gameSessionCore.NIGHT_TURN_DURATION_MS * 2);

    assert.equal(session.phase, 'DAY', '치료가 성공한 밤도 정상적으로 낮으로 넘어간다');
    assert.equal(session.players.get(targetUuid).alive, true);
    assert.equal([...session.players.values()].filter((p) => p.alive).length, aliveBefore, '그 밤의 최종 사망 수는 0이다');
    assert.equal(Object.hasOwn(session, 'winResult'), false, '승패 상태가 변하지 않았다');
    assert.equal(session.nightResolution.pendingEliminationTargetId, null);
    assert.deepEqual(session.nightResolution.publicDeathReveals, []);

    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 0);
    assert.equal(observed.winEvaluations('NIGHT'), 1, '밤 최종화의 승패 평가는 정확히 한 번이다');
    assert.equal(observed.countOf('GAME_FINALIZED'), 0);
    assert.equal(repo.calls.length, 0, '비종결 밤은 경기 기록을 저장하지 않는다');
    assert.equal(evaluations.count(), 0);
    assert.deepEqual(await globalRecordSnapshot(), baseline, '치료 성공 밤은 실제 DB를 전혀 바꾸지 않는다');
});

// ═════════════════════════════════════════════════════════════════════════════
// AC-03 — 미치료 밤의 확정은 정확히 1회
// ═════════════════════════════════════════════════════════════════════════════

test('AC-03: 치료되지 않은 밤은 의사 차례가 끝난 뒤 최종 사망이 정확히 1회 확정되고 승패 판정도 1회만 실행된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const host = await createLocalUser('n3h');
    const doc = await createLocalUser('n3d');
    const citA = await createLocalUser('n3a');
    const citB = await createLocalUser('n3b');
    const uuids = [host, doc, citA, citB];

    const evaluations = captureAchievementEvaluations(t);
    const repo = captureRepositoryCalls();
    evaluations.onRestore(() => repo.restore());

    const io = createFakeIo();
    const { session, jokerUuid, doctorUuid, citizenUuids } = commitNightSession({
        roomId: 'db-f25b-ac03', gameId: crypto.randomUUID(), hostUuid: host, uuids,
    });
    makeSessionRewardEligible(session);
    const sockets = new Map(uuids.map((uuid) => [uuid, connectSocket(io, uuid)]));
    const targetUuid = citizenUuids[0];

    const observed = captureCommitEvents();
    const clock = createManualClock();

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 });
    submitNight(sockets.get(jokerUuid), jokerUuid, session, targetUuid);
    drainWait(session, clock); // F-27a: 실제 KILL 사건의 대기를 풀어야 DOCTOR 차례가 시작된다.

    // A-06: 의사 차례가 끝나기 전에는 치료 가능성이 열려 있고 최종 사망·승패 평가가 없다.
    assert.equal(gameSessionCore.getCurrentNightTurnRole(session), 'DOCTOR', '의사 차례에서 멈춰 있어야 한다');
    const progress = gameSessionCore.__testables.getNightProgress(session);
    assert.equal(progress.healingClosed, false);
    assert.equal(progress.recoveryStates.get(targetUuid), 'PENDING_RECOVERY');
    assert.equal(session.players.get(targetUuid).alive, true);
    assert.deepEqual(observed.events, [], '의사 차례 종료 전에는 사망·승패 평가가 0회다');

    // 의사가 기권해 치료 가능성이 닫힌다. 이 판의 구성은 GUARD·WITCH_HUNTER가 0이라(commitNightSession)
    // 2026-09-22 운영자 결정(구성 0 역할은 턴 없이 즉시 확정, socket/gameSession.js advanceNightTurn)에
    // 따라 의사 차례가 끝나는 바로 그 순간 그 밤이 최종화된다 — 기다릴 남은 턴이 없다.
    submitNight(sockets.get(doctorUuid), doctorUuid, session, null);

    assert.equal(session.players.get(targetUuid).alive, false);
    assert.equal(session.players.get(targetUuid).deathReason, 'ASSASSINATION');
    assert.equal(session.phase, 'DAY');
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1, '최종 사망은 정확히 1회다');
    assert.equal(observed.winEvaluations('NIGHT'), 1, '그에 따른 승패 판정도 1회다');
    assert.equal(observed.winEvaluations('DISCONNECT'), 0, '이탈 경로의 평가와 섞이지 않는다');
    assert.equal(observed.countOf('GAME_FINALIZED'), 0);

    // 옛 턴 제한시간이 지나도(남은 타이머가 있었다면 울릴 시각) 같은 밤이 다시 확정되지 않는다.
    const eventsAfterFinalize = observed.events.length;
    clock.advance(gameSessionCore.NIGHT_TURN_DURATION_MS * 2);
    assert.equal(observed.events.length, eventsAfterFinalize, '최종화 뒤에는 사망·승패 평가가 더 실행되지 않는다');
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1);
    assert.equal(observed.winEvaluations('NIGHT'), 1);
    assert.equal(session.phase, 'DAY');

    // 비종결 밤이므로 경기 기록은 한 행도 쓰이지 않는다.
    assert.equal(repo.calls.length, 0);
    assert.equal(await db.GameResult.count({ where: { id: session.id } }), 0);
    for (const uuid of uuids) assert.equal((await statsOf(uuid)).total_games, 0);
});

// ═════════════════════════════════════════════════════════════════════════════
// AC-04 — 마지막 밤의 킬 + 치료
// ═════════════════════════════════════════════════════════════════════════════

test('AC-04: 마지막 밤에 킬과 치료가 함께 발생해도 치료가 성공하면 게임이 종료되지 않는다(미치료 대조군은 종료·저장 1회)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    // A-05: 킬 전에는 승자가 없고(광대 1 : 비광대 2), 미치료 킬이 확정되면 동수가 되는 상태다.
    const healHost = await createLocalUser('h4h');
    const healDoc = await createLocalUser('h4d');
    const healCit = await createLocalUser('h4c');
    const killHost = await createLocalUser('k4h');
    const killDoc = await createLocalUser('k4d');
    const killCit = await createLocalUser('k4c');
    await seedCompletedHistory([killHost, killDoc, killCit], ITEM_REWARD_WINS);

    const evaluations = captureAchievementEvaluations(t);
    const repo = captureRepositoryCalls();
    evaluations.onRestore(() => repo.restore());
    const observed = captureCommitEvents();
    const io = createFakeIo();

    // ── 치료 성공군 ───────────────────────────────────────────────────────────
    const healed = commitNightSession({
        roomId: 'db-f25b-ac04-heal', gameId: crypto.randomUUID(), hostUuid: healHost,
        uuids: [healHost, healDoc, healCit],
    });
    makeSessionRewardEligible(healed.session);
    assert.equal(
        gameSessionCore.__testables.evaluateWinCondition(healed.session), null,
        '킬 전부터 승자가 있는 fixture는 이 대조를 성립시키지 못한다',
    );
    const healSockets = new Map([healHost, healDoc, healCit].map((uuid) => [uuid, connectSocket(io, uuid)]));
    const healTarget = healed.citizenUuids[0];
    const healClock = createManualClock();
    startNightTurnSequence(io, healed.session, { ...healClock, randomFn: () => 0.5 });
    submitNight(healSockets.get(healed.jokerUuid), healed.jokerUuid, healed.session, healTarget);
    drainWait(healed.session, healClock); // F-27a: 실제 KILL 사건의 대기를 풀어야 DOCTOR 차례가 시작된다.
    submitNight(healSockets.get(healed.doctorUuid), healed.doctorUuid, healed.session, healTarget);
    drainWait(healed.session, healClock); // F-27a: 실제 HEAL 사건의 대기를 풀어야 GUARD 차례가 시작된다.
    healClock.advance(gameSessionCore.NIGHT_TURN_DURATION_MS * 2);

    assert.equal(healed.session.phase, 'DAY', '치료가 성공했으므로 게임이 끝나지 않는다');
    assert.equal(Object.hasOwn(healed.session, 'winResult'), false);
    assert.equal([...healed.session.players.values()].filter((p) => p.alive).length, 3);
    assert.equal(repo.calls.length, 0, '치료 성공군은 경기 기록을 저장하지 않는다');
    assert.equal(await db.GameResult.count({ where: { id: healed.session.id } }), 0);

    // ── 미치료 대조군(같은 초기 생존 상태) ────────────────────────────────────
    const killed = commitNightSession({
        roomId: 'db-f25b-ac04-kill', gameId: crypto.randomUUID(), hostUuid: killHost,
        uuids: [killHost, killDoc, killCit],
    });
    makeSessionRewardEligible(killed.session);
    assert.equal(gameSessionCore.__testables.evaluateWinCondition(killed.session), null);
    const killSockets = new Map([killHost, killDoc, killCit].map((uuid) => [uuid, connectSocket(io, uuid)]));
    const killTarget = killed.citizenUuids[0];
    const killClock = createManualClock();
    startNightTurnSequence(io, killed.session, { ...killClock, randomFn: () => 0.5 });
    submitNight(killSockets.get(killed.jokerUuid), killed.jokerUuid, killed.session, killTarget);
    drainWait(killed.session, killClock); // F-27a: 실제 KILL 사건의 대기를 풀어야 DOCTOR 차례가 시작된다.
    submitNight(killSockets.get(killed.doctorUuid), killed.doctorUuid, killed.session, null);
    killClock.advance(gameSessionCore.NIGHT_TURN_DURATION_MS * 2);

    assert.equal(killed.session.phase, 'ENDED');
    assert.deepEqual(killed.session.winResult, { winner: 'JOKER' }, '광대 동수로 종료된다');
    assert.equal(observed.countOf('GAME_FINALIZED'), 1, '두 대조군 중 종료 확정은 한 번뿐이다');
    assert.ok(await waitForPersistSettled(), '종결 판의 저장이 끝나지 않았다');
    assert.ok(await evaluations.settled(), '업적 평가가 끝나지 않았다');

    assert.equal(repo.calls.length, 1, '정상 완료된 대조군만 저장을 한 번 시작한다');
    const header = await db.GameResult.findOne({ where: { id: killed.session.id }, raw: true });
    assert.ok(header, '정상 완료 판은 실제 DB에 저장된다');
    assert.equal(Boolean(header.completed), true);
    assert.equal(header.winner, 'JOKER');
    assert.equal((await playerRowsOf(killed.session.id)).length, 3);
    for (const uuid of [killHost, killDoc, killCit]) assert.equal((await statsOf(uuid)).total_games, 1);
    // 치료 성공군은 끝까지 아무 행도 만들지 않았다.
    assert.equal(await db.GameResult.count({ where: { id: healed.session.id } }), 0);
    for (const uuid of [healHost, healDoc, healCit]) assert.equal((await statsOf(uuid)).total_games, 0);
});

// ═════════════════════════════════════════════════════════════════════════════
// AC-05 — 자동 최종화와 수동 resolve_night가 통합돼 각각 최대 1회
// ═════════════════════════════════════════════════════════════════════════════

test('AC-05: 자동 최종화와 수동 resolve_night가 겹쳐도 사망·경기 기록·보상이 각각 최대 1회만 발생한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const host = await createLocalUser('n5h');
    const doc = await createLocalUser('n5d');
    const cit = await createLocalUser('n5c');
    const participants = [host, doc, cit];
    // 실제 최초 지급(재화·원장·소유권)이 발생하도록 ITEM 임계값을 채운다.
    await seedCompletedHistory(participants, ITEM_REWARD_WINS);

    const evaluations = captureAchievementEvaluations(t);
    const repo = captureRepositoryCalls();
    evaluations.onRestore(() => repo.restore());
    const observed = captureCommitEvents();

    const io = createFakeIo();
    const { session, jokerUuid, doctorUuid, citizenUuids } = commitNightSession({
        roomId: 'db-f25b-ac05', gameId: crypto.randomUUID(), hostUuid: host, uuids: participants,
    });
    makeSessionRewardEligible(session);
    const sockets = new Map(participants.map((uuid) => [uuid, connectSocket(io, uuid)]));
    const targetUuid = citizenUuids[0];
    const clock = createManualClock();

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 });
    submitNight(sockets.get(jokerUuid), jokerUuid, session, targetUuid);

    // 네 역할이 끝나기 전의 수동 요청은 미완료 역할을 건너뛰지 않는다.
    let earlyAck = null;
    handleResolveNight(io, sockets.get(jokerUuid), jokerUuid, { gameId: session.id }, (r) => { earlyAck = r; });
    assert.deepEqual(earlyAck, { ok: false, code: 'ACTIONS_PENDING', message: '요청을 처리할 수 없습니다.' });
    assert.deepEqual(observed.events, []);
    assert.equal(repo.calls.length, 0);

    // F-27a: 위 조기 거부는 실제 KILL 사건의 연출 대기가 아직 열려 있는 상태에서 관측한
    // 사실이다(수동 판정도 자동 진행도 대기 중에는 통과하지 않는다) — 이제 그 대기를 풀어야
    // DOCTOR 차례가 시작된다.
    drainWait(session, clock);
    submitNight(sockets.get(doctorUuid), doctorUuid, session, null);
    clock.advance(gameSessionCore.NIGHT_TURN_DURATION_MS * 2);

    assert.equal(session.phase, 'ENDED', '광대 동수로 그 밤에 종료된다');
    assert.deepEqual(session.winResult, { winner: 'JOKER' });
    assert.ok(await waitForPersistSettled(), '자동 최종화의 저장이 끝나지 않았다');
    assert.ok(await evaluations.settled(), '업적 평가가 끝나지 않았다');

    const before = {
        byUser: Object.fromEntries(await Promise.all(
            participants.map(async (uuid) => [uuid, await rewardSnapshotFor(uuid)]),
        )),
        totalGrants: await db.AchievementGrant.count(),
        totalLedger: await db.EconomyLedgerEntry.count(),
        totalEntitlements: await db.sequelize.models.EconomyEntitlement.count(),
    };
    // 0 == 0 비교가 되지 않도록 **먼저 실제 지급이 있었음**을 확인한다.
    assert.ok(before.totalGrants > 0, '보상 조건을 심었는데도 최초 지급이 하나도 없다');
    assert.ok(before.totalLedger > 0, '최초 지급인데 재화 원장 항목이 없다');
    assert.ok(before.totalEntitlements > 0, '최초 지급인데 소유권이 없다');
    for (const uuid of participants) assertItemRewardGranted(before.byUser[uuid], `${uuid} 최초 지급`);

    const repoCallsAfterAuto = repo.calls.length;
    assert.equal(repoCallsAfterAuto, 1, '자동 최종화는 저장을 한 번만 시작한다');

    // ── 같은 밤에 대한 중복 진입 세 가지 ──────────────────────────────────────
    // (a) 이미 확정된 밤에 도착한 수동 resolve_night
    let lateAck = null;
    handleResolveNight(io, sockets.get(jokerUuid), jokerUuid, { gameId: session.id }, (r) => { lateAck = r; });
    assert.equal(lateAck.ok, false, '늦은 수동 판정은 성공하지 않는다');
    // (b) 같은 판의 두 번째 종결 저장 훅
    persistTerminalSession(session, { completed: true });
    assert.ok(await waitForPersistSettled(), '중복 종결 훅의 저장이 끝나지 않았다');
    // (c) 저장소 계층의 같은 레코드 재호출(트랜잭션 멱등성 자체)
    const duplicate = await gameResultRepository.persistGameResultRecord(repo.calls[0]);
    assert.equal(duplicate.persisted, false, '이미 저장된 판의 재호출은 아무 것도 쓰지 않는다');
    assert.ok(await evaluations.settled(), '중복 진입 이후의 업적 평가가 끝나지 않았다');

    // ── 결과: 각각 최대 1회 ───────────────────────────────────────────────────
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1);
    assert.equal(observed.winEvaluations('NIGHT'), 1);
    assert.equal(observed.countOf('GAME_FINALIZED'), 1);
    assert.equal(await db.GameResult.count({ where: { id: session.id } }), 1);
    const rows = await playerRowsOf(session.id);
    assert.equal(rows.length, participants.length, '원 참가자마다 정확히 1행이다');
    assert.deepEqual(rows.map((row) => row.user_id).sort(), [...participants].sort());
    for (const uuid of participants) assert.equal((await statsOf(uuid)).total_games, 1, 'total_games는 정확히 1 증가한다');

    const after = {
        byUser: Object.fromEntries(await Promise.all(
            participants.map(async (uuid) => [uuid, await rewardSnapshotFor(uuid)]),
        )),
        totalGrants: await db.AchievementGrant.count(),
        totalLedger: await db.EconomyLedgerEntry.count(),
        totalEntitlements: await db.sequelize.models.EconomyEntitlement.count(),
    };
    assert.deepEqual(after, before, '중복 진입이 업적·원장·소유권을 다시 반영했다');
    for (const uuid of participants) assertItemRewardGranted(after.byUser[uuid], `${uuid} 중복 진입 후`);
});

test('AC-05: 밤 최종화의 첫 저장이 실패해도 재시도는 **같은 레코드**를 쓰고 그 밤의 사망·보상·경기 기록이 두 번 만들어지지 않는다', async (t) => {
    // 이 시험만이 답하는 질문: "저장 실패 뒤의 재시도가 같은 밤의 사망·보상·기록을 두 번 만드는가."
    // f21의 A-09(이탈 종결 경로)와 같은 계약을 **밤 최종화 경로**에서 다시 본다.
    if (unavailable(t)) return;
    await setUp();

    const host = await createLocalUser('n6h');
    const doc = await createLocalUser('n6d');
    const cit = await createLocalUser('n6c');
    const participants = [host, doc, cit];
    await seedCompletedHistory(participants, ITEM_REWARD_WINS);

    const evaluations = captureAchievementEvaluations(t);
    const observed = captureCommitEvents();

    // 첫 시도만 실패시킨다 — 두 번째부터는 실제 저장소가 돈다(재시도가 진짜 DB에 쓰는지를 본다).
    const originalPersist = gameResultRepository.persistGameResultRecord;
    const seen = [];
    let failNext = true;
    gameResultRepository.persistGameResultRecord = (record) => {
        seen.push(record);
        if (failNext) {
            failNext = false;
            return Promise.reject(new Error('DB 다운(주입)'));
        }
        return originalPersist(record);
    };
    evaluations.onRestore(() => { gameResultRepository.persistGameResultRecord = originalPersist; });

    // 실제 1초를 기다리지 않도록 재시도 타이머만 손으로 돌린다(판정 로직은 그대로다).
    const scheduled = [];
    gameSessionSocketLayer.__testables.__setTerminalPersistTimersForTests({
        setTimeoutFn: (fn) => { scheduled.push(fn); return scheduled.length; },
        clearTimeoutFn: () => {},
    });
    evaluations.onRestore(() => gameSessionSocketLayer.__testables.__setTerminalPersistTimersForTests());

    const io = createFakeIo();
    const { session, jokerUuid, doctorUuid, citizenUuids } = commitNightSession({
        roomId: 'db-f25b-retry', gameId: crypto.randomUUID(), hostUuid: host, uuids: participants,
    });
    makeSessionRewardEligible(session);
    const sockets = new Map(participants.map((uuid) => [uuid, connectSocket(io, uuid)]));
    const targetUuid = citizenUuids[0];
    const clock = createManualClock();

    startNightTurnSequence(io, session, { ...clock, randomFn: () => 0.5 });
    submitNight(sockets.get(jokerUuid), jokerUuid, session, targetUuid);
    drainWait(session, clock); // F-27a: 실제 KILL 사건의 대기를 풀어야 DOCTOR 차례가 시작된다.
    submitNight(sockets.get(doctorUuid), doctorUuid, session, null);
    clock.advance(gameSessionCore.NIGHT_TURN_DURATION_MS * 2);

    assert.equal(session.phase, 'ENDED', '광대 동수로 그 밤에 종료된다');
    assert.equal(session.players.get(targetUuid).alive, false);

    // 첫 시도는 실패했고 작업은 남아 있다 — 실패한 판이 아무도 다시 쓰지 않는 상태가 되면 안 된다.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(seen.length, 1, '첫 저장 시도가 있었다');
    assert.equal(__getTerminalPersistRunsForTests().length, 1, '실패한 저장 작업이 남아 있다');
    assert.equal(await db.GameResult.count({ where: { id: session.id } }), 0, '실패한 시도는 아무 것도 쓰지 않는다');
    assert.equal(evaluations.count(), 0, '저장을 확인하기 전에는 보상 평가가 시작되지 않는다');

    // 저장을 기다리는 동안 그 세션이 정리된 상황을 재현한다 — 레코드를 다시 조립한다면 여기서
    // roster·ended_at이 무너진다.
    const endedAtBefore = seen[0].result.ended_at.getTime();
    const rosterBefore = seen[0].players.map((row) => row.user_id).sort();
    session.dayIndex = 99;

    assert.equal(scheduled.length, 1, '재시도 타이머는 정확히 하나여야 한다');
    scheduled.shift()();
    assert.ok(await waitForPersistSettled(), '재시도 저장이 끝나지 않았다');
    assert.ok(await evaluations.settled(), '업적 평가가 끝나지 않았다');

    // 재시도는 문자 그대로 같은 객체를 다시 썼다 — 경기 기록은 한 번만 조립됐다.
    assert.equal(seen.length, 2);
    assert.equal(seen[1], seen[0], '재시도는 처음 조립한 바로 그 레코드 객체를 다시 쓴다');
    assert.equal(seen[1].result.ended_at.getTime(), endedAtBefore);
    assert.deepEqual(seen[1].players.map((row) => row.user_id).sort(), rosterBefore);
    assert.equal(observed.countOf('RESULT_RECORD_BUILD_STARTED'), 1, '경기 기록 조립은 재시도에도 1회뿐이다');

    // 그 밤의 사망·승패 평가·종료 확정도 각각 1회뿐이다.
    assert.equal(observed.countOf('NIGHT_DEATH_FINALIZED'), 1);
    assert.equal(observed.winEvaluations('NIGHT'), 1);
    assert.equal(observed.countOf('GAME_FINALIZED'), 1);

    // 실제 DB에도 한 벌만 커밋됐다.
    assert.equal(await db.GameResult.count({ where: { id: session.id } }), 1);
    assert.equal((await playerRowsOf(session.id)).length, participants.length);
    for (const uuid of participants) assert.equal((await statsOf(uuid)).total_games, 1, 'total_games는 정확히 1 증가한다');

    // 보상도 한 번만 반영됐다(0 == 0 비교가 되지 않도록 실제 지급이 있었음을 먼저 확인한다).
    const rewards = Object.fromEntries(await Promise.all(
        participants.map(async (uuid) => [uuid, await rewardSnapshotFor(uuid)]),
    ));
    assert.ok(await db.AchievementGrant.count() > 0, '보상 조건을 심었는데도 최초 지급이 하나도 없다');
    for (const uuid of participants) assertItemRewardGranted(rewards[uuid], `${uuid} 재시도 후`);
});
