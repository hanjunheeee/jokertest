'use strict';

// A13 친구·알림·초대 시험 세상 (a13- 시험 파일만 씀) — 시험 DB 준비·사람 만들기·로그인 쿠키·경로 서버·받은 알림 모으기·대기방
// 꼭 시험 파일 맨 위에서 먼저 불러야 함 (모델이 DB 주소를 읽기 전에 시험 DB로 돌려 둠)
const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;
// 값 없으면 닿지 않는 곳 → 시험이 건너뜀
process.env.DATABASE_URL = TEST_DB_URL || 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
// .env.test에 없을 때만 시험 전용 글자 (진짜 비밀값 아님)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a13-friend-test-only-secret';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');

const migrationRunner = require('../../db/migrationRunner');
const baseline = require('../../db/migrations/0001-legacy-baseline');
const addRefreshTokenHistory = require('../../db/migrations/0004-add-refresh-token-history');
const addSocialAuth = require('../../db/migrations/0005-add-social-auth');
const { MIGRATIONS } = require('../../scripts/migrate-db');
// 허락된 시험 DB 이름 2개 말고는 지우기 거부 (개발·운영 DB 보호)
const { buildManagedSchema, resetManagedSchema } = require('../helpers/isolatedTestDb');
const db = require('../../models');
const { issueSessionForUser } = require('../../services/auth/account/session');
const { hashPassword } = require('../../utils/auth/credentials');
const { securityHeaders } = require('../../middlewares/securityHeaders.middleware');
const { notFoundHandler, globalErrorHandler } = require('../../middlewares/errorHandler.middleware');
const { listenOnFetchablePort } = require('../helpers/fetchablePort');
const mf = require('../helpers/matchmakingFixtures');
const emitter = require('../../socket/emitter');

const schema = buildManagedSchema({ baseline, addRefreshTokenHistory, addSocialAuth, migrationRunner });

// 시험 DB 붙는 파일 공통: 처음에 한 번 비우고 끝까지 올림, 끝에 닫음 → 건너뛸지 묻는 함수 돌려줌
function useTestDb(test, { beforeClose } = {}) {
    test.before(async () => {
        if (!TEST_DB_URL) return;
        await resetManagedSchema(db.sequelize, TEST_DB_URL, schema);
        await migrationRunner.applyMigrations({ sequelize: db.sequelize, migrations: MIGRATIONS });
    });
    test.after(async () => {
        if (beforeClose) await beforeClose();
        await db.sequelize.close();
    });
    return (t) => {
        if (TEST_DB_URL) return false;
        t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 with-lock.sh testdb로 돌림');
        return true;
    };
}

