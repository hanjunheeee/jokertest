'use strict';

// F-17 알림 저장·API·소켓 생산 — 실제 격리 MySQL DB에서 AC-01~AC-07과 A-01~A-05를
// 검증한다. 라우터 → verifyToken → 컨트롤러 → notificationService → 실제 저장소까지 전부
// 실제 코드로 태운다. fake db로는 증명할 수 없는 것들이 여기 있다:
//   - (user_id, source_key) 유일 제약이 진짜 동시 저장을 하나로 묶는가(AC-03/A-01)
//   - 알림 삽입 실패가 친구 요청 원본·업적 보상까지 같은 트랜잭션으로 롤백하는가(A-02)
//   - 다른 계정의 알림 id로 PATCH해도 어떤 행도 바뀌지 않는가(A-05)
//
// backend/tests/helpers/isolatedTestDb.js의 관리 목록·대상 DB 확인 원칙을 따른다.
// F01_TEST_DATABASE_URL이 없으면 각 테스트는 실패로 표시하지 않고 명시적으로 skip한다
// (f01~f14와 같은 관례 — skip은 통과가 아니라 **미검증**이다).

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f17-notifications-test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
const express = require('express');
const cookieParser = require('cookie-parser');

const { Sequelize } = require('sequelize');
const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const addEconomy = require('../../db/migrations/0006-add-economy');
const addEconomyPurchaseRequests = require('../../db/migrations/0007-add-economy-purchase-requests');
const addVoteParticipations = require('../../db/migrations/0008-add-vote-participations');
const addAchievementGrants = require('../../db/migrations/0009-add-achievement-grants');
const addNotifications = require('../../db/migrations/0012-add-notifications');
const {
    buildManagedSchema, resetManagedSchema, resetManagedData, findNonEmptyManagedTables,
} = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests,
    addVoteParticipations, addAchievementGrants, addNotifications, migrationRunner,
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

/** 이력(schema_migrations)을 뺀 데이터 테이블. dropOrder의 "자식 → 부모" 순서를 그대로 쓴다. */
const DATA_TABLES = DROP_ORDER.filter((table) => table !== migrationRunner.META_TABLE);

const db = require('../../models');
const friendService = require('../../service/friend.service');
const notificationService = require('../../service/notification.service');
const achievementService = require('../../services/achievementService');
const gameResultRepository = require('../../repositories/gameResult.repositories');
const socket = require('../../socket/socket');
const { hashPassword } = require('../../utils/hash');
const { generateToken } = require('../../utils/jwt');
const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

// ---------------------------------------------------------------------------
// 고정 장비 — 스키마 재구축과 데이터 격리를 분리한다
// ---------------------------------------------------------------------------
//
// ── 실측 ────────────────────────────────────────────────────────────────────
// 이전 판은 27 케이스 전부가 setUp에서 관리 스키마를 통째로 드롭하고 마이그레이션 13개를
// 처음부터 다시 적용했다. 공식 전체 실행 실측
// (.pluto/monitor/backend-full-2026-09-13T11-44-26.009Z.log): 이 파일 27건이 전부 완주하며
// 187583.6408ms(약 3.13분)를 썼고, 느린 것들은 DDL 케이스가 아니라 **서비스 의미**만 보는
// 케이스였다 — 자기 계정 목록 조회 10369ms, PATCH read_at 10005ms, 다른 계정 원본 키 9404ms.
// 본문이 무거운 것이 아니라 같은 setUp이 반복 드롭/CREATE로 비싸진 것이다.
//
// ── 그래서 두 가지 setUp을 둔다 (F-19 스위트에서 이미 검증된 형태) ───────────
//   setUpFreshSchema(t) — 0012의 up/verify·인덱스·외래 키를 직접 만지는 케이스. 스키마 계약
//                         자체가 대상이라 매번 전체 드롭 + 전체 이관을 그대로 한다.
//   setUp(t)            — 일반 서비스·API·소켓 케이스. 이미 완전히 이관된 스키마 위에서
//                         데이터만 비운다.
//
// 일반 케이스는 스키마를 **신뢰하지 않는다**. 매번 (1) 승인된 전용 DB인지 (2) 관리 목록 밖
// 테이블이 없는지 (3) 관리 테이블이 전부 존재하는지를 확인하고(resetManagedData가 셋 다
// 담당한다), 그 위에 (4) 남은 행이 한 건도 없는지 (5) 0012의 컬럼·인덱스·외래 키 계약이
// 그대로인지를 직접 단정한다. FOREIGN_KEY_CHECKS는 끄지 않는다 — 자식 → 부모 순서의 DELETE는
// 제약을 그대로 지킨다. 스키마를 만지는 케이스는 자기 뒤를 'dirty'로 표시하므로 다음 일반
// 케이스가 그 흔적을 물려받지 않고 스스로 전체 재구축으로 되돌아간다.

/** 'unknown' = 아직 안 세움 · 'migrated' = 완전히 이관됨 · 'dirty' = DDL 케이스가 지나갔음 */
let schemaState = 'unknown';

/** setUp이 실제로 쓴 시간. 추측이 아니라 측정으로 보고하기 위한 장치다. */
const fixtureCost = { rebuilds: 0, cleans: 0, schemaMs: 0, dataMs: 0 };

/**
 * 케이스가 바꿀 수 있는 **가변 의존성**을 전부 원래대로 돌린다.
 *
 * 스키마를 공유하게 되면서 이 초기화의 중요도가 올라갔다: 예전에는 매 케이스가 DB를 통째로
 * 다시 만들었지만, 이제는 앞 케이스가 남긴 모듈 수준 대역(db.Notification 교체, 서비스 deps,
 * onlineUsers 항목)이 그대로 살아 있으면 다음 케이스의 단정이 조용히 의미를 잃는다.
 */
