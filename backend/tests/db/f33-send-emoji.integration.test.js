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
const addEmojiPalettes = require('../../db/migrations/0019-add-emoji-palettes');
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');

const { MIGRATIONS } = require('../../scripts/migrate-db');
const { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER } = buildManagedSchema({
    baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner,
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
const economyService = require('../../services/economy');
const gameSessionCore = require('../../game-core/gameSession');
const gameSessionSocketLayer = require('../../socket/gameSession');
const matchmaking = require('../../socket/matchmaking');
const { hashPassword } = require('../../utils/auth/credentials');

const {
    callAsPromise, createFakeSocket, createFakeIo, validSettingsPayload, readyPayload, startPayload,
} = require('../helpers/matchmakingFixtures');

const { handleSendEmoji } = gameSessionSocketLayer.__testables;
const { handleCreateRoom, handleJoinRoomByCode, handleSetReady, handleStartGame } = matchmaking.__testables;

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

const DEFAULT_SLOTS = [
    'emoji-basic-reject', 'emoji-basic-tears', 'emoji-basic-anger', 'emoji-basic-love',
    'emoji-basic-grin', 'emoji-basic-hello', 'emoji-basic-surrender', 'emoji-basic-dizzy',
];
const IN_PALETTE_ITEM = DEFAULT_SLOTS[0];
const UNOWNED_ITEM = 'emoji-vote-time';
const OWNED_BUT_UNPLACED_ITEM = 'emoji-shush';

const conventionSocketId = (uuid) => `sock-${uuid}`;

function createConventionFollowingRegistry() {
    const overrides = new Map();
    return new Proxy(overrides, {
        get(target, prop, receiver) {
            if (prop === 'get') return (uuid) => (target.has(uuid) ? target.get(uuid) : conventionSocketId(uuid));
            return Reflect.get(target, prop, receiver);
        },
    });
}

const setUp = async () => {
    await resetManagedSchema(sequelize, TEST_DB_URL, { managedTables: MANAGED_TABLES, dropOrder: DROP_ORDER });
    await migrationRunner.applyMigrations({ sequelize, migrations: MIGRATIONS });
    await addEmojiPalettes.verify(sequelize.getQueryInterface());
    gameSessionCore.__resetStateForTests();
    matchmaking.__resetStateForTests();
    gameSessionSocketLayer.__resetStateForTests();
    gameSessionSocketLayer.setOnlineUsersRegistry(createConventionFollowingRegistry());
    matchmaking.__setGameInviteServiceForTests({ cancelPendingInvitesForRoom: async () => {} });
};

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
    return uuid;
};

const grantEmoticon = async (userId, itemId) => {
    await economyService.grantAchievementItem({
        userId, itemId, itemType: 'EMOTICON', referenceEventId: `f33e3-grant:${userId}:${itemId}`,
    });
};

const startRealGame = async (label, playerCount, beforeStart = null) => {
    const uuids = [];
    for (let index = 0; index < playerCount; index += 1) {
        uuids.push(await createLocalUser(`${label}${index}`));
    }
    if (beforeStart) {
        for (const [index, uuid] of uuids.entries()) await beforeStart(uuid, index);
    }

    const io = createFakeIo();
    const sockets = new Map();
    for (const uuid of uuids) {
        const socket = createFakeSocket(uuid);
        io.sockets.sockets.set(socket.id, socket);
        sockets.set(uuid, socket);
    }

    const [hostUuid, ...others] = uuids;
    const created = await callAsPromise(
        handleCreateRoom, io, sockets.get(hostUuid), hostUuid,
        validSettingsPayload({ maxPlayers: 4, jokerCount: 1 }),
    );
    assert.equal(created.ok, true, `방 생성 실패: ${JSON.stringify(created)}`);
    for (const uuid of others) {
        await handleJoinRoomByCode(io, sockets.get(uuid), uuid, created.room.roomCode);
    }
    for (const uuid of uuids) {
        const ready = await callAsPromise(handleSetReady, io, sockets.get(uuid), uuid, readyPayload(created.room));
        assert.equal(ready.ok, true, `준비 실패: ${JSON.stringify(ready)}`);
    }

    const started = await new Promise((resolve) => handleStartGame(
        io, sockets.get(hostUuid), hostUuid, startPayload(created.room), resolve, conventionSocketId,
    ));
    assert.equal(started.ok, true, `게임 시작 실패: ${JSON.stringify(started)}`);

    const session = gameSessionCore.getActiveSessionForDeparture(hostUuid, started.gameId);
    assert.ok(session, '시작된 판의 세션을 registry에서 찾지 못했다');
    return { io, sockets, uuids, hostUuid, gameId: started.gameId, session };
};

const emojiReceipts = (sockets) => {
    const byUuid = new Map();
    let total = 0;
    for (const [uuid, socket] of sockets) {
        const count = socket.countReceived('emoji_shown');
        byUuid.set(uuid, count);
        total += count;
    }
    return { byUuid, total };
};

const sendEmoji = (io, socket, uuid, payload) => {
    let calls = 0;
    let response = null;
    handleSendEmoji(io, socket, uuid, payload, (result) => { calls += 1; response = result; });
    return { calls, response };
};

function withFixedClock(fixedNow, fn) {
    const originalNow = Date.now;
    Date.now = () => fixedNow;
    try {
        return fn();
    } finally {
        Date.now = originalNow;
    }
}

test('AC-01: send_emoji의 7종 거부 코드는 복합 실패에서도 검사 순서대로 이기고, 어느 실패도 방송·rate 상태를 바꾸지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    {
        const uuid = await createLocalUser('f33s1');
        const io = createFakeIo();
        const stale = createFakeSocket(uuid, { id: `sock-stale-${uuid}` });
        io.sockets.sockets.set(stale.id, stale);
        const { calls, response } = sendEmoji(io, stale, uuid, { gameId: 42, itemId: null });
        assert.equal(calls, 1);
        assert.equal(response.ok, false);
        assert.equal(response.code, 'STALE_SOCKET');
        assert.equal(stale.countReceived('emoji_shown'), 0);
    }

    for (const badPayload of [null, 'emoji', [], {}, { gameId: 'g', itemId: '' }, { gameId: '', itemId: 'i' }, { gameId: 'g' }]) {
        const uuid = await createLocalUser('f33s2');
        const io = createFakeIo();
        const socket = createFakeSocket(uuid);
        io.sockets.sockets.set(socket.id, socket);
        const { calls, response } = sendEmoji(io, socket, uuid, badPayload);
        assert.equal(calls, 1);
        assert.equal(response.code, 'INVALID_PAYLOAD', `payload=${JSON.stringify(badPayload)}`);
        assert.equal(socket.countReceived('emoji_shown'), 0);
    }

    {
        const { io, sockets, gameId, session } = await startRealGame('f33s3', 3);
        session.phase = 'ENDED';
        const outsider = await createLocalUser('f33s3x');
        const outsiderSocket = createFakeSocket(outsider);
        io.sockets.sockets.set(outsiderSocket.id, outsiderSocket);
        const { response } = sendEmoji(io, outsiderSocket, outsider, { gameId, itemId: IN_PALETTE_ITEM });
        assert.equal(response.code, 'NOT_PARTICIPANT');
        assert.equal(emojiReceipts(sockets).total, 0);
    }

    {
        const { io, sockets, hostUuid, gameId, session } = await startRealGame('f33s4', 3);
        session.phase = 'ENDED';
        session.emojiRateLimit.set(hostUuid, Date.now());
        const before = session.emojiRateLimit.get(hostUuid);
        const { response } = sendEmoji(io, sockets.get(hostUuid), hostUuid, { gameId, itemId: UNOWNED_ITEM });
        assert.equal(response.code, 'GAME_ENDED');
        assert.equal(session.emojiRateLimit.get(hostUuid), before, '거부는 rate 상태를 바꾸지 않는다');
        assert.equal(emojiReceipts(sockets).total, 0);
    }

    {
        const { io, sockets, hostUuid, gameId, session } = await startRealGame('f33s5', 3);
        const lastSentAt = Date.now();
        session.emojiRateLimit.set(hostUuid, lastSentAt);
        const { response } = withFixedClock(lastSentAt + 500, () =>
            sendEmoji(io, sockets.get(hostUuid), hostUuid, { gameId, itemId: UNOWNED_ITEM }));
        assert.equal(response.code, 'RATE_LIMITED');
        assert.equal(session.emojiRateLimit.get(hostUuid), lastSentAt, '거부는 rate 상태를 바꾸지 않는다');
        assert.equal(emojiReceipts(sockets).total, 0);
    }

    {
        const { io, sockets, hostUuid, gameId, session } = await startRealGame('f33s6', 3);
        assert.equal(session.emojiPaletteByUuid.get(hostUuid).owned.includes(UNOWNED_ITEM), false,
            '이 케이스는 "소유하지 않았다"가 DB의 사실일 때만 의미가 있다');
        const { response } = sendEmoji(io, sockets.get(hostUuid), hostUuid, { gameId, itemId: UNOWNED_ITEM });
        assert.equal(response.code, 'NOT_OWNED');
        assert.equal(session.emojiRateLimit.has(hostUuid), false, '거부는 rate 상태를 바꾸지 않는다');
        assert.equal(emojiReceipts(sockets).total, 0);
    }

    {
        const { io, sockets, hostUuid, gameId, session } = await startRealGame(
            'f33s7', 3, async (uuid, index) => { if (index === 0) await grantEmoticon(uuid, OWNED_BUT_UNPLACED_ITEM); },
        );
        const palette = session.emojiPaletteByUuid.get(hostUuid);
        assert.equal(palette.owned.includes(OWNED_BUT_UNPLACED_ITEM), true, '지급이 캡처에 반영되지 않았다');
        assert.equal(palette.slots.includes(OWNED_BUT_UNPLACED_ITEM), false, '기본 8칸에는 없어야 한다');
        const { response } = sendEmoji(io, sockets.get(hostUuid), hostUuid, { gameId, itemId: OWNED_BUT_UNPLACED_ITEM });
        assert.equal(response.code, 'NOT_IN_PALETTE');
        assert.equal(session.emojiRateLimit.has(hostUuid), false, '거부는 rate 상태를 바꾸지 않는다');
        assert.equal(emojiReceipts(sockets).total, 0);
    }
});

