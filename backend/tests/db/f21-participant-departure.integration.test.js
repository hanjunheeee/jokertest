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
const achievementService = require('../../services/achievementService');
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

/**
 * F-21(A-09): 주어진 동기 구간 동안 시계를 **초 경계**에 묶는다.
 *
 * game_results.ended_at은 소수초 정밀도가 없는 DATE라(0001-legacy-baseline.js ·
 * models/game/game_result.model.js) 밀리초가 남은 종료 시각은 저장 왕복에서 잘린다. 종료
 * 시각을 만드는 곳은 game-core의 finalizeGameSession 한 곳이고 그 값은 Date.now()이므로,
 * 그 동기 구간에서만 현재 시각을 **아래로 버림한 초 경계**로 고정한다. 임의의 과거/미래
 * 상수를 쓰지 않는다 — 실제 지금 시각 그대로이되 스키마가 표현할 수 있는 값이다.
 *
 * 되돌리기는 finally에 둔다. 단언이 던져도 전역 시계가 고정된 채 남지 않아야 한다.
 */
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

/**
 * 저장은 fire-and-forget이다 — 그 판의 작업이 실제로 끝날 때까지 **실제 시간**으로 기다린다.
 *
 * ── 왜 턴 수가 아니라 시간인가 (실측) ────────────────────────────────────────
 * 예전에는 setImmediate를 200번 돌렸다. 200턴은 실제 시간으로 몇 ms일 뿐이라 실제 MySQL
 * 트랜잭션보다 **먼저** 끝난다. 그래서 "저장이 끝나지 않았다"로 실패 판정을 낸 **뒤에** 로그에
 * 그 판의 INSERT와 COMMIT이 이어졌다 — 기능이 고장난 것이 아니라 대기가 짧았다
 * (docs/requirements/2026-09-18-f21-persist-wait-finding.md). 저장 경로
 * (attemptTerminalPersist)는 run 객체에 pending Promise를 노출하지 않으므로, 시험이 붙잡을 수
 * 있는 유일한 신호는 terminalPersistRuns가 비는 것이고 그 대기는 시간으로 재야 한다.
 *
 * false는 "기한 안에 실제로 끝나지 않았다"이며 그때의 실패 판정은 옳다 — 재시도 지연
 * (1s·5s·30s)이 걸린 실패 저장은 기한 안에 끝나지 않을 수 있고, 그것이야말로 시험이 잡아야 할
 * 사실이다. 기한을 넉넉히 두는 것과 통과를 꾸미는 것은 다르다.
 *
 * ── 이 대기가 **보장하지 않는 것** ───────────────────────────────────────────
 * finishTerminalPersist(backend/socket/gameSession.js)는 pending 항목을 **먼저** 지우고, 그
 * 다음에 업적 평가를 fire-and-forget으로 던진다. 그러므로 이 함수가 true를 돌려준 시점에
 * 업적·재화·소유권 트랜잭션은 아직 진행 중일 수 있다 — 그 세 축을 읽거나 스키마를 다시
 * 만드는 쪽은 반드시 captureAchievementEvaluations().settled()를 함께 기다려야 한다.
 */
