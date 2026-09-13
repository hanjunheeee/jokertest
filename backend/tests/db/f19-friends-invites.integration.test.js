'use strict';

// F-19 친구 즐겨찾기·차단·게임 초대 — 실제 격리 MySQL DB에서 AC-02~AC-07과 A-04/A-05/
// A-09/A-10을 검증한다. 라우터 → verifyToken → 컨트롤러 → friendService/gameInviteService →
// 실제 저장소 → 실제 SQL까지 전부 진짜 코드로 태운다. fake db로는 증명할 수 없는 것들이
// 여기 있다:
//   - 0013이 건 pending_pair_key 유일 인덱스가 **교차 방향** 동시 신청을 하나로 좁히는가,
//     그러면서 거절→재신청→재거절의 terminal 이력은 몇 개든 남기는가(AC-05 마이그레이션)
//   - 같은 creation_key 재시도가 진짜로 한 행·한 알림·한 사건으로 끝나는가(A-05)
//   - 차단이 PENDING 요청·초대만 CANCELLED로 바꾸고 Friendship·즐겨찾기 원본은 남기는가,
//     해제해도 되살아나지 않는가(AC-05)
//   - 남의 차단을 지우는 DELETE가 정말 0행을 건드리는가(AC-04)
//   - 수락 결정(ACCEPTED/UNCONFIRMED)과 publication 영수증(PUBLISHED)이 **다른 사실**로
//     따로 확정되는가, 두 번째 잠금 전 차단이 커밋되면 역사적 결정은 남고 입장만
//     INTERRUPTED가 되는가(A-10)
//
// backend/tests/helpers/isolatedTestDb.js의 관리 목록·대상 DB 확인 원칙을 따른다.
// F01_TEST_DATABASE_URL이 없으면 각 테스트는 실패로 표시하지 않고 명시적으로 skip한다
// (f01~f17과 같은 관례 — skip은 통과가 아니라 **미검증**이다).

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://test:test@localhost:3306/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'f19-friends-invites-test-secret';

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
const addF19FriendsInvites = require('../../db/migrations/0013-f19-friends-invites');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, addEconomy, addEconomyPurchaseRequests,
    addVoteParticipations, addAchievementGrants, addNotifications, addF19FriendsInvites,
    migrationRunner,
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
const friendService = require('../../service/friend.service');
const gameInviteService = require('../../service/gameInvite.service');
const notificationService = require('../../service/notification.service');
const { hashPassword } = require('../../utils/hash');
const { generateToken } = require('../../utils/jwt');
const { notFoundHandler, globalErrorHandler } = require('../../middleware/errorHandler');

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

// ---------------------------------------------------------------------------
// 시험 장비
// ---------------------------------------------------------------------------

/** 서버 시각. 만료 판정을 결정적으로 재현하기 위해 시험이 소유한다. */
let clockMs = Date.UTC(2026, 8, 13, 0, 0, 0);
const nowFn = () => new Date(clockMs);

/** 서버가 보낸 소켓 사건 전부(대상·이름·payload). 소리·중복 판정의 증거다. */
let emitted = [];
const recordingEmit = (userId, event, payload) => {
    emitted.push({ userId, event, payload });
};

/**
 * matchmaking.js가 런타임에 주입하는 방 접근자의 시험 대역.
 *
 * **새 registry를 만드는 것이 아니다** — 실제 코드에서도 초대 서비스는 방 상태를 소유하지
 * 않고 주입된 접근자로만 읽는다(gameInvite.service.js::__setRoomAccessForRuntime). 이 시험은
 * 그 경계를 그대로 쓰고, 실제 Map 소유자의 입장 상태 기계는 backend/socket/__tests__/
 * matchmaking.gameInvite.test.js가 담당한다.
 */
const roomAccess = {
    bootEpoch: 'boot-f19-test',
    rooms: new Map(),
    userRoom: new Map(),
    receiverAvailability: { available: true },
    describeRoomForInvite(roomId) {
        return roomAccess.rooms.get(roomId) ?? null;
    },
    getRoomIdForUser(uuid) {
        return roomAccess.userRoom.get(uuid) ?? null;
    },
    describeReceiverAvailability() {
        return roomAccess.receiverAvailability;
    },
};

const placeInRoom = (uuid, roomId, overrides = {}) => {
    roomAccess.rooms.set(roomId, {
        roomId, roomInstanceId: `${roomId}-inst-1`, isFull: false, ...overrides,
    });
    roomAccess.userRoom.set(uuid, roomId);
};