test('AC-01: 게임 시작이 실제 DB에서 캡처한 팔레트가 판정의 유일한 근거다(판 중간의 팔레트 변경은 그 판에 반영되지 않는다)', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const { io, sockets, hostUuid, gameId, session } = await startRealGame('f33cap', 3);

    const palette = session.emojiPaletteByUuid.get(hostUuid);
    assert.deepEqual(palette.slots, DEFAULT_SLOTS, '캡처한 배치가 DB 기본 배치와 다르다');
    assert.deepEqual([...palette.owned].sort(), [...DEFAULT_SLOTS].sort(), '캡처한 소유 목록이 기본 지급 8종과 다르다');

    const current = await economyService.getEmojiPalette(hostUuid);
    await economyService.saveEmojiPalette(hostUuid, {
        slots: Array(8).fill(null), expectedRevision: current.revision,
    });
    const afterSave = await economyService.getEmojiPalette(hostUuid);
    assert.deepEqual(afterSave.slots, Array(8).fill(null), 'DB 저장 자체가 실패하면 이 시험의 전제가 없다');

    const { response } = sendEmoji(io, sockets.get(hostUuid), hostUuid, { gameId, itemId: IN_PALETTE_ITEM });
    assert.equal(response.ok, true, `판 시작 때의 배치로 계속 판정해야 한다: ${JSON.stringify(response)}`);
    assert.equal(emojiReceipts(sockets).total, sockets.size);
});

