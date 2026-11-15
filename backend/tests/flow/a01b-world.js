'use strict';

// A01b 대기방 흐름 시험 세상 (a01b- 흐름 시험 파일만 씀) — 방 만들기·코드·공개 목록·초대 입장·준비·추방·나가기를 진짜 사건 받기 길로 몲
// 가짜 소켓·가짜 io + node:test 가짜 시계(setTimeout·Date), 초대 행은 메모리 표(저장소 함수만 바꿔 끼움), DB에 쓰는 곳은 아무것도 안 하는 함수로
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DATABASE_URL을 닿지 않는 곳으로 막음 → 꼭 서버 모듈보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const matchmaking = require('../../socket/matchmaking');
const gs = require('../../socket/gameSession');
const mf = require('../helpers/matchmakingFixtures');
const desertion = require('../../services/game/desertion');
const view = require('../../socket/matchmaking/room/view');
const emitter = require('../../socket/emitter');
const inviteService = require('../../services/friend/gameInvite');
const inviteRepo = require('../../repositories/friend/gameInvite');
const friendshipRepo = require('../../repositories/friend/friendship');
const blockRepo = require('../../repositories/friend/block');
const userLookup = require('../../repositories/user/lookup');
const notificationService = require('../../services/notification');
const inviteController = require('../../controllers/friend/invites');

const MM = matchmaking.__testables;
const G = gs.__testables;

// 가짜 시계 시작 시각 (아무 값, 시험마다 같음)
const START_MS = 1_800_000_000_000;

// 답(ack) 받는 사건 (나머지는 답 없이 알림만 옴)
const ACK_EVENTS = new Set([
    'create_room', 'set_ready', 'kick_room_player', 'delete_room', 'get_public_rooms', 'get_current_room',
    'accept_game_invite', 'get_game_invite_result', 'update_room_settings', 'start_game', 'enter_lobby',
]);

