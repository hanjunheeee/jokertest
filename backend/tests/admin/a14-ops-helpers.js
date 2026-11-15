'use strict';

// 관리자 운영 시험(a14 기록·회원·제재·신고·금지어·점검·공지·쿠폰·문의·재화·판 골드) 공용 도우미 파일
// 이 묶음 파일들만 씀 (공용 helpers는 안 고침), 꼭 models보다 늦게 불러야 함 — 파일 맨 위에서 DATABASE_URL을 먼저 바꿈
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const db = require('../../models');
const { prepareAdminDb, adminTestApp } = require('./helpers/adminTestApp');

const TEST_DB_URL = process.env.F01_TEST_DATABASE_URL;

// 플레이어 로그인 세션 서명 값 (시험 환경값에 없을 때만, 누가 봐도 가짜)
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'a14-ops-fake-test-secret';

// 플레이어 비번 (시험 전용 가짜 값)
const PLAYER_PASSWORD = 'a14-ops-fake-pw-1';
let passwordHash = null;

const tag = () => crypto.randomBytes(4).toString('hex');

// 값 없으면 건너뜀 (npm test엔 시험 DB 주소가 없음)
const noDb = (t) => {
    if (TEST_DB_URL) return false;
    t.skip('F01_TEST_DATABASE_URL 없음 — 시험 DB 시험은 with-lock.sh testdb로 돌림');
    return true;
};

// 파일 하나에 시험 DB 한 번 비우기 + 로그인된 관리자 하나 (accessMode 'required'면 Access 표·이메일까지)
// 돌려줌: { get app(), get admin() } — 시험 안에서 꺼내 씀
function useAdminFile({ accessMode = 'off' } = {}) {
    const ctx = { prepared: null, app: null };
    test.before(async () => {
        if (!TEST_DB_URL) return;
        ctx.prepared = await prepareAdminDb();
        ctx.app = await adminTestApp({ accessMode, admin: { loginId: `a14ops${tag()}` } });
    });
    test.after(async () => {
        if (ctx.app) await ctx.app.close();
        if (ctx.prepared) await ctx.prepared.close();
        else await db.sequelize.close().catch(() => {});
    });
    return ctx;
}

// 시험 회원 한 명 → { uuid, nickname, email } (로그인 쓸 땐 withPassword)
async function createPlayer(label = 'p', { withPassword = false, email, nickname } = {}) {
    const uuid = crypto.randomUUID();
    if (withPassword) passwordHash ??= await require('../../utils/auth/credentials').hashPassword(PLAYER_PASSWORD);
    const nick = nickname ?? `${label}${tag()}`.slice(0, 20);
    const mail = email ?? `${label}-${uuid}@example.test`;
    await db.User.create({ uuid, password_hash: withPassword ? passwordHash : 'not-a-real-hash', nickname: nick, email: mail });
    return { uuid, nickname: nick, email: mail };
}

// 탈퇴한 회원으로 만듦 (상태 + 지운 표시)
async function withdraw(uuid) {
    await db.User.update({ status: 'WITHDRAWN' }, { where: { uuid } });
    await db.User.destroy({ where: { uuid } });
}

// 플레이어 로그인 (진짜 로그인 서비스) → { ok:true } / { ok:false, status }
async function playerLogin(email) {
    const { login } = require('../../services/auth/account/login');
    try {
        await login({ email, password: PLAYER_PASSWORD }, { ip: '127.0.0.1', userAgent: 'a14-ops-test', deviceType: 'pc' });
        return { ok: true };
    } catch (error) {
        return { ok: false, status: error?.status ?? error?.statusCode ?? null, message: error?.message };
    }
}

const parseJson = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

// 내 관리자가 남긴 기록만 (다른 시험 관리자 줄은 안 셈), action·target_id로 거름
async function myAudits(admin, { action, targetId } = {}) {
    const where = { admin_id: admin.id };
    if (action) where.action = action;
    if (targetId !== undefined) where.target_id = String(targetId);
    const rows = await db.AdminAuditLog.findAll({ where, order: [['id', 'ASC']], raw: true });
    return rows.map((row) => ({ ...row, before_value: parseJson(row.before_value), after_value: parseJson(row.after_value) }));
}

// 400 모양: code + 걸린 칸
function assertInvalid(res, field, code = 'INVALID_INPUT') {
    assert.equal(res.status, 400, `상태 ${res.status} ${res.body?.code}`);
    assert.equal(res.body.code, code);
    if (field) assert.equal(res.body.field, field);
}

// 가짜 접속 세상: 계정 채널(user:<uuid>)에 든 가짜 소켓 + 그 채널 찾기·보내기만 되는 가짜 io (emitter에 꽂음)
// 돌려줌: { connect(uuid) → 소켓, io } — 소켓.received = [{ event, payload }], 소켓.connected
function fakeOnline(t) {
    const emitter = require('../../socket/emitter');
    const sockets = new Map();
    let seq = 0;
    const inChannel = (channel) => [...sockets.values()].filter((s) => s.connected && s.rooms.has(channel));
    const io = {
        in: (channel) => ({ fetchSockets: async () => inChannel(channel) }),
        to: (channel) => ({ emit: (event, payload) => { for (const s of inChannel(channel)) s.emit(event, payload); } }),
    };
    emitter.setIo(io);
    t.after(() => {
        emitter.setIo(null);
        emitter.onlineUsers.clear();
    });
    const connect = (uuid) => {
        seq += 1;
        const socket = {
            id: `a14ops-sock-${seq}`,
            rooms: new Set([emitter.userChannelOf(uuid)]),
            received: [],
            connected: true,
            emit(event, payload) { socket.received.push({ event, payload }); },
            disconnect() { socket.connected = false; socket.rooms.clear(); },
        };
        sockets.set(socket.id, socket);
        emitter.onlineUsers.set(uuid, socket.id);
        return socket;
    };
    const got = (socket, event) => socket.received.filter((e) => e.event === event).map((e) => e.payload);
    return { io, connect, got };
}

// 메모리 서버 둘 (이 프로세스 = ㄱ, 같은 메모리 받침에 ㄴ), ㄴ의 다시 읽기 답은 answers로 고름
// answers false = 답을 안 줌 → 기다리다 시간 초과
async function startTwoNodes(t, { answers = true } = {}) {
    const cluster = require('../../cluster');
    const { createMemoryHub, quietLog } = require('../../cluster/testing/memoryCluster');
    const hub = createMemoryHub();
    const common = { CLUSTER_HEARTBEAT_MS: '100', CLUSTER_RPC_TIMEOUT_MS: '400', REDIS_KEY_PREFIX: `a14ops${tag()}` };
    const selfId = `a14ops-n1-${tag()}`;
    const otherId = `a14ops-n2-${tag()}`;
    await cluster.init({ backend: hub.backend(), env: { ...common, REDIS_URL: 'memory://', SERVER_ID: selfId }, log: quietLog });
    const other = await hub.startNode(otherId, { env: common });
    other.rpc.register('ops.reloadNow', answers ? async () => ({ ok: true }) : () => new Promise(() => {}));
    await cluster.nodes.refresh();
    t.after(async () => {
        await cluster.close().catch(() => {});
        await hub.close().catch(() => {});
    });
    return { selfId, otherId };
}

module.exports = {
    TEST_DB_URL,
    PLAYER_PASSWORD,
    db,
    tag,
    noDb,
    useAdminFile,
    createPlayer,
    withdraw,
    playerLogin,
    parseJson,
    myAudits,
    assertInvalid,
    fakeOnline,
    startTwoNodes,
};