test('AC-02: 1초 이내 재전송은 RATE_LIMITED이고, 간격을 지난 재전송은 다시 성공한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const { io, sockets, hostUuid, gameId, session } = await startRealGame('f33rl', 3);
    const hostSocket = sockets.get(hostUuid);

    const first = withFixedClock(10_000, () => sendEmoji(io, hostSocket, hostUuid, { gameId, itemId: IN_PALETTE_ITEM }));
    assert.equal(first.response.ok, true);
    assert.equal(first.response.sentAt, 10_000);
    assert.equal(session.emojiRateLimit.get(hostUuid), 10_000);
    assert.equal(emojiReceipts(sockets).total, sockets.size);

    const second = withFixedClock(10_500, () => sendEmoji(io, hostSocket, hostUuid, { gameId, itemId: IN_PALETTE_ITEM }));
    assert.equal(second.response.ok, false);
    assert.equal(second.response.code, 'RATE_LIMITED');
    assert.equal(session.emojiRateLimit.get(hostUuid), 10_000, '거부가 마지막 전송 시각을 밀어서는 안 된다');
    assert.equal(emojiReceipts(sockets).total, sockets.size);

    const third = withFixedClock(11_000, () => sendEmoji(io, hostSocket, hostUuid, { gameId, itemId: IN_PALETTE_ITEM }));
    assert.equal(third.response.ok, true, `경계(1000ms)는 허용이다: ${JSON.stringify(third.response)}`);
    assert.equal(session.emojiRateLimit.get(hostUuid), 11_000);
    assert.equal(emojiReceipts(sockets).total, sockets.size * 2);

    const otherUuid = [...sockets.keys()].find((uuid) => uuid !== hostUuid);
    const other = withFixedClock(11_100, () =>
        sendEmoji(io, sockets.get(otherUuid), otherUuid, { gameId, itemId: IN_PALETTE_ITEM }));
    assert.equal(other.response.ok, true);
    assert.equal(session.emojiRateLimit.get(otherUuid), 11_100);
});