const setUp = async () => {
    await resetSchema();
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    clockMs = Date.UTC(2026, 8, 13, 0, 0, 0);
    emitted = [];
    roomAccess.rooms.clear();
    roomAccess.userRoom.clear();
    roomAccess.receiverAvailability = { available: true };

    gameInviteService.__setRoomAccessForRuntime(roomAccess);
    gameInviteService.__internal.__setDepsForTests({ emitToUser: recordingEmit, now: nowFn });
    notificationService.__internal.__setDepsForTests({ emitToUser: recordingEmit, now: nowFn });
};

test.afterEach(() => {
    gameInviteService.__setRoomAccessForRuntime(null);
    gameInviteService.__internal.__setDepsForTests(null);
    notificationService.__internal.__setDepsForTests(null);
});

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
    await db.UserSession.create({ id: `session-${uuid}`, user_id: uuid, is_online: true });
    return uuid;
};

const startRouteServer = async (t) => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/friends', require('../../routes/friend.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);

    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    return `http://127.0.0.1:${server.address().port}`;
};

const tokenFor = (uuid) => generateToken({ uuid, role: 'USER', sessionId: `session-${uuid}` });
const authFetch = (base, uuid, path, init = {}) =>
    fetch(`${base}${path}`, {
        ...init,
        headers: {
            cookie: `accessToken=${tokenFor(uuid)}`,
            'Content-Type': 'application/json',
            ...(init.headers ?? {}),
        },
    });

/** 실제 신청 → 수락 경로로 친구 관계를 만든다(잠금·알림 경계를 그대로 탄다). */
const befriend = async (a, b) => {
    const request = await friendService.sendFriendRequest(a, b);
    await friendService.acceptRequest(b, request.id);
    return request.id;
};

const countRows = async (model, where) => await model.count({ where });

const eventsNamed = (name) => emitted.filter((entry) => entry.event === name);

// ---------------------------------------------------------------------------
// AC-05 마이그레이션 — 이력 보존과 유일 제약 교체
// ---------------------------------------------------------------------------

test('AC-05: 0013 재실행은 스키마·행을 그대로 두고 이력을 한 건만 남긴다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('mig-a');
    const b = await createLocalUser('mig-b');
    await friendService.sendFriendRequest(a, b);

    const before = {
        requests: await countRows(db.FriendRequest, {}),
        favorites: await countRows(db.FriendFavorite, {}),
        blocks: await countRows(db.FriendBlock, {}),
        invites: await countRows(db.GameInvite, {}),
    };

    // 같은 명령을 다시 돌린다 — up은 멱등이어야 하고 verify가 컬럼·인덱스 계약까지 대조한다.
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });

    const [historyRows] = await sequelize.query(
        `SELECT status FROM ${migrationRunner.META_TABLE} WHERE name = '0013-f19-friends-invites'`,
    );
    assert.equal(historyRows.length, 1, '0013 이력은 재실행 뒤에도 한 건이어야 한다');
    assert.equal(historyRows[0].status, 'applied');

    assert.deepEqual(
        {
            requests: await countRows(db.FriendRequest, {}),
            favorites: await countRows(db.FriendFavorite, {}),
            blocks: await countRows(db.FriendBlock, {}),
            invites: await countRows(db.GameInvite, {}),
        },
        before,
        '재실행이 기존 행을 건드리면 안 된다',
    );

    // 세 테이블이 실제로 존재하고 관리 목록에 등록돼 있다.
    const tables = await sequelize.getQueryInterface().showAllTables();
    for (const table of ['friend_favorites', 'friend_blocks', 'game_invites']) {
        assert.ok(tables.includes(table), `${table}이 실제로 만들어져야 한다`);
        assert.ok(MANAGED_TABLES.includes(table), `${table}이 격리 DB 관리 목록에 있어야 한다`);
    }
});

test('AC-05: 거절 → 재신청 → 재거절이 terminal 이력을 두 행으로 보존한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('hist-a');
    const b = await createLocalUser('hist-b');

    const first = await friendService.sendFriendRequest(a, b);
    await friendService.declineRequest(b, first.id);

    // 예전 UNIQUE(requester_id, receiver_id, status)였다면 여기서 두 번째 DECLINED가 막혔다.
    const second = await friendService.sendFriendRequest(a, b);
    await friendService.declineRequest(b, second.id);

    const declined = await db.FriendRequest.findAll({
        where: { requester_id: a, receiver_id: b, status: 'DECLINED' },
        order: [['id', 'ASC']],
    });
    assert.equal(declined.length, 2, '같은 방향의 거절 이력이 두 행 남아야 한다');
    assert.notEqual(declined[0].id, declined[1].id);

    // terminal 행이 둘이어도 새 PENDING은 여전히 하나만 가능하다.
    const third = await friendService.sendFriendRequest(a, b);
    assert.equal(await countRows(db.FriendRequest, { status: 'PENDING' }), 1);
    assert.ok(Number.isInteger(third.id));
});

