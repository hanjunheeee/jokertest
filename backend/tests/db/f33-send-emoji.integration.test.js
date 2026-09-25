'use strict';

// F-33 E-3 AC-01/AC-02 — 인게임 이모티콘 표현(send_emoji)을 실제 격리 MySQL에서 검증한다.
//
// 이 파일만이 답할 수 있는 질문은 둘이다.
//   1) **게임 시작 때 실제 DB에서 캡처한** 팔레트가 거부·허용의 유일한 근거인가.
//      소유(economy_entitlements)와 배치(economy_emoji_palettes)는 서로 다른 테이블이고,
//      그 둘이 어긋나는 상태(가졌지만 팔레트에 없음)는 실제 행 없이는 만들 수 없다.
//      대역으로 팔레트를 손에 들려 주면 "캡처가 정말 DB에서 오는가"를 아무도 묻지 않는다.
//   2) 7종 거부 코드가 **검사 순서 그대로** 나오는가 — 복합 실패에서 어느 코드가 이기는지는
//      순서가 곧 계약이기 때문이다(뒤 검사가 앞 검사보다 많은 정보를 노출하면 안 된다).
//
// 순수 로직(형태·연결 축)만의 단위 검증은 backend/socket/__tests__/gameSession.test.js가
// 담당하고, 이 파일은 그 근거를 실제 DB 캡처 경로로 보완한다.
//
// f21-participant-departure.integration.test.js와 같은 원칙을 따른다: F01_TEST_DATABASE_URL
// 전용 격리 MySQL, backend/tests/helpers/isolatedTestDb.js의 관리 목록·대상 DB 확인. 값이
// 없으면 실패로 표시하지 않고 명시적으로 skip하며 **미검증**임을 남긴다.

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

// require 캐시 싱글턴이라, 파일 맨 위에서 맞춰둔 process.env.DATABASE_URL로 처음 require되는
// 이 시점에 격리 DB에 연결된다(f21/f33-emoji-palette와 같은 이유·같은 자리).
const db = require('../../models');
const economyService = require('../../service/economy.service');
const gameSessionCore = require('../../game-core/gameSession');
const gameSessionSocketLayer = require('../../socket/gameSession');
const matchmaking = require('../../socket/matchmaking');
const { hashPassword } = require('../../utils/hash');

const {
    callAsPromise, createFakeSocket, createFakeIo, validSettingsPayload, readyPayload, startPayload,
} = require('../../socket/__tests__/testHelpers/matchmakingFixtures');

const { handleSendEmoji } = gameSessionSocketLayer.__testables;
const { handleCreateRoom, handleJoinRoomByCode, handleSetReady, handleStartGame } = matchmaking.__testables;

test.after(async () => {
    if (TEST_DB_URL) await db.sequelize.close();
});

// 설계도 §0 순서 — 기본 8종이 곧 기본 팔레트 배치다(economy.service.js의
// DEFAULT_EMOJI_PALETTE_SLOTS와 같은 값을 시험이 스스로 적는다: 그 상수가 바뀌면 여기서 드러난다).
const DEFAULT_SLOTS = [
    'emoji-basic-reject', 'emoji-basic-tears', 'emoji-basic-anger', 'emoji-basic-love',
    'emoji-basic-grin', 'emoji-basic-hello', 'emoji-basic-surrender', 'emoji-basic-dizzy',
];
/** 기본 배치 안에 있는 항목 — 정상 전송에 쓴다. */
const IN_PALETTE_ITEM = DEFAULT_SLOTS[0];
/** 아무에게도 지급되지 않는 상점 이모티콘 — NOT_OWNED 전용. */
const UNOWNED_ITEM = 'emoji-vote-time';
/** 소유는 시키되 팔레트 8칸에는 넣지 않는 상점 이모티콘 — NOT_IN_PALETTE 전용. */
const OWNED_BUT_UNPLACED_ITEM = 'emoji-shush';

/** uuid → 현재 canonical socket.id. fixture의 `sock-${uuid}` 관례를 그대로 따른다. */
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
    // 방이 게임으로 전환될 때 도는 초대 정리는 이 AC의 대상이 아니다 — fire-and-forget이라
    // 시험이 끝난 뒤까지 DB를 건드리므로 그 한 경계만 대역으로 막는다(다른 경계는 전부 실제다:
    // 사용자 조회·외형 조회·전적 조회·**이모티콘 팔레트 조회** 모두 실제 MySQL을 탄다).
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

/** 상점 이모티콘 하나를 **실제 지급 경로**로 소유시킨다(행을 손으로 INSERT하지 않는다). */
const grantEmoticon = async (userId, itemId) => {
    await economyService.grantAchievementItem({
        userId, itemId, itemType: 'EMOTICON', referenceEventId: `f33e3-grant:${userId}:${itemId}`,
    });
};