test('AC-02: 성공한 send_emoji는 emoji_shown을 죽은 참가자까지 포함해 전원에게 1회 방송하고 이탈자는 제외한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const { io, sockets, hostUuid, gameId, session } = await startRealGame('f33bc', 4);
    const bystanders = [...sockets.keys()].filter((uuid) =>
        uuid !== hostUuid && session.players.get(uuid).role !== 'JOKER');
    assert.ok(bystanders.length >= 2, '광대가 아닌 비방장 참가자가 둘 이상이어야 이 시나리오를 만들 수 있다');
    const [leftUuid, deadUuid] = bystanders;

    const departed = gameSessionCore.commitParticipantDeparture(session, leftUuid, { reason: 'PARTICIPANT_LEFT' });
    assert.equal(departed.ok, true, JSON.stringify(departed));
    assert.equal(session.phase === 'ENDED', false, '이 이탈이 판을 끝내면 진행 중 방송을 볼 수 없다');
    assert.equal(sockets.get(leftUuid).rooms.has(session.channelId), true,
        '이탈자가 채널에서 이미 빠져 있으면 이 단언은 제외 로직을 보지 못한다');
    session.players.get(deadUuid).alive = false;

    const { response } = withFixedClock(20_000, () =>
        sendEmoji(io, sockets.get(hostUuid), hostUuid, { gameId, itemId: IN_PALETTE_ITEM }));

    assert.deepEqual(response, { ok: true, sentAt: 20_000 });

    const { byUuid, total } = emojiReceipts(sockets);
    assert.equal(byUuid.get(hostUuid), 1, '발신자도 자기 말풍선을 받아야 화면이 같은 사실을 그린다');
    assert.equal(byUuid.get(deadUuid), 1, '죽은 참가자도 받는다');
    assert.equal(byUuid.get(leftUuid), 0, '이탈자는 받지 않는다');
    assert.equal(total, sockets.size - 1, '남은 참가자 전원에게 정확히 한 번씩만 간다');

    const delivered = sockets.get(deadUuid).received.filter((entry) => entry.event === 'emoji_shown');
    assert.deepEqual(delivered[0].payload, {
        gameId: session.id, uuid: hostUuid, itemId: IN_PALETTE_ITEM, sentAt: 20_000,
    }, 'payload는 canonical 세션 값 4개뿐이다(역할·생존·소유 목록은 실리지 않는다)');
});

test('AC-01: callback이 없는 send_emoji는 ack도 방송도 상태 변경도 만들지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const { io, sockets, hostUuid, gameId, session } = await startRealGame('f33nc', 3);

    handleSendEmoji(io, sockets.get(hostUuid), hostUuid, { gameId, itemId: IN_PALETTE_ITEM }, undefined);
    handleSendEmoji(io, sockets.get(hostUuid), hostUuid, { gameId, itemId: IN_PALETTE_ITEM }, 'not-a-function');

    assert.equal(emojiReceipts(sockets).total, 0);
    assert.equal(session.emojiRateLimit.has(hostUuid), false);
});

test('AC-01: 판이 registry에서 사라질 때 세션의 이모티콘 캐시가 비워진다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    const { hostUuid, gameId, session } = await startRealGame('f33cl', 3);
    assert.equal(session.emojiPaletteByUuid.size, 3);
    session.emojiRateLimit.set(hostUuid, Date.now());

    const ended = gameSessionCore.endGameSessionForPlayer(hostUuid, 'TEST_CLEANUP', gameId);
    assert.equal(ended.ok, true, JSON.stringify(ended));
    assert.equal(ended.sessionDeleted, true);
    assert.equal(session.emojiPaletteByUuid.size, 0, '팔레트 사본이 종료된 판에 남아 있다');
    assert.equal(session.emojiRateLimit.size, 0, 'rate 기록이 종료된 판에 남아 있다');
});