test('AC-05: 교차 방향 동시 신청은 유효 PENDING 하나로 좁혀진다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('pair-a');
    const b = await createLocalUser('pair-b');

    await friendService.sendFriendRequest(a, b);

    // B→A 반대 방향 신청. 예전 제약은 방향이 달라 통과시켰고, 그러면 양쪽이 각자 수락해
    // Friendship이 두 행 생길 수 있었다.
    await assert.rejects(
        () => friendService.sendFriendRequest(b, a),
        (error) => error.status === 409,
        '같은 계정쌍의 교차 PENDING은 거부돼야 한다',
    );

    assert.equal(await countRows(db.FriendRequest, { status: 'PENDING' }), 1);
});

// ---------------------------------------------------------------------------
// AC-02 — 요청 결과 조회(응답 유실 재확인)
// ---------------------------------------------------------------------------

test('AC-02: 요청 당사자만 결과를 읽고 남의 요청 id는 결과에 없다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const base = await startRouteServer(t);

    const a = await createLocalUser('res-a');
    const b = await createLocalUser('res-b');
    const c = await createLocalUser('res-c');
    const d = await createLocalUser('res-d');

    const mine = await friendService.sendFriendRequest(a, b);
    const theirs = await friendService.sendFriendRequest(c, d);
    await friendService.acceptRequest(b, mine.id);

    // 수신자 B가 자기 요청과 남의 요청을 섞어 묻는다.
    const response = await authFetch(base, b, `/friends/requests/results?ids=${mine.id},${theirs.id}`);
    assert.equal(response.status, 200);
    const body = await response.json();

    assert.equal(body.data.length, 1, '남의 요청 행은 결과에 포함되면 안 된다');
    assert.equal(body.data[0].request_id, mine.id);
    assert.equal(body.data[0].status, 'ACCEPTED');

    // 제3자는 같은 id로 물어도 아무것도 보지 못한다.
    const outsider = await authFetch(base, c, `/friends/requests/results?ids=${mine.id}`);
    assert.deepEqual((await outsider.json()).data, []);
});

// ---------------------------------------------------------------------------
// AC-03 — 계정별 서버 즐겨찾기
// ---------------------------------------------------------------------------

test('AC-03: 같은 PUT을 두 번 보내도 행은 하나이고 다른 접속에서 그대로 복원된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const base = await startRouteServer(t);

    const a = await createLocalUser('fav-a');
    const b = await createLocalUser('fav-b');
    await befriend(a, b);

    const put = (favorite) => authFetch(base, a, `/friends/favorites/${b}`, {
        method: 'PUT', body: JSON.stringify({ favorite }),
    });

    assert.equal((await put(true)).status, 200);
    // 응답 유실 재전송. toggle이 아니라 "원하는 값 저장"이라 결과가 뒤집히지 않는다.
    assert.equal((await put(true)).status, 200);

    assert.equal(await countRows(db.FriendFavorite, { owner_id: a, friend_id: b }), 1);

    // 다른 브라우저·재접속을 흉내낸 새 요청에서도 서버 값이 그대로 복원된다.
    const restored = await (await authFetch(base, a, '/friends/favorites')).json();
    assert.deepEqual(restored.data, [b]);

    // 친구 목록 응답의 isFavorite도 같은 서버 값을 따른다.
    const friends = await (await authFetch(base, a, '/friends')).json();
    assert.equal(friends.data.find((friend) => friend.id === b).isFavorite, true);

    // false 저장도 멱등이다.
    assert.equal((await put(false)).status, 200);
    assert.equal((await put(false)).status, 200);
    assert.equal(await countRows(db.FriendFavorite, { owner_id: a, friend_id: b }), 0);
});

