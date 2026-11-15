'use strict';

// 친구 초대 DB 시험 — 시험 DB에 초대 행을 진짜로 쓰고 읽음: 친구 아님·차단·정지 계정 거절, 초대 행·알림 행, 3분 경계, 거절한 초대, 같은 만들기 키, 입장 결과, 방 삭제로 취소
// 목록 A01-B-701~710 (docs/게임_의도_2026-11-15/시험목록/A01b-입장-준비-추방-초대.md "백엔드 — DB")
// 돌리기(저장소 쪽 잠금으로 한 줄 세움): AGENT_NAME=<이름> bash ../tools/시험도구/with-lock.sh testdb node --env-file=.env.test --env-file=.env.testdb --test --test-concurrency=1 tests/db/a01b-invite.integration.test.js
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
const db = require('../../models');
const matchmaking = require('../../socket/matchmaking');
const mf = require('../helpers/matchmakingFixtures');
const inviteService = require('../../services/friend/gameInvite');
const inviteController = require('../../controllers/friend/invites');

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
    await db.sequelize.close();
});

// 비동기 꼬리 흘려보내기
const flush = async (times = 8) => {
    for (let i = 0; i < times; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

// 시험마다 새 사람 (uuid가 달라 같은 파일 시험끼리 안 섞임)
async function createUser(label, { status = 'ACTIVE' } = {}) {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: 'not-a-real-hash',
        nickname: `${label}${uuid.slice(0, 4)}`.slice(0, 8),
        email: `${label}-${uuid}@example.test`,
        status,
    });
    return uuid;
}

// 두 사람 친구 맺기
const befriend = (a, b) => db.Friendship.create({ requester_id: a, receiver_id: b, status: 'ACCEPTED' });

// 대기방 세상: 가짜 소켓·io, 방 쪽 장부는 메모리, 초대는 진짜 서비스(진짜 DB)
function makeWorld(t, { now = null } = {}) {
    matchmaking.__resetStateForTests();
    mf.installFakeMatchmakingDeps(matchmaking, { gameInviteService: inviteService });
    // 초대 시각만 바꿔 끼움 (3분 경계), DB는 진짜
    if (now) inviteService.__internal.__setDepsForTests({ now: () => new Date(now.value) });
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    const sockets = new Map();
    t.after(() => {
        matchmaking.__resetStateForTests();
        inviteService.__internal.__setDepsForTests(null);
        matchmaking.__setGameInviteServiceForTests(null);
        matchmaking.__setUserRepositoryForTests(null);
        matchmaking.__setEconomyServiceForTests(null);
        matchmaking.__setGameResultRepositoryForTests(null);
    });
    const connect = (uuid) => {
        const s = mf.createFakeSocket(uuid, { id: `sock-${uuid}` });
        io.sockets.sockets.set(s.id, s);
        registry.set(uuid, s.id);
        sockets.set(uuid, s);
        matchmaking.registerMatchmakingHandlers(io, s, uuid, { getCurrentSocketId: (u) => registry.get(u) });
        return s;
    };
    const send = async (uuid, event, payload) => {
        const reply = await new Promise((resolve) => sockets.get(uuid).trigger(event, payload, resolve));
        await flush();
        return reply;
    };
    // 방 만들기 → 손님 코드 입장
    async function openRoom(host, guests, maxPlayers) {
        for (const uuid of [host, ...guests]) connect(uuid);
        const created = await send(host, 'create_room', {
            accessType: 'code', maxPlayers, jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60,
        });
        assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
        for (const uuid of guests) {
            sockets.get(uuid).trigger('join_room_by_code', { roomCode: created.room.roomCode });
            await flush();
        }
        return created.room;
    }
    // 초대 만들기 (HTTP 컨트롤러 길): { status, invite } 또는 { status, error }
    async function createInvite(senderId, receiverId, creationKey = crypto.randomUUID()) {
        let status = null;
        let body = null;
        let error = null;
        const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; }, set() { return this; } };
        await inviteController.createInvite({ user: { uuid: senderId }, body: { receiverId, creationKey } }, res, (err) => { error = err; });
        return error ? { status: error.status ?? 500, error } : { status, invite: body?.data };
    }
    const currentRoom = async (uuid) => (await send(uuid, 'get_current_room', {})).room;
    const inviteRows = (senderId, receiverId) => db.GameInvite.findAll({ where: { sender_id: senderId, receiver_id: receiverId }, raw: true });
    return { io, connect, send, openRoom, createInvite, currentRoom, inviteRows };
}