async function waitForPersistSettled({ timeoutMs = 15_000, stepMs = 10 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (__getTerminalPersistRunsForTests().length === 0) {
            // 커밋 확인 직후의 동기 후속(개인 무효화·평가 호출 등록)까지 한 번 비운다.
            await new Promise((resolve) => setImmediate(resolve));
            return true;
        }
        if (Date.now() >= deadline) return false;
        await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
}

/**
 * F-21(A-05): 업적 평가의 **실제 완료**를 기다리고, 이 시험이 설치한 대역의 되돌리기를 한
 * 곳에 모은다.
 *
 * 평가 대기가 필요한 이유 — 예전에는 setImmediate를 고정 50번 돌렸다. 그것은 "충분히
 * 기다렸겠지"이지 완료가 아니다: 실제 DB의 업적·재화 트랜잭션이 아직 커밋되지 않았는데 표본을
 * 뜨면 "지급이 한 번뿐이다"가 우연히 참이 된다(0회여도 참이다). 소켓 계층이 fire-and-forget
 * 으로 던지는 그 Promise를 직접 붙잡아 기다린다.
 *
 * ── teardown이 **하나**여야 하는 이유 ────────────────────────────────────────
 * 본문 중간의 단언이 실패하면 그 뒤에 적어 둔 대기·정리는 실행되지 않는다. 그런데 저장과 업적
 * 평가는 fire-and-forget이라 **실패한 시험이 끝난 뒤에도 계속 돈다** — 그 상태로 대역을
 * 되돌리고 다음 시험의 setUp()이 관리 스키마를 DROP·재생성하면 아직 도는 트랜잭션과 겹친다
 * (retry9 실측: A-09가 ended_at 단언에서 끊겨 맨 끝의 평가 대기에 도달하지 못했다).
 *
 * 그래서 t.after는 이 함수가 **한 번만** 등록하고, 그 안에서 순서를 명시적으로 강제한다:
 *   (0) 시험이 붙잡고 있던 재시도 타이머를 풀어 진행 중인 저장이 실제로 끝날 수 있게 하고
 *   (1) 저장 작업이 비고 → (2) 그 뒤에 시작된 업적 평가가 끝난 다음에야
 *   (3) 대역을 등록 역순으로 되돌린다.
 * 되돌리기 하나가 던져도 나머지는 계속 진행한다. 기한 안에 비지 않으면 그 사실을 남기되
 * 정리 자체를 막지는 않는다 — 정리를 건너뛰면 다음 시험이 더 크게 깨진다.
 */
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
        // 평가가 또 다른 평가를 만들 수 있으므로, 길이가 더 늘지 않을 때까지 비운다.
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
        /** 이 시험이 설치한 다른 대역도 같은 경계에서(등록 역순으로) 되돌린다. */
        onRestore(restore) { restores.push(restore); },
        /**
         * 대기 **전에** 실행할 정리. 시험이 재시도 타이머를 손으로 붙잡고 있으면 저장 작업은
         * 스스로 끝날 수 없으므로, 기다리기 전에 그 손잡이를 풀어 준다.
         */
        onDrain(drain) { drains.push(drain); },
    };
}

/**
 * F-21(A-05): 이 판이 **보상 대상**이 되도록 조건을 결정적으로 맞춘다.
 *
 * roleStatisticsPolicy.isAchievementRewardEligibleGame에 따라, 그 판의 gameSource가
 * 'development'가 아니어야 한다. 시험 프로세스는 NODE_ENV가 production이 아니라 기본값이
 * development이고, 그러면 **어떤 지급도 일어나지 않는다** — 0 == 0으로 통과하던 예전 비교가
 * 아무것도 증명하지 못한 이유가 정확히 이것이다.
 */
function makeSessionRewardEligible(session) {
    session.gameSource = 'production';
}

/**
 * F-21(A-05): **소유권(ITEM)까지** 실제로 지급되는 준비 데이터의 근거.
 *
 * backend/services/achievementDefinitions.js에서 ITEM 보상은 **직업 30승 단계 하나뿐**이다
 * (`<job>-win-30` → `profile-border-<한글이름>`, type ITEM/PROFILE_BORDER). 기록 업적 7종과
 * 직업 10승·20승은 전부 CURRENCY다. 그래서 완료 3판짜리 record-1-masquerade만 채우면 재화와
 * 원장은 늘어도 economy_entitlements에는 아무 행도 생기지 않는다 — retry9에서 "업적을
 * 지급했는데 소유권이 없다"가 실패한 이유가 정확히 이것이며, 그것은 제품 결함이 아니라
 * 준비 데이터가 실제 보상 계약과 어긋난 것이었다.
 *
 * 그래서 소유권 단언을 지우거나 0 == 0으로 낮추는 대신, **실제 임계값을 채운다**:
 * 참가자 전원에게 CITIZEN 승리 30판을 미리 심어 noble-win-30이 성립하게 한다
 * (backend/tests/db/f12-achievements.integration.test.js가 같은 조건으로 같은 소유권 행을
 * 확인한다). 제품의 보상 정책은 한 줄도 바꾸지 않는다.
 *
 * 30승은 그 아래 단계와 기록 업적들(noble-win-10/20 · record-1/3/4/5/6/7)도 함께 성립시킨다 —
 * 그래서 재화·원장·소유권 세 축이 모두 양수가 되고, 두 경로(추방/일반 이탈)의 비교가 실제
 * 지급 위에서 이뤄진다.
 */
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
    // 심는 행은 game_results/game_result_players뿐이다 — user_stats는 건드리지 않는다.
    // 그래야 아래 "이 판이 실제로 집계돼야 한다(total_games === 1)"가 그대로 성립한다.
    await db.GameResult.bulkCreate(results);
    await db.GameResultPlayer.bulkCreate(players);
}