test('AC-03: 친구가 아닌 계정은 즐겨찾기할 수 없고 다른 계정의 즐겨찾기는 바뀌지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const base = await startRouteServer(t);

    const a = await createLocalUser('fav2-a');
    const b = await createLocalUser('fav2-b');
    const c = await createLocalUser('fav2-c');
    await befriend(a, b);

    await authFetch(base, a, `/friends/favorites/${b}`, { method: 'PUT', body: JSON.stringify({ favorite: true }) });

    // C는 A의 친구가 아니다 — 즐겨찾기 대상이 될 수 없다.
    const notFriend = await authFetch(base, a, `/friends/favorites/${c}`, {
        method: 'PUT', body: JSON.stringify({ favorite: true }),
    });
    assert.equal(notFriend.status, 404);

    // C가 같은 경로로 저장해도 owner_id는 인증 uuid라 A의 행을 건드리지 못한다.
    await authFetch(base, c, `/friends/favorites/${b}`, { method: 'PUT', body: JSON.stringify({ favorite: false }) });
    assert.equal(await countRows(db.FriendFavorite, { owner_id: a, friend_id: b }), 1, 'A의 즐겨찾기는 그대로여야 한다');

    // C의 조회에는 A의 값이 보이지 않는다.
    assert.deepEqual((await (await authFetch(base, c, '/friends/favorites')).json()).data, []);

    // boolean이 아닌 값은 서버가 임의로 해석하지 않는다.
    const bad = await authFetch(base, a, `/friends/favorites/${b}`, {
        method: 'PUT', body: JSON.stringify({ favorite: 'yes' }),
    });
    assert.equal(bad.status, 400);
    assert.equal(await countRows(db.FriendFavorite, { owner_id: a, friend_id: b }), 1);
});

// ---------------------------------------------------------------------------
// AC-04 — 차단·해제·목록과 양방향 거부
// ---------------------------------------------------------------------------

test('AC-04: 차단하면 양방향 친구 신청이 거부되고 해제 권한은 소유자에게만 있다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const base = await startRouteServer(t);

    const a = await createLocalUser('blk-a');
    const b = await createLocalUser('blk-b');
    const c = await createLocalUser('blk-c');

    const blocked = await authFetch(base, a, '/friends/blocks', {
        method: 'POST', body: JSON.stringify({ targetId: b }),
    });
    assert.equal(blocked.status, 200);

    // 어느 방향이든 거부한다. 누가 차단했는지는 응답에 드러나지 않는다(같은 문구·같은 상태).
    await assert.rejects(() => friendService.sendFriendRequest(a, b), (error) => error.status === 403);
    await assert.rejects(() => friendService.sendFriendRequest(b, a), (error) => error.status === 403);
    assert.equal(await countRows(db.FriendRequest, {}), 0, '거부된 신청은 행을 만들지 않는다');

    // 차단 목록은 소유자만 본다.
    const mine = await (await authFetch(base, a, '/friends/blocks')).json();
    assert.deepEqual(mine.data.map((row) => row.id), [b]);
    assert.deepEqual((await (await authFetch(base, b, '/friends/blocks')).json()).data, []);

    // 제3자도, 차단당한 당사자도 이 차단을 지울 수 없다 — WHERE에 인증 owner가 강제된다.
    assert.equal((await authFetch(base, c, `/friends/blocks/${b}`, { method: 'DELETE' })).status, 404);
    assert.equal((await authFetch(base, b, `/friends/blocks/${b}`, { method: 'DELETE' })).status, 404);
    assert.equal(await countRows(db.FriendBlock, { owner_id: a, blocked_id: b }), 1);

    // 소유자 A만 해제할 수 있다.
    assert.equal((await authFetch(base, a, `/friends/blocks/${b}`, { method: 'DELETE' })).status, 200);
    assert.equal(await countRows(db.FriendBlock, { owner_id: a, blocked_id: b }), 0);

    // 해제 뒤에는 다시 신청할 수 있다.
    const request = await friendService.sendFriendRequest(a, b);
    assert.ok(Number.isInteger(request.id));
});

// ---------------------------------------------------------------------------
// AC-05 — 차단 무효화와 보존 경계
// ---------------------------------------------------------------------------