test('A01-B-701 정원 6, 친구 사이 아닌 사람 초대 → 403 "친구만 게임에 초대할 수 있습니다.", 초대 행 0', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const host = await createUser('h701');
    const other = await createUser('o701');
    await w.openRoom(host, [], 6);
    w.connect(other);
    const made = await w.createInvite(host, other);
    assert.equal(made.status, 403);
    assert.equal(made.error.message, '친구만 게임에 초대할 수 있습니다.');
    assert.equal((await w.inviteRows(host, other)).length, 0);
});

test('A01-B-702 한쪽이 차단 → 403 "차단된 사용자에게는 게임 초대를 보낼 수 없습니다.", 행 0', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const host = await createUser('h702');
    const friend = await createUser('f702');
    await befriend(host, friend);
    await db.FriendBlock.create({ owner_id: friend, blocked_id: host });
    await w.openRoom(host, [], 6);
    w.connect(friend);
    const made = await w.createInvite(host, friend);
    assert.equal(made.status, 403);
    assert.equal(made.error.message, '차단된 사용자에게는 게임 초대를 보낼 수 없습니다.');
    assert.equal((await w.inviteRows(host, friend)).length, 0);
});

test('A01-B-703 받는 사람이 정지 계정 → 403 "초대할 수 없는 계정입니다."', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const host = await createUser('h703');
    const friend = await createUser('f703', { status: 'SUSPENDED' });
    await befriend(host, friend);
    await w.openRoom(host, [], 6);
    const made = await w.createInvite(host, friend);
    assert.equal(made.status, 403);
    assert.equal(made.error.message, '초대할 수 없는 계정입니다.');
    assert.equal((await w.inviteRows(host, friend)).length, 0);
});

test('A01-B-704 정원 7, 초대 → 초대 행 PENDING, 끝 시각 = 만든 시각 + 3분, 받는 사람 알림 행 1줄', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const host = await createUser('h704');
    const friend = await createUser('f704');
    await befriend(host, friend);
    await w.openRoom(host, [], 7);
    w.connect(friend);
    const made = await w.createInvite(host, friend);
    assert.equal(made.status, 201, made.error?.message);
    const rows = await w.inviteRows(host, friend);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'PENDING');
    assert.equal(new Date(rows[0].expires_at).getTime() - new Date(rows[0].created_at).getTime(), 3 * 60_000);
    assert.equal(await db.Notification.count({ where: { user_id: friend } }), 1);
});