/**
 * 실제 대기방 → 실제 start_game으로 판 하나를 만든다.
 *
 * 세션 Map을 손으로 심지 않는 이유가 이 파일의 존재 이유다: emojiPaletteByUuid는
 * captureRoomStartProfiles가 **실제 economy.service.getEmojiPalette**로 채우는 값이고,
 * 그 캡처가 정말 DB의 소유·배치 행에서 오는지는 이 경로를 그대로 타야만 확인된다.
 *
 * @param {string} label 사용자 닉네임 접두(케이스마다 달라야 한다)
 * @param {number} playerCount 참가자 수(첫 번째가 방장)
 * @param {(uuid:string, index:number) => Promise<void>} [beforeStart] 시작 직전 DB 준비(지급 등)
 */
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

/** 그 판에서 emoji_shown을 실제로 받은 횟수의 합(어느 소켓이 몇 번 받았는지도 함께 돌려준다). */
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

/** ack를 Promise로 받는다(handleSendEmoji는 동기 핸들러이므로 즉시 정착한다). */
const sendEmoji = (io, socket, uuid, payload) => {
    let calls = 0;
    let response = null;
    handleSendEmoji(io, socket, uuid, payload, (result) => { calls += 1; response = result; });
    return { calls, response };
};

/**
 * 주어진 동기 구간의 Date.now를 고정한다. 되돌리기는 finally에 둔다 — 단언이 던져도 전역
 * 시계가 고정된 채 남지 않아야 한다(f21의 withClockOnSecondBoundary와 같은 이유).
 */
function withFixedClock(fixedNow, fn) {
    const originalNow = Date.now;
    Date.now = () => fixedNow;
    try {
        return fn();
    } finally {
        Date.now = originalNow;
    }
}

// ---------------------------------------------------------------------------

test('AC-01: send_emoji의 7종 거부 코드는 복합 실패에서도 검사 순서대로 이기고, 어느 실패도 방송·rate 상태를 바꾸지 않는다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    // (1) staleSocket + 잘못된 payload → STALE_SOCKET
    //     연결 소유권이 가장 앞이다. 형태 오류를 먼저 알려 주면 "지금 이 연결의 요청인가"를
    //     묻기도 전에 서버가 입력을 해석했다는 뜻이 된다.
    {
        const uuid = await createLocalUser('f33s1');
        const io = createFakeIo();
        // registry는 이 계정의 canonical id를 `sock-${uuid}`로 답한다 — 다른 id의 소켓은 옛 연결이다.
        const stale = createFakeSocket(uuid, { id: `sock-stale-${uuid}` });
        io.sockets.sockets.set(stale.id, stale);
        const { calls, response } = sendEmoji(io, stale, uuid, { gameId: 42, itemId: null });
        assert.equal(calls, 1);
        assert.equal(response.ok, false);
        assert.equal(response.code, 'STALE_SOCKET');
        assert.equal(stale.countReceived('emoji_shown'), 0);
    }

    // (2) 현재 소켓 + 잘못된 payload + 비참가자 → INVALID_PAYLOAD
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

    // (3) 형태 정상 + 비참가자 + 종료된 판 → NOT_PARTICIPANT
    //     종료를 먼저 알려 주면 그 판에 속하지도 않은 계정이 남의 판의 진행 여부를 알아낸다.
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

    // (4) 참가자 + 종료 + rate 제한 + 미소유 → GAME_ENDED
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

    // (5) 참가자 + 진행 중 + rate 제한 + 미소유 → RATE_LIMITED
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

    // (6) 진행 중 + rate 통과 + 미소유 → NOT_OWNED
    //     근거는 실제 economy_entitlements다 — 기본 지급 8종에 상점 이모티콘은 없다.
    {
        const { io, sockets, hostUuid, gameId, session } = await startRealGame('f33s6', 3);
        assert.equal(session.emojiPaletteByUuid.get(hostUuid).owned.includes(UNOWNED_ITEM), false,
            '이 케이스는 "소유하지 않았다"가 DB의 사실일 때만 의미가 있다');
        const { response } = sendEmoji(io, sockets.get(hostUuid), hostUuid, { gameId, itemId: UNOWNED_ITEM });
        assert.equal(response.code, 'NOT_OWNED');
        assert.equal(session.emojiRateLimit.has(hostUuid), false, '거부는 rate 상태를 바꾸지 않는다');
        assert.equal(emojiReceipts(sockets).total, 0);
    }

    // (7) 진행 중 + rate 통과 + 소유 + 팔레트 밖 → NOT_IN_PALETTE
    //     소유(entitlements)와 배치(emoji_palettes)가 어긋난 상태를 실제 두 테이블로 만든다.
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

    // 캡처된 값이 정말 DB의 기본 배치·기본 소유다.
    const palette = session.emojiPaletteByUuid.get(hostUuid);
    assert.deepEqual(palette.slots, DEFAULT_SLOTS, '캡처한 배치가 DB 기본 배치와 다르다');
    assert.deepEqual([...palette.owned].sort(), [...DEFAULT_SLOTS].sort(), '캡처한 소유 목록이 기본 지급 8종과 다르다');

    // 판이 도는 동안 마이페이지에서 배치를 전부 비워도(실제 저장 경로) 그 판의 판정은 그대로다.
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

    // t=10000 — 첫 전송은 성공하고 그 시각이 그대로 기록된다.
    const first = withFixedClock(10_000, () => sendEmoji(io, hostSocket, hostUuid, { gameId, itemId: IN_PALETTE_ITEM }));
    assert.equal(first.response.ok, true);
    assert.equal(first.response.sentAt, 10_000);
    assert.equal(session.emojiRateLimit.get(hostUuid), 10_000);
    assert.equal(emojiReceipts(sockets).total, sockets.size);

    // t=10500 — 간격(1000ms) 안이므로 거부되고, 기록도 방송도 늘지 않는다.
    const second = withFixedClock(10_500, () => sendEmoji(io, hostSocket, hostUuid, { gameId, itemId: IN_PALETTE_ITEM }));
    assert.equal(second.response.ok, false);
    assert.equal(second.response.code, 'RATE_LIMITED');
    assert.equal(session.emojiRateLimit.get(hostUuid), 10_000, '거부가 마지막 전송 시각을 밀어서는 안 된다');
    assert.equal(emojiReceipts(sockets).total, sockets.size);

    // t=11000 — 정확히 간격이 지난 순간부터 다시 허용된다(경계 포함).
    const third = withFixedClock(11_000, () => sendEmoji(io, hostSocket, hostUuid, { gameId, itemId: IN_PALETTE_ITEM }));
    assert.equal(third.response.ok, true, `경계(1000ms)는 허용이다: ${JSON.stringify(third.response)}`);
    assert.equal(session.emojiRateLimit.get(hostUuid), 11_000);
    assert.equal(emojiReceipts(sockets).total, sockets.size * 2);

    // 간격은 계정별이다 — 다른 참가자의 전송이 방장의 기록에 막히지 않는다.
    const otherUuid = [...sockets.keys()].find((uuid) => uuid !== hostUuid);
    const other = withFixedClock(11_100, () =>
        sendEmoji(io, sockets.get(otherUuid), otherUuid, { gameId, itemId: IN_PALETTE_ITEM }));
    assert.equal(other.response.ok, true);
    assert.equal(session.emojiRateLimit.get(otherUuid), 11_100);
});