test('AC-05: 차단은 PENDING 요청·초대만 무효화하고 친구 관계·즐겨찾기 원본은 보존한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const base = await startRouteServer(t);

    const a = await createLocalUser('inv-a');
    const b = await createLocalUser('inv-b');
    const c = await createLocalUser('inv-c');

    await befriend(a, b);
    await befriend(a, c);
    await friendService.setFriendFavorite(a, b, true);

    // A가 대기방에서 B를 초대한다.
    placeInRoom(a, 'room-invalidate');
    await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'key-1' });

    // C→A로 아직 처리되지 않은 친구 요청도 하나 둔다(다른 계정쌍은 영향을 받으면 안 된다).
    const unrelated = await friendService.sendFriendRequest(c, b);

    const friendshipsBefore = await countRows(db.Friendship, {});
    assert.equal(await countRows(db.GameInvite, { status: 'PENDING' }), 1);

    // A가 B를 차단한다.
    await authFetch(base, a, '/friends/blocks', { method: 'POST', body: JSON.stringify({ targetId: b }) });

    // 초대는 CANCELLED + 사유 + revision 상승. 행은 지워지지 않는다.
    const invite = await db.GameInvite.findOne({ where: { sender_id: a, receiver_id: b } });
    assert.equal(invite.status, 'CANCELLED');
    assert.equal(invite.end_reason, 'BLOCKED');
    assert.equal(invite.revision, 2);

    // 친구 관계 행과 즐겨찾기 원본은 그대로다.
    assert.equal(await countRows(db.Friendship, {}), friendshipsBefore);
    assert.equal(await countRows(db.FriendFavorite, { owner_id: a, friend_id: b }), 1);

    // 다른 계정쌍(C→B)의 PENDING 요청은 건드리지 않는다.
    await unrelated.reload();
    assert.equal(unrelated.status, 'PENDING');

    // 차단 중에는 일반 친구 목록에서 상대가 빠진다(관계는 살아 있지만 표시하지 않는다).
    const duringBlock = await (await authFetch(base, a, '/friends')).json();
    assert.deepEqual(duringBlock.data.map((friend) => friend.id), [c]);

    // 차단 관계에서는 기존 초대의 수락도 거부된다.
    await assert.rejects(
        () => gameInviteService.recordAcceptDecision({
            receiverId: b, inviteId: invite.id, attemptId: 'attempt-blocked', bootEpoch: roomAccess.bootEpoch,
        }),
        (error) => error.status === 409 || error.status === 403,
    );

    // 해제해도 CANCELLED는 되살아나지 않고, 친구 관계만 다시 보인다.
    await authFetch(base, a, `/friends/blocks/${b}`, { method: 'DELETE' });
    await invite.reload();
    assert.equal(invite.status, 'CANCELLED', '해제만으로 초대가 PENDING으로 돌아오면 안 된다');
    assert.equal(await countRows(db.GameInvite, { status: 'PENDING' }), 0);

    const afterUnblock = await (await authFetch(base, a, '/friends')).json();
    assert.deepEqual(afterUnblock.data.map((friend) => friend.id).sort(), [b, c].sort());
    assert.equal(afterUnblock.data.find((friend) => friend.id === b).isFavorite, true);
});

test('AC-05: 차단은 PENDING 친구 요청을 CANCELLED로 확정하고 행을 지우지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();
    const base = await startRouteServer(t);

    const a = await createLocalUser('req-a');
    const b = await createLocalUser('req-b');

    const pending = await friendService.sendFriendRequest(b, a);
    assert.equal(await countRows(db.FriendRequest, { status: 'PENDING' }), 1);

    await authFetch(base, a, '/friends/blocks', { method: 'POST', body: JSON.stringify({ targetId: b }) });

    await pending.reload();
    assert.equal(pending.status, 'CANCELLED');
    assert.ok(pending.responded_at !== null);
    assert.equal(await countRows(db.FriendRequest, {}), 1, '이력 행은 보존한다');

    // 해제 후에도 CANCELLED 그대로 — 처리 버튼이 되살아나지 않는다.
    await authFetch(base, a, `/friends/blocks/${b}`, { method: 'DELETE' });
    await pending.reload();
    assert.equal(pending.status, 'CANCELLED');
    assert.equal(await countRows(db.FriendRequest, { status: 'PENDING' }), 0);
});

// ---------------------------------------------------------------------------
// AC-06 / AC-07 — 초대 생성·멱등·알림·커서
// ---------------------------------------------------------------------------