const REAL_NOTIFICATION_MODEL = db.Notification;

const resetRuntimeFixtures = () => {
    db.Notification = REAL_NOTIFICATION_MODEL;
    notificationService.__internal.__setDepsForTests(null);
    achievementService.__internal.__setDepsForTests(null);
    socket.__getOnlineUsersForTests().clear();
};

/** 관리 스키마를 통째로 드롭하고 마이그레이션 전부를 처음부터 적용한다. */
const rebuildSchema = async () => {
    const startedAt = performance.now();
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    fixtureCost.rebuilds += 1;
    fixtureCost.schemaMs += performance.now() - startedAt;
    schemaState = 'migrated';
};

/** 케이스별 setUp/본문 소요와 어떤 setUp을 썼는지를 TAP 진단으로 남긴다. */
const beginCase = (t, mode, setupMs) => {
    const startedAt = performance.now();
    t.after(() => {
        t.diagnostic(
            `[f17-fixture] mode=${mode} setup=${setupMs.toFixed(1)}ms body=${(performance.now() - startedAt).toFixed(1)}ms`,
        );
    });
};

/** 0012의 DDL·인덱스·외래 키를 직접 만지는 케이스 전용. 전체 재구축하고, 뒤를 dirty로 남긴다. */
const setUpFreshSchema = async (t) => {
    const startedAt = performance.now();
    await rebuildSchema();
    // 이 케이스는 removeIndex/addIndex/removeConstraint로 스키마를 직접 바꾼다.
    schemaState = 'dirty';
    resetRuntimeFixtures();
    beginCase(t, 'fresh-schema', performance.now() - startedAt);
};

/** 일반 서비스·API·소켓 케이스. 이미 이관된 스키마 위에서 데이터만 비우고 격리를 실제로 확인한다. */
const setUp = async (t) => {
    const startedAt = performance.now();
    let mode = 'clean-data';

    if (schemaState !== 'migrated') {
        await rebuildSchema();
        mode = 'rebuilt';
    } else {
        const cleanStartedAt = performance.now();
        const result = await resetManagedData(sequelize, TEST_DB_URL, {
            managedTables: MANAGED_TABLES,
            dropOrder: DROP_ORDER,
            // 이력 행은 남긴다 — 지우면 다음 applyMigrations가 이미 있는 테이블에 다시
            // 이관을 시도하게 된다.
            keepTables: [migrationRunner.META_TABLE],
        });
        if (!result.cleaned) {
            await rebuildSchema();
            mode = `rebuilt-missing:${result.missingTables.join(',')}`;
        } else {
            fixtureCost.cleans += 1;
            fixtureCost.dataMs += performance.now() - cleanStartedAt;
        }
    }

    // 격리 확인 1 — 앞 케이스의 행이 한 건도 넘어오지 않았다. 넘어왔다면 이 케이스의
    // "행이 하나뿐이다" 류 단정은 전부 의미를 잃으므로 통과시키지 않는다.
    assert.deepEqual(
        await findNonEmptyManagedTables(sequelize, DATA_TABLES), [],
        '앞 케이스의 행이 남아 있으면 이 케이스의 단정은 의미가 없다',
    );

    // 격리 확인 2 — 공유하는 스키마가 0012의 컬럼·유일 인덱스·외래 키 계약을 그대로 만족한다.
    // 인덱스를 떼거나 FK를 지우는 케이스가 남긴 흔적 위에서 서비스 단정을 하지 않기 위한
    // fail-closed다(그런 케이스는 fresh-schema로 표시돼 여기 오기 전에 재구축된다).
    await addNotifications.verify(sequelize.getQueryInterface());

    resetRuntimeFixtures();
    beginCase(t, mode, performance.now() - startedAt);
};

test.after(() => {
    if (!TEST_DB_URL) return;
    console.log(
        `# [f17-fixture] 전체 재구축 ${fixtureCost.rebuilds}회 ${fixtureCost.schemaMs.toFixed(0)}ms · `
        + `데이터 격리 ${fixtureCost.cleans}회 ${fixtureCost.dataMs.toFixed(0)}ms`,
    );
});

test.afterEach(() => {
    resetRuntimeFixtures();
});

/**
 * 실제 production hashPassword로 **프로세스당 한 번만** 만든 bcrypt 해시를 공유한다.
 *
 * 강도를 낮추지 않는다 — 같은 함수·같은 cost·같은 값이고, 계정마다 똑같은 평문을 다시
 * 해싱하던 중복 계산만 없앤다. 이 스위트의 어떤 단정도 비밀번호 검증을 지나지 않는다
 * (접근 토큰은 generateToken이 직접 만들고, 세션 가드는 user_sessions만 읽는다).
 * 로그인 경로를 검증하는 스위트는 계속 자기 해시를 직접 만들어야 한다.
 */
let sharedPasswordHash = null;
const testPasswordHash = async () => {
    if (sharedPasswordHash === null) sharedPasswordHash = await hashPassword('correct-horse-battery-1');
    return sharedPasswordHash;
};

const createLocalUser = async (label) => {
    const uuid = crypto.randomUUID();
    const nickname = `${label}${uuid.slice(0, Math.max(1, 8 - label.length))}`.slice(0, 8);
    await db.User.create({
        uuid,
        password_hash: await testPasswordHash(),
        nickname,
        email: `${label}-${uuid}@example.com`,
    });
    await db.UserStats.create({ user_id: uuid });
    await db.UserSession.create({ id: `session-${uuid}`, user_id: uuid, is_online: true });
    return uuid;
};

const startRouteServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/notifications', require('../../routes/notification.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const tokenFor = (uuid) => generateToken({ uuid, role: 'USER', sessionId: `session-${uuid}` });
const authGet = (base, uuid, path = '/notifications') =>
    fetch(`${base}${path}`, { headers: { cookie: `accessToken=${tokenFor(uuid)}` } });
const authPatch = (base, uuid, id) =>
    fetch(`${base}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { cookie: `accessToken=${tokenFor(uuid)}`, 'Content-Type': 'application/json' },
        body: '{}',
    });

// ---------------------------------------------------------------------------
// AC-01 · A-02: 실제 원본 사건 → 알림 행
// ---------------------------------------------------------------------------

test('AC-01/A-02: 친구 요청 한 번이 원본 행 1 + 수신자 알림 1을 만들고, 보낸 쪽에는 알림이 생기지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('a');
    const b = await createLocalUser('b');

    const emitted = [];
    notificationService.__internal.__setDepsForTests({
        emitToUser: (uuid, event, payload) => emitted.push({ uuid, event, payload }),
    });

    const created = await friendService.sendFriendRequest(a, b);

    assert.equal(await db.FriendRequest.count({ where: { requester_id: a, receiver_id: b } }), 1);
    assert.equal(await db.Notification.count({ where: { user_id: b } }), 1);
    assert.equal(await db.Notification.count({ where: { user_id: a } }), 0, '보낸 쪽에는 알림이 생기지 않는다');

    const row = await db.Notification.findOne({ where: { user_id: b }, raw: true });
    assert.equal(row.type, 'friend-request');
    assert.equal(row.source_key, `friend-request:${created.id}:received`);
    assert.equal(row.read_at, null);
    assert.deepEqual(row.target, { kind: 'friend-request', requestId: created.id });

    // 커밋 후 그 계정에게만 전달된다. 친구 알림에는 sfxEvent를 싣지 않는다(소리는 기존
    // friend_request_received가 소유한다 — 한 사건에 두 번 나면 안 된다).
    const delivery = emitted.find((e) => e.event === 'notification_created');
    assert.ok(delivery, 'notification_created가 전달돼야 한다');
    assert.equal(delivery.uuid, b);
    assert.equal(delivery.payload.sfxEvent, undefined);
    assert.equal(delivery.payload.notification.id, row.id);
});

test('A-02: 알림 저장이 실패하면 친구 요청 원본 행도 함께 롤백된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('a2');
    const b = await createLocalUser('b2');

    // 실제 코드 경로는 그대로 두고, 알림 삽입만 실패시킨다.
    const realNotification = db.Notification;
    db.Notification = {
        async findOrCreate() { throw new Error('simulated notification insert failure'); },
        async findOne() { return null; },
    };
    t.after(() => { db.Notification = realNotification; });

    await assert.rejects(() => friendService.sendFriendRequest(a, b), /simulated notification insert failure/);

    db.Notification = realNotification;
    assert.equal(
        await db.FriendRequest.count({ where: { requester_id: a, receiver_id: b } }),
        0,
        '알림만 없는 친구 요청이 남으면 안 된다',
    );
    assert.equal(await db.Notification.count({ where: { user_id: b } }), 0);
});

test('A-02: 소켓 전달이 던져도 이미 커밋된 친구 요청과 알림은 그대로 남고 호출자는 성공한다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('a3');
    const b = await createLocalUser('b3');

    notificationService.__internal.__setDepsForTests({
        emitToUser: () => { throw new Error('socket exploded'); },
    });

    const created = await friendService.sendFriendRequest(a, b);
    assert.ok(created.id);
    assert.equal(await db.FriendRequest.count({ where: { requester_id: a, receiver_id: b } }), 1);
    assert.equal(await db.Notification.count({ where: { user_id: b } }), 1);

    // 전달을 놓쳐도 GET이 무음으로 복원한다.
    const base = await startRouteServer(t);
    const body = await (await authGet(base, b)).json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].sourceKey, `friend-request:${created.id}:received`);
});

test('AC-01/A-02: 신규 업적 지급은 grant·보상 원장과 같은 트랜잭션에서 알림 1을 남긴다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('ach');
    // 실제 확정 경기 3판 → record-1-masquerade 조건 충족.
    for (let i = 0; i < 3; i += 1) {
        const gameId = crypto.randomUUID();
        const players = new Map([[userId, {
            uuid: userId, nickname: `n-${userId.slice(0, 6)}`, role: 'CITIZEN', team: 'CITIZEN',
            alive: true, deathReason: null,
        }]]);
        const result = await gameResultRepository.persistGameResult({
            id: gameId, roomId: crypto.randomUUID(), phase: 'ENDED', dayIndex: 2, jokerCount: 1,
            roleComposition: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 1 },
            timerSettings: { dayDiscussionTime: 90, dayVoteTime: null, nightActionTime: null, roleNightActionTimes: {} },
            startedAt: Date.now() - 60_000, endedAt: Date.now(), winResult: { winner: 'CITIZEN' },
            gameSource: 'production', players,
        }, { completed: true });
        assert.equal(result.persisted, true);
    }

    await achievementService.evaluateAndGrantForUser(userId);

    const grantCount = await db.AchievementGrant.count({ where: { user_id: userId, achievement_id: 'record-1-masquerade' } });
    assert.equal(grantCount, 1);

    const row = await db.Notification.findOne({
        where: { user_id: userId, source_key: 'achievement:record-1-masquerade:granted' }, raw: true,
    });
    assert.ok(row, '지급과 같은 트랜잭션에서 알림이 확정돼야 한다');
    assert.equal(row.type, 'achievement');
    assert.deepEqual(row.target, { kind: 'achievement', achievementId: 'record-1-masquerade' });

    // 재평가해도 지급·알림이 늘지 않는다(AC-03).
    await achievementService.evaluateAndGrantForUser(userId);
    assert.equal(await db.AchievementGrant.count({ where: { user_id: userId, achievement_id: 'record-1-masquerade' } }), 1);
    assert.equal(await db.Notification.count({ where: { user_id: userId, source_key: 'achievement:record-1-masquerade:granted' } }), 1);
});

// ---------------------------------------------------------------------------
// AC-03 · A-01: 중복
// ---------------------------------------------------------------------------

test('AC-03/A-01: 같은 계정·같은 원본 키를 동시에 저장해도 실제 유일 제약이 행 하나로 묶는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('dup');
    const payload = {
        userId, type: 'system', sourceKey: 'system:notifications-available:v1',
        title: '알림 기능 안내', body: '본문', target: { kind: 'settings' },
    };

    const results = await Promise.all([
        db.sequelize.transaction((transaction) => notificationService.createNotification(payload, { transaction })),
        db.sequelize.transaction((transaction) => notificationService.createNotification(payload, { transaction })),
        db.sequelize.transaction((transaction) => notificationService.createNotification(payload, { transaction })),
    ]);

    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 1);
    assert.equal(results.filter((r) => r.created).length, 1, '정확히 한 호출만 created:true여야 한다');
});

test('A-01: 다른 계정의 같은 시스템 원본 키는 서로 충돌하지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('s1');
    const b = await createLocalUser('s2');

    const first = await notificationService.ensureSystemWelcome(a);
    const second = await notificationService.ensureSystemWelcome(b);

    assert.equal(first.created, true);
    assert.equal(second.created, true, '다른 계정이 같은 source_key로 막히면 안 된다');
    assert.equal(await db.Notification.count({ where: { source_key: 'system:notifications-available:v1' } }), 2);
});

test('AC-03: ensureSystemWelcome을 동시에·반복 호출해도 행 1 · 발행 1이다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('sys');
    const emitted = [];
    notificationService.__internal.__setDepsForTests({
        emitToUser: (uuid, event, payload) => emitted.push({ uuid, event, payload }),
    });

    await Promise.all([
        notificationService.ensureSystemWelcome(userId),
        notificationService.ensureSystemWelcome(userId),
        notificationService.ensureSystemWelcome(userId),
    ]);
    // 재접속·재로그인에 해당하는 추가 호출.
    await notificationService.ensureSystemWelcome(userId);

    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 1);
    const creations = emitted.filter((e) => e.event === 'notification_created');
    assert.equal(creations.length, 1, '이미 있는 사건을 다시 발행하면 안 된다');

    // 시스템 알림에만 sfxEvent를 싣는다 — 안정 ID는 저장된 행 id다.
    const row = await db.Notification.findOne({ where: { user_id: userId }, raw: true });
    assert.deepEqual(creations[0].payload.sfxEvent, {
        kind: 'system-notification',
        eventId: `notification:${row.id}`,
        accountId: userId,
        origin: 'live',
    });
    assert.equal(row.title, '알림 기능 안내');
    assert.deepEqual(row.target, { kind: 'settings' });
});

test('A-02: 시스템 알림 저장이 실패하면 행 0 · 발행 0이다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('sysf');
    const emitted = [];
    const realNotification = db.Notification;
    db.Notification = {
        async findOrCreate() { throw new Error('simulated system insert failure'); },
        async findOne() { return null; },
    };
    notificationService.__internal.__setDepsForTests({
        emitToUser: (uuid, event) => emitted.push({ uuid, event }),
    });
    t.after(() => { db.Notification = realNotification; });

    await assert.rejects(() => notificationService.ensureSystemWelcome(userId), /simulated system insert failure/);

    db.Notification = realNotification;
    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 0);
    assert.equal(emitted.filter((e) => e.event === 'notification_created').length, 0);
});

// ---------------------------------------------------------------------------
// AC-02 · A-05: 조회·읽음 API
// ---------------------------------------------------------------------------

test('AC-02: PATCH는 서버가 확정한 read_at을 돌려주고, 재시도해도 최초 시각이 유지된다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('read');
    const { notification } = await notificationService.ensureSystemWelcome(userId);
    const base = await startRouteServer(t);

    const first = await authPatch(base, userId, notification.id);
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    assert.ok(firstBody.data.readAt);

    // 응답 유실 후 재시도에 해당한다 — 읽음 시각을 뒤로 밀지 않는다(멱등).
    const second = await authPatch(base, userId, notification.id);
    assert.equal(second.status, 200);
    const secondBody = await second.json();
    assert.equal(
        new Date(secondBody.data.readAt).getTime(),
        new Date(firstBody.data.readAt).getTime(),
        '재시도가 최초 read_at을 덮으면 안 된다',
    );

    // 재로그인(새 조회)해도 읽음 상태가 그대로 복원된다.
    const listed = await (await authGet(base, userId)).json();
    assert.ok(listed.data[0].readAt);
});

test('A-05: 다른 계정의 알림 id로 PATCH하면 404이고 어떤 행도 바뀌지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const owner = await createLocalUser('own');
    const attacker = await createLocalUser('atk');
    const { notification } = await notificationService.ensureSystemWelcome(owner);
    const base = await startRouteServer(t);

    const res = await authPatch(base, attacker, notification.id);
    assert.equal(res.status, 404);

    const row = await db.Notification.findOne({ where: { id: notification.id }, raw: true });
    assert.equal(row.read_at, null, '다른 계정의 PATCH가 행을 바꾸면 안 된다');
});

test('A-05: 목록 조회는 자기 계정 행만 돌려준다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const a = await createLocalUser('la');
    const b = await createLocalUser('lb');
    await notificationService.ensureSystemWelcome(a);
    await notificationService.ensureSystemWelcome(b);
    await friendService.sendFriendRequest(a, b); // b에게 친구 알림 1

    const base = await startRouteServer(t);
    const aBody = await (await authGet(base, a)).json();
    const bBody = await (await authGet(base, b)).json();

    assert.equal(aBody.data.length, 1);
    assert.equal(bBody.data.length, 2);
    assert.ok(aBody.data.every((row) => row.type === 'system'));
});

test('익명 요청은 401, 잘못된 형태의 id는 400, 없는 id는 404다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('codes');
    const base = await startRouteServer(t);

    const anonymousList = await fetch(`${base}/notifications`);
    assert.equal(anonymousList.status, 401);

    const badId = await authPatch(base, userId, 'not-a-uuid');
    assert.equal(badId.status, 400);

    const missing = await authPatch(base, userId, crypto.randomUUID());
    assert.equal(missing.status, 404);
});

test('AC-06: 조회 응답은 캐시되지 않는다(Cache-Control: no-store)', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('nostore');
    const base = await startRouteServer(t);
    const res = await authGet(base, userId);
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('A-04: GET은 알림을 만들지도, 읽음으로 바꾸지도 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('getonly');
    await notificationService.ensureSystemWelcome(userId);
    const base = await startRouteServer(t);

    for (let i = 0; i < 3; i += 1) assert.equal((await authGet(base, userId)).status, 200);

    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 1);
    const row = await db.Notification.findOne({ where: { user_id: userId }, raw: true });
    assert.equal(row.read_at, null);
});

// ---------------------------------------------------------------------------
// AC-07: 실제 소켓 수신 경계
// ---------------------------------------------------------------------------

/** registerNotificationHandlers가 붙는 최소 소켓 대역. */
function fakeSocket(uuid, socketId) {
    const listeners = new Map();
    const emitted = [];
    const disconnects = [];
    return {
        id: socketId,
        data: { user: { uuid, role: 'USER', sessionId: `session-${uuid}` } },
        on(event, listener) { listeners.set(event, listener); return this; },
        emit(event, payload) { emitted.push({ event, payload }); return this; },
        disconnect(close) { disconnects.push(close); return this; },
        // matchmaking/gameSession 핸들러가 쓰는 채널 조작은 이 시험의 관심사가 아니다.
        join() { return this; },
        leave() { return this; },
        removeAllListeners() { listeners.clear(); return this; },
        __fire(event, ...args) { return listeners.get(event)?.(...args); },
        __has(event) { return listeners.has(event); },
        __emitted: emitted,
        __disconnects: disconnects,
    };
}

/**
 * **실제 등록 순서 그대로** 소켓을 만든다(R-IMPL #5).
 *
 * registerConnectionHandlers는 wrapSocketWithSessionGuard를 먼저 부른 뒤
 * registerNotificationHandlers를 부른다 — 그래서 notifications_ready도 매 수신마다
 * sessionLifecycle.resolveSession을 통과해야 한다. 가드를 건너뛰고 핸들러만 등록하면
 * "연결 후 로그아웃·정지된 소켓이 생산을 트리거하지 못한다"는 계약을 전혀 검증하지 못한다.
 */
function guardedSocket(uuid, socketId) {
    const s = fakeSocket(uuid, socketId);
    socket.__testables.wrapSocketWithSessionGuard(s);
    socket.__testables.registerNotificationHandlers(s, uuid);
    return s;
}

/** 조건이 참이 될 때까지(또는 제한 시간까지) 기다린다. 실제 DB 왕복을 포함하므로 필요하다. */
const waitFor = async (predicate, { timeoutMs = 3000, stepMs = 5 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
    return predicate();
};

/**
 * notifications_ready를 실제 세션 가드를 통과시켜 보내고, 결과가 정착할 때까지 기다린다.
 * 가드가 세션을 거부하면 ACK 없이 force_disconnect만 나가므로 둘 중 하나를 기다린다.
 */
const fireGuardedReady = async (s, payload = {}) => {
    const state = { ack: null };
    await s.__fire('notifications_ready', payload, (result) => { state.ack = result; });
    await waitFor(() => state.ack !== null || s.__emitted.some((e) => e.event === 'force_disconnect'));
    return state.ack;
};

test('AC-07: 현재 소켓의 첫 정상 ready만 행 1·발행 1을 만들고, 반복 ready는 추가 0이다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('rdy');
    const emitted = [];
    notificationService.__internal.__setDepsForTests({
        emitToUser: (uuid, event, payload) => emitted.push({ uuid, event, payload }),
    });

    const onlineUsers = socket.__getOnlineUsersForTests();
    onlineUsers.set(userId, 'socket-1');
    t.after(() => onlineUsers.delete(userId));

    const s = fakeSocket(userId, 'socket-1');
    socket.__testables.registerNotificationHandlers(s, userId);

    const acks = [];
    await new Promise((resolve) => s.__fire('notifications_ready', {}, (ack) => { acks.push(ack); resolve(); }));
    await new Promise((resolve) => s.__fire('notifications_ready', {}, (ack) => { acks.push(ack); resolve(); }));

    assert.deepEqual(acks, [{ ok: true, created: true }, { ok: true, created: false }]);
    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 1);
    assert.equal(emitted.filter((e) => e.event === 'notification_created').length, 1);
});

test('AC-07: 클라이언트가 보낸 payload는 대상·내용을 바꾸지 못한다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('forge');
    const victim = await createLocalUser('vic');

    const onlineUsers = socket.__getOnlineUsersForTests();
    onlineUsers.set(userId, 'socket-forge');
    t.after(() => onlineUsers.delete(userId));

    const s = fakeSocket(userId, 'socket-forge');
    socket.__testables.registerNotificationHandlers(s, userId);

    await new Promise((resolve) => s.__fire('notifications_ready', {
        userId: victim, accountId: victim, sourceKey: 'system:forged:v1', title: '위조', body: '위조',
        target: { kind: 'external', url: 'https://example.com' },
    }, resolve));

    assert.equal(await db.Notification.count({ where: { user_id: victim } }), 0, '다른 계정 앞으로 만들면 안 된다');
    const row = await db.Notification.findOne({ where: { user_id: userId }, raw: true });
    assert.equal(row.source_key, 'system:notifications-available:v1');
    assert.equal(row.title, '알림 기능 안내');
    assert.deepEqual(row.target, { kind: 'settings' });
});

test('AC-07/A-05: 이 소켓이 더 이상 그 계정의 현재 소켓이 아니면 생성 0이다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('stale');
    const onlineUsers = socket.__getOnlineUsersForTests();
    // 같은 계정의 새 로그인이 소켓을 이미 교체한 상태.
    onlineUsers.set(userId, 'socket-new');
    t.after(() => onlineUsers.delete(userId));

    const s = fakeSocket(userId, 'socket-old');
    socket.__testables.registerNotificationHandlers(s, userId);

    const ack = await new Promise((resolve) => s.__fire('notifications_ready', {}, resolve));
    assert.deepEqual(ack, { ok: false, reason: 'STALE_SOCKET' });
    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 0);
});

// --- 실제 등록 경로(세션 가드 통과) ------------------------------------------

test('AC-07/R-IMPL#5: 세션 가드를 통과한 첫 ready만 행 1·발행 1이고, 반복 ready는 추가 0이다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('grd');
    const emitted = [];
    notificationService.__internal.__setDepsForTests({
        emitToUser: (uuid, event, payload) => emitted.push({ uuid, event, payload }),
    });

    const onlineUsers = socket.__getOnlineUsersForTests();
    onlineUsers.set(userId, 'socket-guard');
    t.after(() => onlineUsers.delete(userId));

    // 실제 순서: wrapSocketWithSessionGuard → registerNotificationHandlers.
    const s = guardedSocket(userId, 'socket-guard');

    assert.deepEqual(await fireGuardedReady(s), { ok: true, created: true });
    assert.deepEqual(await fireGuardedReady(s), { ok: true, created: false });

    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 1);
    assert.equal(emitted.filter((e) => e.event === 'notification_created').length, 1);
    assert.equal(
        s.__emitted.filter((e) => e.event === 'force_disconnect').length, 0,
        '정상 세션을 가드가 끊으면 안 된다',
    );
});

test('AC-07/R-IMPL#5: 세션이 폐기된 소켓의 ready는 가드에서 끊기고 생성 0·발행 0이다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('revk');
    const emitted = [];
    notificationService.__internal.__setDepsForTests({
        emitToUser: (uuid, event, payload) => emitted.push({ uuid, event, payload }),
    });

    const onlineUsers = socket.__getOnlineUsersForTests();
    onlineUsers.set(userId, 'socket-revoked');
    t.after(() => onlineUsers.delete(userId));

    const s = guardedSocket(userId, 'socket-revoked');

    // 연결 이후의 로그아웃(세션 폐기)과 같은 상태 — HTTP와 같은 기준으로 거부돼야 한다.
    await db.UserSession.update({ is_online: false }, { where: { id: `session-${userId}` } });

    const ack = await fireGuardedReady(s);

    assert.equal(ack, null, '가드가 거부한 이벤트는 핸들러에 닿지 않으므로 ACK도 없다');
    assert.equal(s.__emitted.filter((e) => e.event === 'force_disconnect').length, 1);
    assert.deepEqual(s.__disconnects, [true], '가드는 소켓을 실제로 끊는다');
    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 0, '무효 세션은 생성 0이다');
    assert.equal(emitted.filter((e) => e.event === 'notification_created').length, 0);
});

test('AC-07/A-05: 가드를 통과해도 현재 소켓이 아니면 생성 0이다(실제 등록 경로)', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('gstl');
    const onlineUsers = socket.__getOnlineUsersForTests();
    // 같은 계정의 새 로그인이 소켓을 이미 교체한 상태.
    onlineUsers.set(userId, 'socket-new');
    t.after(() => onlineUsers.delete(userId));

    const s = guardedSocket(userId, 'socket-old');
    const ack = await fireGuardedReady(s);

    assert.deepEqual(ack, { ok: false, reason: 'STALE_SOCKET' });
    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 0);
    assert.equal(
        s.__emitted.filter((e) => e.event === 'force_disconnect').length, 0,
        '세션은 유효하므로 가드가 끊을 이유가 없다',
    );
});

test('AC-07/R-IMPL#5: registerConnectionHandlers가 등록한 notifications_ready도 가드 뒤에 있다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('conn');
    const emitted = [];
    notificationService.__internal.__setDepsForTests({
        emitToUser: (uuid, event, payload) => emitted.push({ uuid, event, payload }),
    });

    const onlineUsers = socket.__getOnlineUsersForTests();
    t.after(() => onlineUsers.delete(userId));

    const s = fakeSocket(userId, 'socket-conn');
    // 실제 연결 진입점. presence·방·세션 재동기화는 fire-and-forget으로 따로 돌고(실패해도
    // 삼켜진다), 우리가 보는 것은 "알림 생산이 그 경계에서 분리돼 있는가"다.
    const io = { sockets: { sockets: new Map() }, to: () => ({ emit() {} }) };
    socket.__testables.registerConnectionHandlers(io, s);

    assert.equal(s.__has('notifications_ready'), true, '실제 진입점이 이 이벤트를 등록해야 한다');
    // handleConnection이 onlineUsers를 이 소켓으로 갱신할 때까지 기다린다.
    assert.equal(await waitFor(() => onlineUsers.get(userId) === 'socket-conn'), true);

    assert.deepEqual(await fireGuardedReady(s), { ok: true, created: true });
    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 1);

    // 연결 이후 세션이 폐기되면 같은 소켓의 다음 ready는 가드에서 끊긴다.
    await db.UserSession.update({ is_online: false }, { where: { id: `session-${userId}` } });
    assert.equal(await fireGuardedReady(s), null);
    assert.equal(s.__emitted.filter((e) => e.event === 'force_disconnect').length, 1);
    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 1, '추가 생성 0');
    assert.equal(emitted.filter((e) => e.event === 'notification_created').length, 1, '추가 발행 0');
});

test('AC-07: 생산이 실패해도 ACK만 실패로 돌아가고 예외가 접속 처리로 새지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    const userId = await createLocalUser('prodf');
    const onlineUsers = socket.__getOnlineUsersForTests();
    onlineUsers.set(userId, 'socket-fail');
    t.after(() => onlineUsers.delete(userId));

    const realNotification = db.Notification;
    db.Notification = {
        async findOrCreate() { throw new Error('simulated ready failure'); },
        async findOne() { return null; },
    };
    t.after(() => { db.Notification = realNotification; });

    const s = fakeSocket(userId, 'socket-fail');
    socket.__testables.registerNotificationHandlers(s, userId);

    const ack = await new Promise((resolve) => s.__fire('notifications_ready', {}, resolve));
    assert.deepEqual(ack, { ok: false, reason: 'FAILED' });

    db.Notification = realNotification;
    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 0);
});

// ---------------------------------------------------------------------------
// 고정 장비 자체의 회귀 — 데이터 격리가 실제로 일어나는가
// ---------------------------------------------------------------------------

test('격리: 일반 케이스의 데이터 정리는 관리 테이블의 행만 비우고 스키마·이관 이력·외래 키는 그대로 둔다', async (t) => {
    if (unavailable(t)) return;
    await setUp(t);

    // (1) 한 케이스가 남길 수 있는 것을 실제 경로로 전부 만든다. 하나라도 비어 있으면 이
    //     시험은 "정리"가 아니라 "빈 DB"를 확인하는 것이 되므로 먼저 값으로 확인한다.
    const a = await createLocalUser('iso-a');
    const b = await createLocalUser('iso-b');
    await notificationService.ensureSystemWelcome(a);
    await friendService.sendFriendRequest(a, b);

    const populated = [
        [db.User, 'users'], [db.UserStats, 'user_stats'], [db.UserSession, 'user_sessions'],
        [db.FriendRequest, 'friend_requests'], [db.Notification, 'notifications'],
    ];
    for (const [model, table] of populated) {
        assert.ok(
            await model.count({}) > 0,
            `${table}에 행이 없으면 이 시험은 정리를 검증하는 것이 아니라 빈 DB를 확인하는 것이 된다`,
        );
    }

    // (2) 일반 케이스의 setUp이 쓰는 바로 그 정리를 실행한다.
    const result = await resetManagedData(sequelize, TEST_DB_URL, {
        managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER,
        keepTables: [migrationRunner.META_TABLE],
    });
    assert.equal(result.cleaned, true);
    assert.deepEqual(
        result.deleted, DATA_TABLES,
        '관리 테이블 하나라도 빼놓으면 다음 케이스가 남은 행을 물려받는다',
    );

    // (3) 실제로 한 건도 남지 않았다 — 다음 케이스의 setUp이 하는 단정과 같은 질의다.
    assert.deepEqual(await findNonEmptyManagedTables(sequelize, DATA_TABLES), []);

    // 스키마·이관 이력은 그대로다 — 정리는 드롭이 아니다.
    const [history] = await sequelize.query(
        `SELECT COUNT(*) AS applied_count FROM ${migrationRunner.META_TABLE} WHERE status = 'applied'`,
    );
    assert.equal(
        Number(history[0].applied_count), MIGRATIONS.length,
        '데이터 정리가 이관 이력을 지우면 다음 실행이 이미 있는 스키마에 다시 이관을 시도한다',
    );
    await assert.doesNotReject(() => addNotifications.verify(sequelize.getQueryInterface()));

    // 외래 키는 여전히 강제된다 — FOREIGN_KEY_CHECKS를 끄지 않았다는 값 수준의 증거다.
    await assert.rejects(
        () => db.Notification.create({
            id: crypto.randomUUID(), user_id: crypto.randomUUID(), type: 'system',
            source_key: 'system:isolation-probe:v1', title: '격리 확인', body: '본문',
            target: { kind: 'settings' },
        }),
        '정리 뒤에도 없는 계정 앞으로의 알림은 외래 키가 막아야 한다',
    );
});

// ---------------------------------------------------------------------------
// 마이그레이션 재실행(AC-03)
// ---------------------------------------------------------------------------

test('AC-03: 0012를 다시 적용해도 기존 알림 행·id·read_at이 보존된다', async (t) => {
    if (unavailable(t)) return;
    // 아래 다섯 건은 0012의 up/verify·인덱스·외래 키 자체가 대상이다 — 데이터만 비운
    // 공유 스키마가 아니라 매번 새로 이관한 스키마 위에서 돌아야 한다.
    await setUpFreshSchema(t);

    const userId = await createLocalUser('mig');
    const { notification } = await notificationService.ensureSystemWelcome(userId);
    await notificationService.markRead(userId, notification.id);

    const before = await db.Notification.findOne({ where: { id: notification.id }, raw: true });

    // 실제 마이그레이션의 up/verify를 그대로 다시 실행한다(멱등이어야 한다).
    const queryInterface = sequelize.getQueryInterface();
    await addNotifications.up(queryInterface, Sequelize);
    await addNotifications.verify(queryInterface);

    const after = await db.Notification.findOne({ where: { id: notification.id }, raw: true });
    assert.equal(after.id, before.id);
    assert.equal(new Date(after.read_at).getTime(), new Date(before.read_at).getTime());
    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 1);
});

test('AC-03: verify는 유일 인덱스가 없는 스키마를 성공으로 넘기지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUpFreshSchema(t);

    const queryInterface = sequelize.getQueryInterface();
    await queryInterface.removeIndex('notifications', addNotifications.UNIQUE_INDEX_NAME);

    await assert.rejects(
        () => addNotifications.verify(queryInterface),
        new RegExp(addNotifications.UNIQUE_INDEX_NAME),
    );

    // up을 다시 부르면 빠진 인덱스를 복구한다(중간 실패 상태 회복).
    await addNotifications.up(queryInterface, Sequelize);
    await addNotifications.verify(queryInterface);
});

test('AC-03/R-IMPL#4: 이름만 같은 UNIQUE(id)는 실제 MySQL에서도 verify를 통과하지 못한다', async (t) => {
    if (unavailable(t)) return;
    await setUpFreshSchema(t);

    const userId = await createLocalUser('shape');
    const { notification } = await notificationService.ensureSystemWelcome(userId);

    const queryInterface = sequelize.getQueryInterface();
    // 같은 이름으로 id만 덮는 유일 인덱스를 세운다 — 예전 verify는 이름과 unique 플래그만
    // 봤기 때문에 이 스키마를 "적용됨"으로 통과시켰고, 그 상태에서는 같은 계정·같은 원본
    // 사건의 알림이 둘 이상 쌓인다.
    await queryInterface.removeIndex('notifications', addNotifications.UNIQUE_INDEX_NAME);
    await queryInterface.addIndex('notifications', ['id'], {
        name: addNotifications.UNIQUE_INDEX_NAME, unique: true,
    });

    await assert.rejects(
        () => addNotifications.verify(queryInterface),
        /기대 \[user_id, source_key\]/,
    );

    // 실패가 사용자 데이터를 지우지 않는다.
    assert.equal(await db.Notification.count({ where: { id: notification.id } }), 1);

    // 잘못된 인덱스를 치우고 up을 다시 부르면 올바른 모양으로 복구된다.
    await queryInterface.removeIndex('notifications', addNotifications.UNIQUE_INDEX_NAME);
    await addNotifications.up(queryInterface, Sequelize);
    await addNotifications.verify(queryInterface);
    assert.equal(await db.Notification.count({ where: { id: notification.id } }), 1);
});

test('AC-03/R-IMPL#4: users.uuid 외래 키가 빠진 스키마도 verify가 거부한다', async (t) => {
    if (unavailable(t)) return;
    await setUpFreshSchema(t);

    const userId = await createLocalUser('fk');
    await notificationService.ensureSystemWelcome(userId);

    const queryInterface = sequelize.getQueryInterface();
    const references = await queryInterface.getForeignKeyReferencesForTable('notifications');
    const target = references.find((reference) => String(reference.columnName).toLowerCase() === 'user_id');
    assert.ok(target, '0012는 user_id 외래 키를 만든다');

    await queryInterface.removeConstraint('notifications', target.constraintName);

    await assert.rejects(() => addNotifications.verify(queryInterface), /외래 키가 없습니다/);
    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 1, 'verify 실패가 행을 지우면 안 된다');
});

test('AC-03/R-IMPL#4: 재실행 뒤에도 인덱스 컬럼·FK·행이 모두 그대로다(멱등 + 데이터 보존)', async (t) => {
    if (unavailable(t)) return;
    await setUpFreshSchema(t);

    const userId = await createLocalUser('idem');
    const { notification } = await notificationService.ensureSystemWelcome(userId);
    await notificationService.markRead(userId, notification.id);

    const queryInterface = sequelize.getQueryInterface();
    const fieldsOf = (indexes, name) => (indexes.find((index) => index.name === name)?.fields ?? [])
        .map((field) => (typeof field === 'string' ? field : field.attribute));

    await addNotifications.up(queryInterface, Sequelize);
    await addNotifications.up(queryInterface, Sequelize);
    await addNotifications.verify(queryInterface);

    const indexes = await queryInterface.showIndex('notifications');
    assert.deepEqual(fieldsOf(indexes, addNotifications.UNIQUE_INDEX_NAME), ['user_id', 'source_key']);
    assert.deepEqual(fieldsOf(indexes, addNotifications.LIST_INDEX_NAME), ['user_id', 'created_at']);

    const references = await queryInterface.getForeignKeyReferencesForTable('notifications');
    assert.ok(references.some((reference) => (
        String(reference.columnName).toLowerCase() === 'user_id'
        && String(reference.referencedTableName).toLowerCase() === 'users'
        && String(reference.referencedColumnName).toLowerCase() === 'uuid'
    )));

    const row = await db.Notification.findOne({ where: { id: notification.id }, raw: true });
    assert.ok(row.read_at, '재실행이 읽음 시각을 지우면 안 된다');
    assert.equal(await db.Notification.count({ where: { user_id: userId } }), 1);
});