// 비동기 꼬리 흘려보내기 (setImmediate는 가짜 시계가 안 건드림)
async function flush(times = 8) {
    for (let i = 0; i < times; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

// 시험마다 새 사람: 닉네임 앞 a13 + 글자, 이메일은 example.com (다른 에이전트 줄과 안 섞임)
let userSeq = 0;
let passwordHash = null;
const TEST_PASSWORD = 'a13-test-pw-1';
async function createUser(label = 'u', { status = 'ACTIVE', nickname, withPassword = false } = {}) {
    userSeq += 1;
    const uuid = crypto.randomUUID();
    if (withPassword) passwordHash ??= await hashPassword(TEST_PASSWORD);
    await db.User.create({
        uuid,
        password_hash: withPassword ? passwordHash : 'not-a-real-hash',
        nickname: nickname ?? `a13${label}${userSeq}${uuid.slice(0, 4)}`.slice(0, 20),
        email: `a13-${label}-${uuid}@example.com`,
        status,
    });
    return uuid;
}

// 사람 여러 명
async function createUsers(n, label = 'p') {
    const list = [];
    for (let i = 0; i < n; i += 1) list.push(await createUser(`${label}${i}`));
    return list;
}

// 닉네임 읽기
const nicknameOf = async (uuid) => (await db.User.findByPk(uuid, { paranoid: false, raw: true })).nickname;

// 로그인 (세션 발급) → 요청에 붙일 쿠키 글자
async function login(uuid) {
    const user = await db.User.findByPk(uuid);
    const issued = await db.sequelize.transaction((transaction) => issueSessionForUser(user, {}, { ip: '127.0.0.1' }, transaction));
    return `accessToken=${issued.token}`;
}

// 두 사람 친구 줄 (a가 처음 신청한 쪽)
const befriend = (a, b) => db.Friendship.create({ requester_id: a, receiver_id: b, status: 'ACCEPTED' });
// 차단 줄 (owner가 blocked를 막음)
const block = (owner, blocked) => db.FriendBlock.create({ owner_id: owner, blocked_id: blocked });

// 받은 알림 모으기: 가짜 io를 보내기 창구에 넣고, 계정마다 그 사람 채널에 든 가짜 소켓 하나
function eventHub(t) {
    const io = mf.createFakeIo([]);
    emitter.setIo(io);
    const sockets = new Map();
    t.after(() => emitter.setIo(null));
    // 이 사람이 받는 알림 듣기 시작 (이미 있으면 그 소켓)
    const listen = (uuid) => {
        if (sockets.has(uuid)) return sockets.get(uuid);
        const s = mf.createFakeSocket(uuid, { id: `a13-ev-${uuid}` });
        s.rooms.add(emitter.userChannelOf(uuid));
        io.sockets.sockets.set(s.id, s);
        sockets.set(uuid, s);
        return s;
    };
    // 그 사람이 받은 그 알림 값 목록
    const events = (uuid, event) => (sockets.get(uuid)?.received ?? []).filter((e) => e.event === event).map((e) => e.payload);
    return { io, listen, events, sockets };
}

// 경로 서버: 진짜 앞단(보안 헤더·본문 검사·쿠키) + 친구·알림·신고·문의 경로 + 진짜 오류 처리기
async function startServer(t) {
    const { bodyGuards } = require('../../middlewares/bodyGuard.middleware');
    const app = express();
    app.set('trust proxy', 1);
    app.use(securityHeaders);
    for (const middleware of bodyGuards()) app.use(middleware);
    app.use(cookieParser());
    app.use('/friends', require('../../routes/friend.routes'));
    app.use('/notifications', require('../../routes/notification.routes'));
    app.use('/reports', require('../../routes/report.routes'));
    app.use('/inquiries', require('../../routes/inquiry.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const server = http.createServer(app);
    const { url } = await listenOnFetchablePort(server);
    t.after(() => new Promise((resolve) => server.close(resolve)));
    // 요청 하나 → { status, body }
    return async function call(method, path, { cookie, body } = {}) {
        const headers = {};
        if (cookie) headers.cookie = cookie;
        if (body !== undefined) headers['content-type'] = 'application/json';
        const res = await fetch(`${url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        const text = await res.text();
        let parsed;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
        return { status: res.status, body: parsed };
    };
}

// 컨트롤러 하나 바로 부르기 (가짜 시계 시험용, 서버 안 띄움) → { status, body } 또는 { status, error }
async function callController(handler, req) {
    let status = 200;
    let body = null;
    let error = null;
    const res = {
        status(code) { status = code; return this; },
        json(value) { body = value; return this; },
        set() { return this; },
    };
    await handler(req, res, (err) => { error = err; });
    return error ? { status: error.status ?? 500, error, body: { message: error.message, code: error.code } } : { status, body };
}

// 대기방 세상(진짜 초대 서비스·진짜 DB): 가짜 소켓·io, 방 쪽 장부는 메모리, 소켓은 계정 채널에 들어가 받은 알림이 쌓임
function roomWorld(t, { now = null } = {}) {
    const matchmaking = require('../../socket/matchmaking');
    const inviteService = require('../../services/friend/gameInvite');
    matchmaking.__resetStateForTests();
    mf.installFakeMatchmakingDeps(matchmaking, { gameInviteService: inviteService });
    // 초대 시각만 바꿔 끼움 (3분 경계), DB는 진짜
    if (now) inviteService.__internal.__setDepsForTests({ now: () => new Date(now.value) });
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    emitter.setIo(io);
    const sockets = new Map();
    t.after(() => {
        matchmaking.__resetStateForTests();
        inviteService.__internal.__setDepsForTests(null);
        emitter.setIo(null);
        matchmaking.__setGameInviteServiceForTests(null);
        matchmaking.__setUserRepositoryForTests(null);
        matchmaking.__setEconomyServiceForTests(null);
        matchmaking.__setGameResultRepositoryForTests(null);
    });
    const connect = (uuid) => {
        if (sockets.has(uuid)) return sockets.get(uuid);
        const s = mf.createFakeSocket(uuid, { id: `sock-${uuid}` });
        s.rooms.add(emitter.userChannelOf(uuid));
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
    // 방 만들기 → 손님 코드 입장 (손님은 DB 사람 아니어도 됨)
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
    const events = (uuid, event) => (sockets.get(uuid)?.received ?? []).filter((e) => e.event === event).map((e) => e.payload);
    const currentRoom = async (uuid) => (await send(uuid, 'get_current_room', {})).room;
    return { io, connect, send, openRoom, events, currentRoom, matchmaking, inviteService };
}

// 초대 행 바로 넣기 (끝난 초대·시각 경계 준비용), 바꿀 칸만 fields
async function insertInvite(sender, receiver, fields = {}) {
    const createdAt = fields.created_at ?? new Date(Math.floor(Date.now() / 1000) * 1000);
    return db.GameInvite.create({
        id: crypto.randomUUID(),
        sender_id: sender,
        receiver_id: receiver,
        room_id: `a13-room-${crypto.randomUUID().slice(0, 8)}`,
        room_instance_id: `a13-inst-${crypto.randomUUID().slice(0, 8)}`,
        boot_epoch: 'a13-boot',
        creation_key: `a13-key-${crypto.randomUUID()}`,
        revision: 1,
        status: 'PENDING',
        created_at: createdAt,
        expires_at: new Date(createdAt.getTime() + 3 * 60_000),
        ...fields,
    });
}

module.exports = {
    TEST_DB_URL, TEST_PASSWORD, db,
    useTestDb, flush, createUser, createUsers, nicknameOf, login, befriend, block,
    eventHub, startServer, callController, roomWorld, insertInvite,
};