test('AC-06/AC-07: 초대 생성은 행·알림·신규 사건을 하나씩 만들고 같은 키 재시도는 늘리지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('crt-a');
    const b = await createLocalUser('crt-b');
    await befriend(a, b);
    placeInRoom(a, 'room-create');

    emitted = [];
    const first = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'key-idem' });
    assert.equal(first.created, true);

    // 초대 payload에는 **수락 전 방 코드·방 id가 없다**(AC-06).
    assert.equal(Object.hasOwn(first.invite, 'roomId'), false);
    assert.equal(Object.hasOwn(first.invite, 'roomCode'), false);
    assert.equal(first.invite.receiverId, b);
    assert.equal(first.invite.status, 'PENDING');
    assert.equal(typeof first.invite.creationSeq, 'string', 'BIGINT 순번은 문자열로 나가야 한다');

    // 초대 행과 알림 행이 같은 트랜잭션에서 함께 확정됐다.
    assert.equal(await countRows(db.GameInvite, {}), 1);
    const notification = await db.Notification.findOne({ where: { user_id: b } });
    assert.equal(notification.type, 'game-invite');
    assert.equal(notification.source_key, notificationService.gameInviteSourceKey(first.invite.inviteId));
    assert.deepEqual(notification.target, { kind: 'game-invite', inviteId: first.invite.inviteId });

    // 신규 수신 사건은 한 번. notification_created에는 초대 sfxEvent를 싣지 않는다(A-06).
    const received = eventsNamed('game_invite_received');
    assert.equal(received.length, 1);
    assert.equal(received[0].userId, b);
    assert.equal(received[0].payload.sfxEvent.kind, 'game-invite');
    assert.equal(received[0].payload.sfxEvent.accountId, b);
    assert.equal(
        received[0].payload.sfxEvent.eventId,
        notificationService.gameInviteSourceKey(first.invite.inviteId),
    );
    const created = eventsNamed('notification_created');
    assert.equal(created.length, 1);
    assert.equal(Object.hasOwn(created[0].payload, 'sfxEvent'), false, '초대 알림에는 소리 봉투가 없다');

    // 같은 생성 키의 재시도 — 같은 행을 돌려주고 아무 사건도 다시 만들지 않는다.
    emitted = [];
    const retry = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'key-idem' });
    assert.equal(retry.created, false);
    assert.equal(retry.invite.inviteId, first.invite.inviteId);
    assert.equal(await countRows(db.GameInvite, {}), 1);
    assert.equal(await countRows(db.Notification, { user_id: b }), 1);
    assert.equal(emitted.length, 0, '재시도는 신규 수신 사건을 재발행하지 않는다');
});

test('AC-06: 같은 생성 키에 다른 대상을 실어 보내면 충돌이다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('key-a');
    const b = await createLocalUser('key-b');
    const c = await createLocalUser('key-c');
    await befriend(a, b);
    await befriend(a, c);
    placeInRoom(a, 'room-key');

    await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'same-key' });

    await assert.rejects(
        () => gameInviteService.createInvite({ senderId: a, receiverId: c, creationKey: 'same-key' }),
        (error) => error.status === 409,
    );
    assert.equal(await countRows(db.GameInvite, {}), 1);
});

test('AC-04/AC-06: 친구가 아니거나 차단 관계면 초대가 만들어지지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('den-a');
    const b = await createLocalUser('den-b');
    const stranger = await createLocalUser('den-s');
    await befriend(a, b);
    placeInRoom(a, 'room-deny');

    // 친구가 아닌 계정.
    await assert.rejects(
        () => gameInviteService.createInvite({ senderId: a, receiverId: stranger, creationKey: 'k1' }),
        (error) => error.status === 403,
    );

    // 차단 관계(반대 방향 차단이어도 막는다).
    await friendService.blockUser(b, a);
    await assert.rejects(
        () => gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'k2' }),
        (error) => error.status === 403,
    );

    assert.equal(await countRows(db.GameInvite, {}), 0);
});

test('AC-06: 발송자에게 현재 방이 없으면 초대를 만들지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('nor-a');
    const b = await createLocalUser('nor-b');
    await befriend(a, b);
    // placeInRoom을 부르지 않는다 — registry가 이 계정의 방을 모른다.

    await assert.rejects(
        () => gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'k' }),
        (error) => error.status === 409,
    );
    assert.equal(await countRows(db.GameInvite, {}), 0);
});

test('AC-07: snapshot 커서는 종료된 초대까지 포함한 최대 순번이다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('cur-a');
    const b = await createLocalUser('cur-b');
    await befriend(a, b);
    placeInRoom(a, 'room-cursor');

    const first = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'c1' });
    const second = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'c2' });

    // 두 번째를 거절해 종료시킨다.
    await gameInviteService.declineInvite(b, second.invite.inviteId);

    const snapshot = await gameInviteService.getReceiverSnapshot(b);
    assert.deepEqual(snapshot.invites.map((row) => row.inviteId), [first.invite.inviteId],
        'PENDING만 목록에 남는다');
    assert.equal(
        snapshot.cursor, second.invite.creationSeq,
        '커서는 종료된 초대까지 포함한 전체 최대 순번이어야 한다 — PENDING 최댓값이면 끝난 초대가 새 사건으로 오인된다',
    );
    assert.equal(gameInviteService.compareSeq(snapshot.cursor, first.invite.creationSeq) > 0, true);

    // 제3자는 이 초대의 존재조차 알 수 없다.
    const outsider = await createLocalUser('cur-c');
    await assert.rejects(
        () => gameInviteService.getInviteForUser(outsider, first.invite.inviteId),
        (error) => error.status === 404,
    );
});

