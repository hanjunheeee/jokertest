'use strict';

// 남의 것에 손대기 시험(시험 DB) — B에게 온 판 초대를 A가 수락하면 거절, A는 방에 안 들어가고 그 뒤 B 수락은 됨
// 목록 A15-B-166 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
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

// 시험마다 새 사람
async function createUser(label) {
    const uuid = crypto.randomUUID();
    await db.User.create({
        uuid,
        password_hash: 'not-a-real-hash',
        nickname: `${label}${uuid.slice(0, 4)}`.slice(0, 8),
        email: `${label}-${uuid}@example.test`,
    });
    return uuid;
}

// 대기방 세상: 가짜 소켓·io, 방 장부는 메모리, 초대는 진짜 서비스(진짜 DB)
function makeWorld(t) {
    matchmaking.__resetStateForTests();
    mf.installFakeMatchmakingDeps(matchmaking, { gameInviteService: inviteService });
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    const sockets = new Map();
    t.after(() => {
        matchmaking.__resetStateForTests();
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
    // 초대 만들기 (HTTP 컨트롤러 길)
    const createInvite = async (senderId, receiverId) => {
        let status = null;
        let body = null;
        let error = null;
        const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; }, set() { return this; } };
        await inviteController.createInvite({ user: { uuid: senderId }, body: { receiverId, creationKey: crypto.randomUUID() } }, res, (err) => { error = err; });
        return { status: error ? (error.status ?? 500) : status, invite: body?.data, error };
    };
    const currentRoom = async (uuid) => (await send(uuid, 'get_current_room', {})).room;
    return { connect, send, createInvite, currentRoom };
}

test('A15-B-166 B에게 온 판 초대 id로 A가 accept_game_invite → ok:false(없는 초대와 같은 답), A 방 입장 없음, 그 뒤 B 수락은 됨', async (t) => {
    if (noDb(t)) return;
    const w = makeWorld(t);
    const host = await createUser('h166');
    const friendB = await createUser('b166');
    const strangerA = await createUser('a166');
    await db.Friendship.create({ requester_id: host, receiver_id: friendB, status: 'ACCEPTED' });
    for (const uuid of [host, friendB, strangerA]) w.connect(uuid);
    const created = await w.send(host, 'create_room', {
        accessType: 'code', maxPlayers: 6, jokerCount: 1, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60,
    });
    assert.equal(created.ok, true, `준비: 방 만들기 실패 ${created.message}`);
    const made = await w.createInvite(host, friendB);
    assert.equal(made.status, 201, `준비: 초대 실패 ${made.error?.message}`);

    const stolen = await w.send(strangerA, 'accept_game_invite', { inviteId: made.invite.inviteId });
    const unknown = await w.send(strangerA, 'accept_game_invite', { inviteId: crypto.randomUUID() });
    assert.equal(stolen.ok, false);
    assert.match(String(stolen.code), /NOT_FOUND/);
    assert.deepEqual({ code: stolen.code, message: stolen.message }, { code: unknown.code, message: unknown.message }, '없는 초대와 답이 다름');
    assert.equal(await w.currentRoom(strangerA), null, 'A가 방에 들어감');

    const accepted = await w.send(friendB, 'accept_game_invite', { inviteId: made.invite.inviteId });
    assert.equal(accepted.ok, true, `B 수락 실패: ${accepted.code} ${accepted.message}`);
    assert.equal((await w.currentRoom(friendB))?.roomId, created.room.roomId);
});