// 비동기 꼬리 흘려보내기 (setImmediate는 가짜 시계에 안 묶여 진짜로 돎)
async function flush(times = 8) {
    for (let i = 0; i < times; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

// 멈춰 둘 수 있는 문 (처리 중 상태 만들기): pause(이름) → { reached, release }
function createGates() {
    const waiting = new Map();
    return {
        // 다음에 이 이름으로 들어오는 일을 멈춤 (once면 한 번만)
        pause(name) {
            let release;
            let reach;
            const opened = new Promise((resolve) => { release = resolve; });
            const reached = new Promise((resolve) => { reach = resolve; });
            waiting.set(name, { opened, reach });
            return { reached, release: () => release() };
        },
        // 멈춘 문이 있으면 열릴 때까지 기다림
        async pass(name) {
            const gate = waiting.get(name);
            if (!gate) return;
            waiting.delete(name);
            gate.reach();
            await gate.opened;
        },
    };
}

// 초대 행 메모리 표: 초대 저장소·친구·차단·계정 읽기 함수만 바꿔 끼움 (서비스 판단은 진짜 코드)
function installInviteStore(t, gates) {
    const rows = new Map();
    const users = new Map();
    const friends = new Set();
    const blocks = new Set();
    const notifications = [];
    let seq = 0;
    const pair = (a, b) => [a, b].sort().join('|');
    const user = (uuid) => {
        if (!users.has(uuid)) users.set(uuid, { uuid, nickname: `닉-${uuid}`, status: 'ACTIVE' });
        return users.get(uuid);
    };
    const fakeDb = { sequelize: { transaction: async (fn) => fn({ LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } }) } };
    const nowMs = () => Date.now();
    const at = (value) => (value instanceof Date ? value.getTime() : new Date(value).getTime());

    t.mock.method(friendshipRepo, 'lockAccountsInOrder', async (uuids) =>
        [...new Set(uuids)].sort().map((uuid) => (users.has(uuid) ? { ...users.get(uuid) } : null)));
    t.mock.method(friendshipRepo, 'findExistingFriendship', async (a, b) =>
        (friends.has(pair(a, b)) ? { status: 'ACCEPTED' } : null));
    t.mock.method(blockRepo, 'findBlocksBetween', async (a, b) =>
        [...blocks].filter((key) => key === `${a}>${b}` || key === `${b}>${a}`));
    t.mock.method(userLookup, 'findNickname', async (db, uuid) => (users.has(uuid) ? { nickname: users.get(uuid).nickname } : null));
    t.mock.method(userLookup, 'lockAccount', async (db, uuid) => (users.has(uuid) ? { ...users.get(uuid) } : null));
    t.mock.method(notificationService, 'createForGameInvite', async ({ receiverId, inviteId }) => {
        const notification = { id: `ntf-${notifications.length + 1}`, userId: receiverId, inviteId };
        notifications.push(notification);
        return { created: true, notification };
    });
    t.mock.method(notificationService, 'emitNotificationCreated', () => {});

    t.mock.method(inviteRepo, 'expireDue', async (db, { receiverId, now, expiredStatus, pendingStatus }) => {
        let changed = 0;
        for (const row of rows.values()) {
            if (row.receiver_id !== receiverId || row.status !== pendingStatus || at(row.expires_at) > at(now)) continue;
            Object.assign(row, { status: expiredStatus, end_reason: 'EXPIRED', decided_at: now, revision: row.revision + 1 });
            changed += 1;
        }
        return [changed];
    });
    t.mock.method(inviteRepo, 'findByCreationKey', async (db, { senderId, creationKey }) =>
        [...rows.values()].find((r) => r.sender_id === senderId && r.creation_key === creationKey) ?? null);
    t.mock.method(inviteRepo, 'findLivePending', async (db, q) =>
        [...rows.values()].filter((r) => r.sender_id === q.senderId && r.receiver_id === q.receiverId
            && r.room_id === q.roomId && r.room_instance_id === q.roomInstanceId && r.boot_epoch === q.bootEpoch
            && r.status === q.status && at(r.expires_at) > at(q.after)).sort((a, b) => b.creation_seq - a.creation_seq)[0] ?? null);
    t.mock.method(inviteRepo, 'createInviteRow', async (db, row) => {
        seq += 1;
        const saved = { ...row, creation_seq: seq, attempt_id: null, entry_outcome: null, end_reason: null, decided_at: null };
        rows.set(saved.id, saved);
        return saved;
    });
    const find = async (db, id) => rows.get(id) ?? null;
    t.mock.method(inviteRepo, 'findInviteInTransaction', find);
    t.mock.method(inviteRepo, 'findInvite', async (db, id) => {
        await gates.pass('peek');
        return rows.get(id) ?? null;
    });
    t.mock.method(inviteRepo, 'lockInvite', async (db, id) => {
        await gates.pass('decision');
        return rows.get(id) ?? null;
    });
    t.mock.method(inviteRepo, 'saveInvite', async (row, patch) => {
        Object.assign(row, patch);
        if (patch.entry_outcome === 'PUBLISHED') await gates.pass('published');
        return row;
    });
    t.mock.method(inviteRepo, 'listForRoom', async (db, { roomId, status }) =>
        [...rows.values()].filter((r) => r.room_id === roomId && r.status === status));
    t.mock.method(inviteRepo, 'endMany', async (db, { ids, status, endReason, decidedAt, onlyStatus }) => {
        let changed = 0;
        for (const id of ids) {
            const row = rows.get(id);
            if (!row || (onlyStatus !== undefined && row.status !== onlyStatus)) continue;
            Object.assign(row, { status, end_reason: endReason, decided_at: decidedAt, revision: row.revision + 1 });
            changed += 1;
        }
        return [changed];
    });
    t.mock.method(inviteRepo, 'markEntryIfUnconfirmed', async (db, { inviteId, attemptId, entryOutcome, endReason, unconfirmedOutcome }) => {
        const row = rows.get(inviteId);
        if (!row || row.attempt_id !== attemptId || row.entry_outcome !== unconfirmedOutcome) return [0];
        Object.assign(row, { entry_outcome: entryOutcome, end_reason: endReason });
        return [1];
    });
    inviteService.__internal.__setDepsForTests({ db: fakeDb, now: () => new Date(nowMs()) });
    t.after(() => inviteService.__internal.__setDepsForTests(null));

    return {
        rows, user, notifications,
        befriend: (a, b) => { user(a); user(b); friends.add(pair(a, b)); },
        block: (owner, blocked) => blocks.add(`${owner}>${blocked}`),
        row: (inviteId) => rows.get(inviteId),
    };
}

// 세상 하나: 접속·사건 보내기·방 차리기·초대·판 시작
function makeWorld(t, { depsOverrides = {} } = {}) {
    gf.resetCore();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    desertion.__resetForTests();
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: START_MS });
    const gates = createGates();
    // 계정 읽기는 문 하나 거침 (방 만들기·입장 처리 중 상태 만들기)
    const users = {
        findByUuid: async (uuid) => {
            await gates.pass(`user:${uuid}`);
            return { uuid, nickname: `닉-${uuid}` };
        },
    };
    mf.installFakeMatchmakingDeps(matchmaking, { userRepository: users, gameInviteService: inviteService, ...depsOverrides });
    // 판 쪽 DB 쓰기(표 기록·업적·전적·탈주) 막기
    G.__setRecordVoteParticipationForTests(async () => {});
    G.__setEvaluateAchievementsForTests(async () => {});
    G.__setGameResultPersistForTests(async () => ({ ok: true }));
    desertion.__setRepositoryForTests({
        countDesertionsSince: async () => 0,
        insertDesertion: async () => ({ created: true, row: null }),
        findDesertionsForWarmup: async () => [],
    });
    t.mock.method(Math, 'random', () => 0);
    const store = installInviteStore(t, gates);

    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    gs.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    emitter.setIo(io);
    t.after(() => {
        gs.__resetStateForTests();
        matchmaking.__resetStateForTests();
        gf.resetCore();
        emitter.setIo(null);
        G.__setRecordVoteParticipationForTests(null);
        G.__setEvaluateAchievementsForTests(null);
        G.__setGameResultPersistForTests(null);
        desertion.__setRepositoryForTests(null);
        desertion.__resetForTests();
        matchmaking.__setGameInviteServiceForTests(null);
        matchmaking.__setUserRepositoryForTests(null);
        matchmaking.__setEconomyServiceForTests(null);
        matchmaking.__setGameResultRepositoryForTests(null);
    });

    // 계정 하나 접속: 소켓을 접속 목록에 지금 소켓으로 적고 사건 받기 등록 (다시 붙을 땐 소켓 id를 새로)
    const sockets = new Map();
    let socketSeq = 0;
    const connect = (uuid, { id } = {}) => {
        socketSeq += 1;
        const s = mf.createFakeSocket(uuid, { id: id ?? `sock-${uuid}-${socketSeq}` });
        s.rooms.add(`user:${uuid}`);
        io.sockets.sockets.set(s.id, s);
        registry.set(uuid, s.id);
        sockets.set(uuid, s);
        store.user(uuid);
        matchmaking.registerMatchmakingHandlers(io, s, uuid, { getCurrentSocketId: (u) => registry.get(u) });
        return s;
    };
    const sock = (uuid) => sockets.get(uuid);
    const received = (uuid, event, socket = sock(uuid)) => socket.received.filter((e) => e.event === event).map((e) => e.payload);
    const count = (uuid, event, socket = sock(uuid)) => received(uuid, event, socket).length;
    const last = (uuid, event, socket = sock(uuid)) => received(uuid, event, socket).at(-1);

    // 화면이 보내는 것처럼 사건 하나 보냄: 답 있는 사건은 답을, 없는 사건은 꼬리까지 흘려보낸 뒤 끝
    async function send(uuid, event, payload, { socket = sock(uuid) } = {}) {
        if (ACK_EVENTS.has(event)) {
            const reply = await new Promise((resolve) => socket.trigger(event, payload, resolve));
            await flush();
            return reply;
        }
        socket.trigger(event, payload);
        await flush();
        return undefined;
    }
    // 답을 안 기다리고 보냄 (처리 중 상태 만들기), 답은 나중에 받음
    function sendLater(uuid, event, payload, { socket = sock(uuid) } = {}) {
        return new Promise((resolve) => socket.trigger(event, payload, resolve));
    }

    // 지금 방 묻기 (방 내용 = 명단·방장 등), 그 사람의 끊김 예약을 풀므로 끊긴 사람 말고 남이 물음
    const currentRoom = async (uuid) => (await send(uuid, 'get_current_room', {})).room;
    const roster = async (askUuid) => (await currentRoom(askUuid))?.players.map((p) => p.uuid) ?? null;
    const lastJoined = (uuid) => last(uuid, 'room_joined');
    const lastFailed = (uuid) => last(uuid, 'room_join_failed');

    // 방 만들기 → 손님 코드 입장 (방장 = 첫 사람), 접속 안 한 사람은 접속부터
    async function openRoom({ host, guests = [], maxPlayers = 10, accessType = 'code', jokerCount = 1, extra = {} }) {
        for (const uuid of [host, ...guests]) if (!sock(uuid)) connect(uuid);
        const created = await send(host, 'create_room', {
            accessType, maxPlayers, jokerCount, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60, ...extra,
        });
        assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
        for (const uuid of guests) {
            await joinByCode(uuid, created.room.roomCode);
            assert.ok(lastJoined(uuid), `${uuid} 입장 실패: ${JSON.stringify(lastFailed(uuid))}`);
        }
        return { roomId: created.room.roomId, roomCode: created.room.roomCode, instanceId: created.room.roomInstanceId, host, uuids: [host, ...guests] };
    }
    const joinByCode = (uuid, roomCode) => send(uuid, 'join_room_by_code', { roomCode });
    const joinPublic = (uuid, roomId) => send(uuid, 'join_public_room', { roomId });
    const leave = (uuid) => send(uuid, 'leave_room');
    const ready = (uuid, room, isReady = true, extra = {}) => send(uuid, 'set_ready', { roomId: room.roomId, expectedSettingsVersion: 1, isReady, ...extra });

    // 방장 설정 저장 (지금 받은 방 내용 버전으로), 바꿀 칸만 changes (예: { accessType: 'code' })
    let settingsSeq = 0;
    async function saveSettings(host, changes = {}) {
        const room = await currentRoom(host);
        settingsSeq += 1;
        const s = room.settings;
        return send(host, 'update_room_settings', {
            roomId: room.roomId,
            requestId: `set-${settingsSeq}`,
            expectedSettingsVersion: room.settingsVersion,
            accessType: room.accessType,
            maxPlayers: s.maxPlayers,
            jokerCount: s.jokerCount,
            dayDiscussionTime: s.dayDiscussionTime,
            dayVoteTime: s.dayVoteTime,
            nightActionTime: s.nightActionTime,
            ...changes,
        });
    }

    // 사람 이름 n개 (접두어-번호)
    const names = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

    // 추방 요청 값: 방장이 지금 받은 방 내용으로 채움 (자리 번호·방 회차·부팅 번호), 바꿀 칸만 overrides
    let requestSeq = 0;
    async function kickPayload(host, target, overrides = {}) {
        const room = await currentRoom(host);
        const me = room.players.find((p) => p.uuid === host);
        const them = room.players.find((p) => p.uuid === target);
        requestSeq += 1;
        return {
            requestId: `kick-${requestSeq}`,
            bootEpoch: room.bootEpoch,
            roomId: room.roomId,
            roomInstanceId: room.roomInstanceId,
            requesterMembershipId: me?.membershipId ?? 'none',
            targetUuid: target,
            targetMembershipId: them?.membershipId ?? 'none',
            ...overrides,
        };
    }
    const kickRaw = (host, payload, opts) => send(host, 'kick_room_player', payload, opts);
    const kick = async (host, target, overrides = {}) => kickRaw(host, await kickPayload(host, target, overrides));

    // 초대 만들기 (HTTP 컨트롤러 길): { status, body } 또는 { status, error }
    let inviteKeySeq = 0;
    async function createInvite(senderId, receiverId, { creationKey } = {}) {
        inviteKeySeq += 1;
        const req = { user: { uuid: senderId }, body: { receiverId, creationKey: creationKey ?? `key-${inviteKeySeq}` } };
        let status = null;
        let body = null;
        let error = null;
        const res = {
            status(code) { status = code; return this; },
            json(value) { body = value; return this; },
            set() { return this; },
        };
        await inviteController.createInvite(req, res, (err) => { error = err; });
        await flush();
        return error ? { status: error.status ?? 500, error } : { status, body, invite: body?.data };
    }
    // 친구 맺고 초대 하나 보낸 뒤 초대 id
    async function invite(senderId, receiverId) {
        store.befriend(senderId, receiverId);
        const made = await createInvite(senderId, receiverId);
        assert.ok(made.invite, `초대 만들기 실패: ${made.error?.message}`);
        return made.invite.inviteId;
    }
    const accept = (uuid, inviteId) => send(uuid, 'accept_game_invite', { inviteId });

    // 탈주 대기 걸기: remainingMs 남게 (첫 탈주 = 5분)
    async function desert(uuid, remainingMs) {
        const done = await desertion.recordDesertion({
            userId: uuid, gameId: `g-desert-${uuid}`, reason: 'LEFT_ALIVE', desertedAt: Date.now() - (5 * 60_000 - remainingMs),
        });
        assert.equal(done.ok, true);
    }

    // 대기방 전원 준비 → 방장이 시작 (진짜 시작 길), 시작 답 돌려줌
    async function startRoom(room) {
        for (const uuid of room.uuids) {
            const r = await ready(uuid, room);
            assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`);
        }
        const started = await send(room.host, 'start_game', { roomId: room.roomId, expectedSettingsVersion: 1 });
        assert.equal(started.ok, true, `시작 실패: ${started.message}`);
        return started;
    }

    // 판만 바로 열기 (대기방 없이, 직업 고정): 판 중인 사람 만들기
    function seedGame({ id, n, uuids }) {
        const session = gf.startGame({ id, n, prefix: id });
        for (const uuid of uuids ?? [...session.players.keys()]) if (!sock(uuid)) connect(uuid);
        for (const uuid of session.players.keys()) {
            const s = sock(uuid);
            if (s) { s.rooms.add(session.channelId); s.data.activeGameId = session.id; }
        }
        return session;
    }

    // 밤에 광대가 한 사람 죽임 (나머지는 건너뜀) → 판정 확정, 끝나면 다음 낮
    function killAtNight(session, joker, victim) {
        const sent = gf.core.submitNightAction(joker, session.id, victim);
        assert.equal(sent.ok, true, `밤 행동 실패: ${sent.code}`);
        gf.skipAllNight(session);
        const prepared = gf.core.prepareNightResolution(joker, session.id);
        assert.equal(prepared.ok, true, `밤 판정 준비 실패: ${prepared.code}`);
        const committed = gf.core.commitNightResolution(prepared.session, prepared.resolution);
        assert.equal(committed.ok, true, `밤 확정 실패: ${committed.code}`);
        assert.equal(session.players.get(victim).alive, false);
    }

    // 판에서 나가기 (판 나가기 사건 길)
    const leaveGame = (uuid, gameId) => new Promise((resolve) => G.handleLeaveGameSession(io, sock(uuid), uuid, { gameId }, resolve));

    // 소켓 끊김 (서버가 받은 끊김 처리 길)
    function disconnect(uuid) {
        const s = sock(uuid);
        s.connected = false;
        matchmaking.onDisconnect(io, s, uuid);
    }

    const tick = (ms) => t.mock.timers.tick(ms);
    // 공개 방 목록 0.5초 묶음을 지금 보냄
    const flushList = () => view.flushPublicRoomList(io);
    const publicRoomOf = (uuid, roomId) => last(uuid, 'public_rooms_updated')?.rooms.find((r) => r.id === roomId) ?? null;

    return {
        t, io, registry, store, gates, gf, gs, G, MM, matchmaking,
        connect, sock, received, count, last, send, sendLater, flush,
        currentRoom, roster, lastJoined, lastFailed,
        openRoom, joinByCode, joinPublic, leave, ready, names, saveSettings,
        kickPayload, kickRaw, kick,
        createInvite, invite, accept, desert, startRoom, seedGame, killAtNight, leaveGame, disconnect,
        tick, flushList, publicRoomOf,
    };
}

// 방 입장 실패 문구 (목록 글 "주는 것 → 기대하는 것" 칸 그대로)
const MSG = Object.freeze({
    CODE_REQUIRED: '방 코드를 입력해주세요.',
    ROOM_CODE_MISMATCH: '입장 코드와 일치하는 방이 없습니다.',
    ROOM_ALREADY_STARTED: '이미 게임이 시작된 방입니다.',
    SESSION_ENDED: '이미 끝난 게임의 방입니다.',
    ROOM_FULL: '방이 가득 찼습니다.',
    ALREADY_IN_ROOM: '이미 참여 중인 방이 있습니다.',
    ALREADY_IN_GAME: '진행 중인 게임이 있습니다. 게임을 끝내거나 나간 뒤에 다시 시도해주세요.',
    KICKED_TOO_MANY_TIMES: '이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다.',
    REQUEST_IN_PROGRESS: '이미 처리 중인 요청이 있습니다.',
    TOO_MANY_JOIN_ATTEMPTS: '입장 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
});

// 같은 방에서 n번 쫓겨나게 함 (쫓겨날 때마다 코드로 다시 들어옴, 마지막엔 안 들어옴)
async function kickTimes(w, room, target, n) {
    for (let i = 0; i < n; i += 1) {
        const r = await w.kick(room.host, target);
        assert.equal(r.ok, true, `추방 실패: ${r.code}`);
        if (i < n - 1) {
            await w.joinByCode(target, room.roomCode);
            assert.equal(w.lastJoined(target)?.roomId, room.roomId, '다시 들어오기 실패');
        }
    }
}

// 입장 실패 알림 하나 확인 (코드·문구), 실패 알림 돌려줌
function assertFailed(w, uuid, code, message) {
    const failed = w.lastFailed(uuid);
    assert.ok(failed, `${uuid} 실패 알림 없음`);
    assert.equal(failed.code, code);
    if (message !== undefined) assert.equal(failed.message, message);
    return failed;
}

module.exports = { makeWorld, flush, MSG, START_MS, kickTimes, assertFailed };