test('AC-06: 만료는 서버 시각으로 조회 경계에서 멱등하게 확정된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('exp-a');
    const b = await createLocalUser('exp-b');
    await befriend(a, b);
    placeInRoom(a, 'room-expire');

    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'e1' });

    // 서버 시각만 앞당긴다(클라이언트 시계는 어디에도 쓰이지 않는다).
    clockMs += gameInviteService.INVITE_TTL_MS + 1000;

    const snapshot = await gameInviteService.getReceiverSnapshot(b);
    assert.deepEqual(snapshot.invites, [], '만료된 초대는 목록에서 빠진다');

    const row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.status, 'EXPIRED');
    assert.equal(row.end_reason, 'EXPIRED');
    assert.equal(row.revision, 2, '만료 확정도 revision을 올린다');

    // 다시 조회해도 한 번 더 바뀌지 않는다(멱등).
    await gameInviteService.getReceiverSnapshot(b);
    await row.reload();
    assert.equal(row.revision, 2);

    // 만료된 초대는 수락 결정으로 넘어가지 않는다.
    await assert.rejects(
        () => gameInviteService.recordAcceptDecision({
            receiverId: b, inviteId: invite.inviteId, attemptId: 'a1', bootEpoch: roomAccess.bootEpoch,
        }),
        (error) => error.status === 409,
    );
});

test('AC-06: 거절은 멱등이고 이미 수락된 초대를 뒤집지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('dec-a');
    const b = await createLocalUser('dec-b');
    await befriend(a, b);
    placeInRoom(a, 'room-decline');

    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'd1' });

    const declined = await gameInviteService.declineInvite(b, invite.inviteId);
    assert.equal(declined.status, 'DECLINED');
    assert.equal(declined.revision, 2);

    // 응답 유실 후 다시 눌러도 오류가 아니라 현재 상태를 그대로 돌려준다.
    const again = await gameInviteService.declineInvite(b, invite.inviteId);
    assert.equal(again.status, 'DECLINED');
    assert.equal(again.revision, 2, '멱등 거절이 revision을 더 올리면 안 된다');

    // 발송자는 남의 초대를 거절할 수 없다.
    await assert.rejects(
        () => gameInviteService.declineInvite(a, invite.inviteId),
        (error) => error.status === 404,
    );
});

// ---------------------------------------------------------------------------
// AC-06 · A-10 — 수락 결정과 publication 영수증은 서로 다른 사실이다
// ---------------------------------------------------------------------------

test('A-10: 수락 결정과 영수증이 두 단계로 확정된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('acc-a');
    const b = await createLocalUser('acc-b');
    await befriend(a, b);
    placeInRoom(a, 'room-accept');

    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'acc' });

    const decision = await gameInviteService.recordAcceptDecision({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-1', bootEpoch: roomAccess.bootEpoch,
    });
    assert.equal(decision.ok, true);
    assert.equal(decision.roomId, 'room-accept');

    // 1단계 직후: 역사적 결정은 durable하지만 **입장은 아직 없다**.
    let row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.status, 'ACCEPTED');
    assert.equal(row.attempt_id, 'attempt-1');
    assert.equal(row.entry_outcome, 'UNCONFIRMED');

    // 같은 시도의 재조회는 성공으로 이어간다(응답 유실 재시도).
    const resumed = await gameInviteService.recordAcceptDecision({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-1', bootEpoch: roomAccess.bootEpoch,
    });
    assert.equal(resumed.resumed, true);

    // 2단계: publish()가 성공해야만 PUBLISHED가 된다.
    let publishCalls = 0;
    const finalized = await gameInviteService.finalizeAcceptedEntry({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-1', bootEpoch: roomAccess.bootEpoch,
        publish: () => { publishCalls += 1; return { ok: true }; },
        unpublish: () => { assert.fail('성공 경로에서 보상이 불려서는 안 된다'); },
    });
    assert.equal(finalized.ok, true);
    assert.equal(publishCalls, 1);

    row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.entry_outcome, 'PUBLISHED');

    // 결과 재조회는 durable 상태만 돌려준다 — 현재 소속 판정은 호출자(matchmaking)의 몫이다.
    const outcome = await gameInviteService.getAttemptOutcome({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-1',
    });
    assert.equal(outcome.entryOutcome, 'PUBLISHED');
    assert.equal(outcome.roomId, 'room-accept');
    assert.equal(outcome.bootEpoch, roomAccess.bootEpoch);

    // 다른 시도 id로 물으면 입장을 주장하지 않는다.
    const stale = await gameInviteService.getAttemptOutcome({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-other',
    });
    assert.equal(stale.staleAttempt, true);

    // 확정된 영수증은 보상으로 덮이지 않는다(PUBLISHED는 역사다).
    assert.equal(
        await gameInviteService.recordEntryInterrupted({
            inviteId: invite.inviteId, attemptId: 'attempt-1', reason: 'LATE',
        }),
        false,
    );
    row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.entry_outcome, 'PUBLISHED');
});