/** 보상 3축의 계정별 현재 상태(총량이 아니라 **계정별**이어야 두 판을 비교할 수 있다). */
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
        // 개수만 보면 "무엇이 지급됐는지"를 알 수 없다 — 실제 ITEM 보상의 item_id까지 남긴다.
        entitlementItems: entitlementRows.map((row) => row.item_id).sort(),
    };
}

/**
 * 계정 하나의 소유권이 **실제 ITEM 업적으로** 생겼고, 중복 지급이 없음을 확인한다.
 * (중복 미지급의 근거는 economy_entitlements의 유일 제약과 achievement_grants 게이트다 —
 * 여기서는 그 결과가 실제 DB 행에서 정확히 한 번임을 본다.)
 */
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

// ═════════════════════════════════════════════════════════════════════════════
// AC-03 — 추방과 일반 이탈의 최종 전적은 DB에서도 같다
// ═════════════════════════════════════════════════════════════════════════════

test('AC-03: 추방으로 끝난 판과 일반 이탈로 끝난 판은 식별자를 빼면 전적·통계·업적·원장·소유권이 정확히 같다', async (t) => {
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

    // A-05: 두 판 모두 **실제로 보상이 발생하는** 조건에 둔다. 그러지 않으면 아래 업적·원장·
    // 소유권 비교가 전부 0 == 0으로 통과해 아무것도 증명하지 못한다. 재화뿐 아니라 **소유권
    // (ITEM)까지** 실제로 생기도록 직업 30승 임계값을 채운다(ITEM_REWARD_WINS 주석 참고).
    await seedCompletedHistory([kickHost, kickStay, kickGone], ITEM_REWARD_WINS);
    await seedCompletedHistory([leaveHost, leaveStay, leaveGone], ITEM_REWARD_WINS);

    const evaluations = captureAchievementEvaluations(t);
    const io = createFakeIo();

    const kicked = commitTerminalReadySession({
        roomId: 'db-room-kick', gameId: crypto.randomUUID(),
        hostUuid: kickHost, uuids: [kickHost, kickStay, kickGone],
    });
    makeSessionRewardEligible(kicked);
    handleKickGamePlayer(io, createFakeSocket(kickHost), kickHost, kickPayload(kicked, kickHost, kickGone), () => {});
    assert.equal(kicked.phase, 'ENDED', '3인 판에서 한 명이 빠지면 parity로 종결돼야 한다');
    assert.ok(await waitForPersistSettled(), '추방 판의 저장이 끝나지 않았다');

    const left = commitTerminalReadySession({
        roomId: 'db-room-leave', gameId: crypto.randomUUID(),
        hostUuid: leaveHost, uuids: [leaveHost, leaveStay, leaveGone],
    });
    makeSessionRewardEligible(left);
    handleLeaveGameSession(io, createFakeSocket(leaveGone), leaveGone, { gameId: left.id }, () => {});
    assert.equal(left.phase, 'ENDED');
    assert.ok(await waitForPersistSettled(), '이탈 판의 저장이 끝나지 않았다');
    assert.ok(await evaluations.settled(), '업적 평가가 끝나지 않았다');

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

    // ── 업적·원장·소유권 ─────────────────────────────────────────────────────
    //
    // 여기가 이 시험의 핵심이다. 두 경로가 "같다"를 0 == 0으로 주장하지 않도록, **먼저
    // 실제로 지급이 있었음**을 확인한 뒤에 같음을 확인한다.
    for (const [a, b] of [[kickHost, leaveHost], [kickStay, leaveStay], [kickGone, leaveGone]]) {
        const rewardA = await rewardSnapshotFor(a);
        const rewardB = await rewardSnapshotFor(b);
        assert.ok(
            rewardA.grants.length > 0,
            '보상 조건을 심었는데도 업적 지급이 하나도 없다 — 이 비교는 아무것도 증명하지 못한다',
        );
        assert.ok(rewardA.ledger > 0, '업적을 지급했는데 재화 원장 항목이 없다');
        assert.ok(rewardA.entitlements > 0, '업적을 지급했는데 소유권이 없다');
        // 소유권이 "몇 개든 있다"가 아니라 **실제 ITEM 업적의 그 행**이고 중복이 없음을 본다.
        assertItemRewardGranted(rewardA, '추방 판');
        assertItemRewardGranted(rewardB, '일반 이탈 판');
        assert.deepEqual(rewardA, rewardB, '추방과 일반 이탈의 보상 결과가 달라졌다');
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

    // 이 판도 커밋이 확인되면 업적 평가를 fire-and-forget으로 던진다. 그 평가는 실제 격리 DB에
    // 질의·기록하는데, 저장 대기(waitForPersistSettled)는 그 완료를 **보장하지 않는다** —
    // pending 항목이 먼저 지워지고 평가가 그 뒤에 시작하기 때문이다. 붙잡지 않으면 이 시험이
    // 끝난 뒤에도 남아, 다음 시험의 setUp()이 관리 스키마를 드롭·재생성하는 도중에 돈다.
    //
    // 대역 설치보다 **먼저** 잡는다 — 이 객체가 이 시험의 유일한 teardown 경계이고, 아래
    // 대역들도 같은 경계에 등록해야 "저장·평가가 끝난 뒤에 되돌린다" 순서가 보장된다.
    // 본문 중간의 단언이 실패해도 그 순서는 그대로 지켜진다.
    const evaluations = captureAchievementEvaluations(t);

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
    evaluations.onRestore(() => { gameResultRepository.persistGameResultRecord = original; });

    // 실제 1초를 기다리지 않도록 재시도 타이머만 수동으로 돌린다(판정 로직은 그대로다).
    const scheduled = [];
    gameSessionSocketLayer.__testables.__setTerminalPersistTimersForTests({
        setTimeoutFn: (fn) => { scheduled.push(fn); return scheduled.length; },
        clearTimeoutFn: () => {},
    });
    evaluations.onRestore(() => gameSessionSocketLayer.__testables.__setTerminalPersistTimersForTests());
    // 재시도 타이머를 손으로 붙잡고 있으므로, 이 시험이 중간에 끊기면 저장 작업은 스스로 끝날
    // 수 없다. 정리 경계에서 먼저 손잡이를 풀어 실제 저장이 마무리되게 한다(그 뒤에야 대역을
    // 되돌린다). 정상 경로에서는 이미 비어 있어 아무 일도 하지 않는다.
    // 상한을 둔다 — 재시도가 또 실패하면 새 콜백이 쌓이므로, 한 라운드에서 무한히 돌지 않게
    // 하고 다음 라운드로 넘긴다(라운드 자체도 유한하다).
    evaluations.onDrain(() => {
        for (let fired = 0; fired < 8 && scheduled.length > 0; fired += 1) scheduled.shift()();
    });

    const io = createFakeIo();
    const session = commitTerminalReadySession({
        roomId: 'db-room-retry', gameId: crypto.randomUUID(), hostUuid: host, uuids: [host, stay, gone],
    });
    // F-21(A-09): game_results.ended_at은 **소수초 정밀도가 없는** DATE다
    // (db/migrations/0001-legacy-baseline.js · models/game/game_result.model.js). 종료 시각에
    // 밀리초가 남아 있으면 저장·조회 왕복에서 그 자리가 잘려, "같은 레코드가 그대로 커밋됐다"를
    // 밀리초까지 비교하는 순간 스키마가 표현할 수 없는 값을 요구하게 된다(retry9 실측:
    // 실제 ...438000 / 기대 ...438915). 제품 스키마를 바꾸는 대신 **fixture의 종료 시각을
    // 스키마가 정확히 표현할 수 있는 초 경계로 고정**한다 — finalizeGameSession이 종결 순간
    // Date.now()로 endedAt을 찍으므로, 그 동기 구간에서만 시계를 초 경계에 묶는다. 불변성
    // 단언(같은 record 객체·같은 ended_at·roster·통계)은 하나도 낮추지 않는다.
    withClockOnSecondBoundary(() => {
        handleKickGamePlayer(io, createFakeSocket(host), host, kickPayload(session, host, gone), () => {});
    });
    assert.equal(session.phase, 'ENDED');
    assert.equal(
        session.endedAt % 1_000, 0,
        '종료 시각 fixture가 초 경계가 아니다 — DATE(소수초 없음)와 밀리초 비교가 다시 어긋난다',
    );

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

    // 시험 경계: 커밋 확인 뒤에 시작된 업적 평가가 **실제로** 끝난 것을 확인하고 나간다.
    // 재시도로 커밋된 판도 원 참가자 전원의 평가를 한 번 돌린다(finishTerminalPersist).
    assert.ok(evaluations.count() > 0, '커밋을 확인했으면 원 참가자들의 업적 평가가 시작돼야 한다');
    assert.ok(await evaluations.settled(), '업적 평가가 끝나지 않은 채 시험을 끝내면 다음 시험의 스키마 재생성과 겹친다');
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
    const participants = [host, stay, gone];

    // 이 판이 **실제로 지급을 만드는** 조건에 둔다. 이것이 없으면 아래 "다시 반영하지 않았다"가
    // 0 == 0으로 통과한다. 재화만으로는 소유권(ITEM) 축이 여전히 0이므로, 실제 ITEM 임계값인
    // 직업 30승을 채워 소유권도 양수에서 시작하게 한다(ITEM_REWARD_WINS 주석 참고).
    await seedCompletedHistory(participants, ITEM_REWARD_WINS);

    const evaluations = captureAchievementEvaluations(t);
    const io = createFakeIo();
    const session = commitTerminalReadySession({
        roomId: 'db-room-ach', gameId: crypto.randomUUID(), hostUuid: host, uuids: participants,
    });
    makeSessionRewardEligible(session);
    handleKickGamePlayer(io, createFakeSocket(host), host, kickPayload(session, host, gone), () => {});
    assert.ok(await waitForPersistSettled(), '저장이 끝나지 않았다');
    // 고정 턴 수로 "충분히 기다렸겠지"를 하지 않는다 — 평가 Promise가 **실제로 끝날** 때까지다.
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

    // 먼저 **지급이 실제로 일어났는지**를 확인한다. 0회 지급 상태에서 "중복되지 않았다"는
    // 어떤 멱등성도 증명하지 않는다.
    assert.ok(before.totalGrants > 0, '보상 조건을 심었는데도 최초 지급이 하나도 없다');
    assert.ok(before.totalLedger > 0, '최초 지급인데 재화 원장 항목이 없다');
    assert.ok(before.totalEntitlements > 0, '최초 지급인데 소유권이 없다');
    for (const uuid of participants) {
        assert.ok(before.byUser[uuid].grants.length > 0, `${uuid}에게 지급이 하나도 없다`);
        // 소유권이 **실제 ITEM 업적의 그 행**이고, 최초 지급 시점부터 이미 중복이 없다.
        assertItemRewardGranted(before.byUser[uuid], `${uuid} 최초 지급`);
    }

    // 같은 판의 종결 훅이 다시 밟히면 저장은 "이미 저장됨"으로 확인되고, 업적 평가가 한 번
    // 더 돈다 — 그 재평가가 이미 지급한 것을 다시 지급하면 안 된다(유일 제약이 근거다).
    gameSessionSocketLayer.__testables.persistTerminalSession(session, { completed: true });
    assert.ok(await waitForPersistSettled(), '중복 종료 훅의 저장이 끝나지 않았다');
    assert.ok(await evaluations.settled(), '중복 종료의 업적 평가가 끝나지 않았다');

    const after = await snapshot();
    assert.deepEqual(after, before, '중복 종료가 업적·원장·소유권을 다시 반영했다');
    // 재평가 이후에도 소유권은 계정별로 정확히 1행이다(중복 지급이 없다).
    for (const uuid of participants) assertItemRewardGranted(after.byUser[uuid], `${uuid} 재평가 후`);
    assert.equal(await db.GameResult.count({ where: { id: session.id } }), 1);
    assert.equal((await playerRowsOf(session.id)).length, 3);
    for (const uuid of participants) assert.equal((await statsOf(uuid)).total_games, 1);

    // 두 번째 종결 훅이 **평가 자체를 다시 돌리지 않았다면** 그것도 계약대로다(A-09: 확인은
    // 판당 한 번). 어느 쪽이든 지급 결과는 위에서 이미 불변임을 확인했다.
    assert.ok(
        evaluations.count() >= evaluationsAfterFirst,
        '평가 호출 수가 줄어드는 것은 계측 오류다',
    );
});