test('AC-02: 성공한 send_emoji는 emoji_shown을 죽은 참가자까지 포함해 전원에게 1회 방송하고 이탈자는 제외한다', async (t) => {
    if (unavailable(t)) return;
    await setUp();

    // 4인으로 시작한다 — 3인에서 한 명이 빠지면 광대 1 : 시민 1 parity에 도달해 그 이탈
    // 자체가 판을 끝내고(evaluateWinCondition), 그러면 이 단언이 보려는 "진행 중 판의 방송"이
    // 애초에 일어나지 않는다. 같은 이유로 빠지는 쪽은 반드시 광대가 아닌 참가자여야 한다
    // (광대가 빠지면 시민 승리로 끝난다). 역할 배정은 실제 시작 경로의 난수라 이름이 아니라
    // canonical role로 고른다.
    const { io, sockets, hostUuid, gameId, session } = await startRealGame('f33bc', 4);
    const bystanders = [...sockets.keys()].filter((uuid) =>
        uuid !== hostUuid && session.players.get(uuid).role !== 'JOKER');
    assert.ok(bystanders.length >= 2, '광대가 아닌 비방장 참가자가 둘 이상이어야 이 시나리오를 만들 수 있다');
    const [leftUuid, deadUuid] = bystanders;

    // 이탈은 core의 실제 커밋 경계로 만든다. 채널 가입은 그대로 남겨 둔다 — "떼지 못한 옛
    // 구독에도 보내지 않는가"가 이 단언의 핵심이기 때문이다.
    const departed = gameSessionCore.commitParticipantDeparture(session, leftUuid, { reason: 'PARTICIPANT_LEFT' });
    assert.equal(departed.ok, true, JSON.stringify(departed));
    assert.equal(session.phase === 'ENDED', false, '이 이탈이 판을 끝내면 진행 중 방송을 볼 수 없다');
    assert.equal(sockets.get(leftUuid).rooms.has(session.channelId), true,
        '이탈자가 채널에서 이미 빠져 있으면 이 단언은 제외 로직을 보지 못한다');
    // 사망은 참여 종료가 아니다 — 관전 중인 사망 참가자는 공개 사건을 그대로 받는다.
    // 이탈 커밋 **뒤에** 표시한다(승패 재평가를 건드리지 않는 순수 표식이다).
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

    // 던지지 않는다(핸들러가 ack 없는 요청을 조용히 버린다).
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

    // 진행 중 판의 종료는 첫 이탈에 registry 전체를 지운다 — 그 경계가 캐시 정리의 자리다.
    const ended = gameSessionCore.endGameSessionForPlayer(hostUuid, 'TEST_CLEANUP', gameId);
    assert.equal(ended.ok, true, JSON.stringify(ended));
    assert.equal(ended.sessionDeleted, true);
    assert.equal(session.emojiPaletteByUuid.size, 0, '팔레트 사본이 종료된 판에 남아 있다');
    assert.equal(session.emojiRateLimit.size, 0, 'rate 기록이 종료된 판에 남아 있다');
});