test('A-10/상태표 5: 두 번째 잠금 전에 차단이 커밋되면 역사적 ACCEPTED는 남고 입장만 INTERRUPTED다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('int-a');
    const b = await createLocalUser('int-b');
    await befriend(a, b);
    placeInRoom(a, 'room-interrupt');

    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'int' });
    await gameInviteService.recordAcceptDecision({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-int', bootEpoch: roomAccess.bootEpoch,
    });

    // 결정과 확정 사이에 차단이 커밋된다.
    await friendService.blockUser(a, b);

    let publishCalls = 0;
    const finalized = await gameInviteService.finalizeAcceptedEntry({
        receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-int', bootEpoch: roomAccess.bootEpoch,
        publish: () => { publishCalls += 1; return { ok: true }; },
        unpublish: () => {},
    });

    assert.equal(finalized.ok, false);
    assert.equal(finalized.code, 'BLOCKED');
    assert.equal(publishCalls, 0, '차단이 확인되면 Map publication 자체가 일어나지 않는다');

    const row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.status, 'ACCEPTED', '역사적 수락 결정은 되돌리지 않는다');
    assert.equal(row.entry_outcome, 'INTERRUPTED');
    assert.equal(row.end_reason, 'BLOCKED_BEFORE_ENTRY');
});

test('A-11: 옛 boot epoch의 초대는 수락 결정 자체가 거부되고 CANCELLED로 확정된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('boot-a');
    const b = await createLocalUser('boot-b');
    await befriend(a, b);
    placeInRoom(a, 'room-boot');

    const { invite } = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'boot' });

    // 서버가 재시작됐다 — 옛 방 인스턴스는 복원되지 않는다.
    await assert.rejects(
        () => gameInviteService.recordAcceptDecision({
            receiverId: b, inviteId: invite.inviteId, attemptId: 'attempt-boot', bootEpoch: 'boot-different',
        }),
        (error) => error.status === 409 && error.code === 'SERVER_RESTARTED',
    );

    const row = await db.GameInvite.findOne({ where: { id: invite.inviteId } });
    assert.equal(row.status, 'CANCELLED');
    assert.equal(row.end_reason, 'SERVER_RESTARTED');
    assert.equal(row.entry_outcome, null, '입장 영수증은 만들어지지 않는다');
});

test('AC-06: 방이 사라지면 그 방의 PENDING 초대가 종료된다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const a = await createLocalUser('rm-a');
    const b = await createLocalUser('rm-b');
    const c = await createLocalUser('rm-c');
    await befriend(a, b);
    await befriend(a, c);
    placeInRoom(a, 'room-gone');

    const gone = await gameInviteService.createInvite({ senderId: a, receiverId: b, creationKey: 'g1' });

    // 다른 방의 초대는 영향을 받지 않아야 한다.
    placeInRoom(a, 'room-alive');
    const alive = await gameInviteService.createInvite({ senderId: a, receiverId: c, creationKey: 'g2' });

    emitted = [];
    const cancelled = await gameInviteService.cancelPendingInvitesForRoom('room-gone', 'ROOM_DELETED');
    assert.deepEqual(cancelled, [gone.invite.inviteId]);

    const goneRow = await db.GameInvite.findOne({ where: { id: gone.invite.inviteId } });
    assert.equal(goneRow.status, 'CANCELLED');
    assert.equal(goneRow.end_reason, 'ROOM_DELETED');

    const aliveRow = await db.GameInvite.findOne({ where: { id: alive.invite.inviteId } });
    assert.equal(aliveRow.status, 'PENDING');

    // 상태 변경 통지에는 소리 봉투가 없다(신규 수신이 아니다).
    const updates = eventsNamed('game_invite_updated');
    assert.ok(updates.length > 0);
    for (const update of updates) {
        assert.equal(Object.hasOwn(update.payload, 'sfxEvent'), false);
    }
    assert.equal(eventsNamed('game_invite_received').length, 0);
});