// A01-B-705~706 3분 경계 (초대 시각만 가짜)
for (const [no, afterMs, label] of [['A01-B-705', 2 * 60_000 + 59_000, '2분 59초'], ['A01-B-706', 3 * 60_000, '3분 0초']]) {
    const accepted = afterMs < 3 * 60_000;
    test(`${no} 정원 7, ${label}에 수락 → 행 ${accepted ? 'ACCEPTED, 방 들어감' : 'EXPIRED, 답 "이미 처리된 초대입니다.", 방 안 들어감'}`, async (t) => {
        if (noDb(t)) return;
        // DB 시각은 초 단위로 저장될 수 있어 초에 맞춘 시각에서 시작
        const now = { value: Math.floor(Date.now() / 1000) * 1000 };
        const w = makeWorld(t, { now });
        const host = await createUser(`h${no.slice(6)}`);
        const friend = await createUser(`f${no.slice(6)}`);
        await befriend(host, friend);
        const room = await w.openRoom(host, [], 7);
        w.connect(friend);
        const made = await w.createInvite(host, friend);
        assert.equal(made.status, 201, made.error?.message);
        now.value += afterMs;
        const reply = await w.send(friend, 'accept_game_invite', { inviteId: made.invite.inviteId });
        const [row] = await w.inviteRows(host, friend);
        if (accepted) {
            assert.equal(reply.ok, true, `수락 실패: ${reply.code} ${reply.message}`);
            assert.equal(row.status, 'ACCEPTED');
            assert.equal((await w.currentRoom(friend))?.roomId, room.roomId);
        } else {
            assert.equal(reply.ok, false);
            assert.equal(reply.message, '이미 처리된 초대입니다.');
            assert.equal(row.status, 'EXPIRED');
            assert.equal(await w.currentRoom(friend), null);
        }
    });
}

test('A01-B-707 거절(DECLINED)한 초대를 수락 → "이미 처리된 초대입니다."', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const host = await createUser('h707');
    const friend = await createUser('f707');
    await befriend(host, friend);
    await w.openRoom(host, [], 6);
    w.connect(friend);
    const made = await w.createInvite(host, friend);
    assert.equal(made.status, 201, made.error?.message);
    const declined = await inviteService.declineInvite(friend, made.invite.inviteId);
    assert.equal(declined.status, 'DECLINED');
    const reply = await w.send(friend, 'accept_game_invite', { inviteId: made.invite.inviteId });
    assert.equal(reply.ok, false);
    assert.equal(reply.message, '이미 처리된 초대입니다.');
    assert.equal(await w.currentRoom(friend), null);
});

test('A01-B-708 같은 만들기 키로 두 번 → 초대 행 1줄, 두 번째 답이 첫 초대', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const host = await createUser('h708');
    const friend = await createUser('f708');
    await befriend(host, friend);
    await w.openRoom(host, [], 6);
    w.connect(friend);
    const key = `key-${crypto.randomUUID()}`;
    const first = await w.createInvite(host, friend, key);
    const second = await w.createInvite(host, friend, key);
    assert.equal(first.status, 201, first.error?.message);
    assert.ok(second.invite, second.error?.message);
    assert.equal(second.invite.inviteId, first.invite.inviteId);
    assert.equal((await w.inviteRows(host, friend)).length, 1);
});

test('A01-B-709 정원 6, 수락 성공 → 행 입장 결과 PUBLISHED', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const host = await createUser('h709');
    const friend = await createUser('f709');
    await befriend(host, friend);
    await w.openRoom(host, [], 6);
    w.connect(friend);
    const made = await w.createInvite(host, friend);
    assert.equal(made.status, 201, made.error?.message);
    const reply = await w.send(friend, 'accept_game_invite', { inviteId: made.invite.inviteId });
    assert.equal(reply.ok, true, `수락 실패: ${reply.code} ${reply.message}`);
    const [row] = await w.inviteRows(host, friend);
    assert.equal(row.entry_outcome, 'PUBLISHED');
});

test('A01-B-710 정원 6, 초대 뒤 방 삭제 → 행 CANCELLED', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const host = await createUser('h710');
    const friend = await createUser('f710');
    await befriend(host, friend);
    await w.openRoom(host, [], 6);
    w.connect(friend);
    const made = await w.createInvite(host, friend);
    assert.equal(made.status, 201, made.error?.message);
    const deleted = await w.send(host, 'delete_room', {});
    assert.equal(deleted.ok, true);
    // 방 초대 취소는 안 기다리고 돎 → 행이 바뀔 때까지 짧게 봄 (최대 2초)
    let row = null;
    for (let i = 0; i < 40; i += 1) {
        [row] = await w.inviteRows(host, friend);
        if (row.status !== 'PENDING') break;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(row.status, 'CANCELLED');
});
