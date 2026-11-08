'use strict';

// 운영 받침 시험: 즉시 끊기 · 세션 확인의 정지/비활성 code · refresh 비활성 거절 · 소켓 끊김 code · 운영 공지
// 저장소 함수·소켓은 가짜 (진짜 DB 안 씀)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ops-disconnect-test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');

const { disconnectUser, DISCONNECT_REASONS } = require('../../services/ops/disconnect');
const { sendAnnouncement, validateAnnouncement, announcementSourceKey } = require('../../services/ops/announcements');
const sessionLifecycle = require('../../services/auth/sessionLifecycle');
const userRepository = require('../../repositories/user');
const accountService = require('../../services/auth/account');
const socketAuth = require('../../socket/connection/auth');
const { createFakeIo, createSocketStub } = require('./opsFakes');

const UUID = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER = 'bbbbbbbb-0000-4000-8000-00000000000b';

// 끊기용 가짜 저장소 (정지·상태·세션 내림 기록)
const fakeRepo = ({ ban = null, status = 'ACTIVE' } = {}) => {
    const offline = [];
    return {
        offline,
        checkActiveBan: async () => ban,
        findByUuid: async () => ({ uuid: UUID, status }),
        markOnlineSessionsOffline: async (uuid) => { offline.push(uuid); },
    };
};

// ── 즉시 끊기 ──

test('즉시 끊기: 정지면 그 사람 소켓 전부에 ACCOUNT_BANNED 보내고 끊음 + 세션 내림', async () => {
    const a = createSocketStub('s1', UUID);
    const b = createSocketStub('s2', UUID);
    const other = createSocketStub('s3', OTHER);
    const repo = fakeRepo({ ban: { reason: '욕설' } });
    const result = await disconnectUser(UUID, { getIo: () => createFakeIo([a, b, other]), userRepository: repo });
    assert.deepEqual(result, { uuid: UUID, code: 'ACCOUNT_BANNED', disconnected: 2 });
    for (const socket of [a, b]) {
        assert.deepEqual(socket.emitted, [{ event: 'force_disconnect', payload: { code: 'ACCOUNT_BANNED', message: DISCONNECT_REASONS.ACCOUNT_BANNED } }]);
        assert.equal(socket.disconnected, true);
    }
    assert.equal(other.disconnected, false);
    assert.deepEqual(repo.offline, [UUID]);
});

test('즉시 끊기: 상태가 ACTIVE 아니면 ACCOUNT_INACTIVE + 세션 내림', async () => {
    const socket = createSocketStub('s1', UUID);
    const repo = fakeRepo({ status: 'SUSPENDED' });
    const result = await disconnectUser(UUID, { getIo: () => createFakeIo([socket]), userRepository: repo });
    assert.equal(result.code, 'ACCOUNT_INACTIVE');
    assert.equal(socket.emitted[0].payload.code, 'ACCOUNT_INACTIVE');
    assert.deepEqual(repo.offline, [UUID]);
});

test('즉시 끊기: 정지·비활성 아니면 ADMIN_DISCONNECT, 세션은 안 내림 (다시 들어올 수 있음)', async () => {
    const socket = createSocketStub('s1', UUID);
    const repo = fakeRepo();
    const result = await disconnectUser(UUID, { getIo: () => createFakeIo([socket]), userRepository: repo });
    assert.equal(result.code, 'ADMIN_DISCONNECT');
    assert.equal(socket.disconnected, true);
    assert.deepEqual(repo.offline, []);
});

test('즉시 끊기: 접속 안 한 사람이면 끊은 수 0 (정지면 세션은 내림)', async () => {
    const repo = fakeRepo({ ban: {} });
    const result = await disconnectUser(UUID, { getIo: () => createFakeIo([]), userRepository: repo });
    assert.equal(result.disconnected, 0);
    assert.deepEqual(repo.offline, [UUID]);
});

test('즉시 끊기: io가 아직 없어도 던지지 않음', async () => {
    const result = await disconnectUser(UUID, { getIo: () => null, userRepository: fakeRepo({ ban: {} }) });
    assert.equal(result.disconnected, 0);
});

test('즉시 끊기: 소켓 하나가 emit에서 던져도 나머지는 끊음', async () => {
    const bad = createSocketStub('s1', UUID);
    bad.emit = () => { throw new Error('emit 실패'); };
    const good = createSocketStub('s2', UUID);
    const originalError = console.error;
    console.error = () => {};
    try {
        await disconnectUser(UUID, { getIo: () => createFakeIo([bad, good]), userRepository: fakeRepo({ ban: {} }) });
    } finally { console.error = originalError; }
    assert.equal(good.disconnected, true);
});

test('즉시 끊기: uuid 모양 아니면 400 (DB 안 감)', async () => {
    let asked = false;
    const repo = { ...fakeRepo(), checkActiveBan: async () => { asked = true; return null; } };
    await assert.rejects(disconnectUser('nope', { getIo: () => null, userRepository: repo }), (e) => e.code === 'INVALID_UUID');
    assert.equal(asked, false);
});

// ── 세션 확인 code ──

const stubSession = (t, { ban = null, status } = {}) => {
    const offline = [];
    t.mock.method(userRepository, 'findActiveSession', async (id, userId) => ({
        id, user_id: userId, is_online: true, refresh_token_expires_at: null, User: status === undefined ? undefined : { status },
    }));
    t.mock.method(userRepository, 'checkActiveBan', async () => ban);
    t.mock.method(userRepository, 'markOnlineSessionsOffline', async (uuid) => { offline.push(uuid); });
    return offline;
};

test('세션 확인: 정지면 403 + code ACCOUNT_BANNED + 세션 내림', async (t) => {
    const offline = stubSession(t, { ban: { reason: '도배' } });
    const result = await sessionLifecycle.resolveSession({ uuid: UUID, sessionId: 's' });
    assert.equal(result.status, 403);
    assert.equal(result.code, 'ACCOUNT_BANNED');
    assert.match(result.message, /^정지된 계정입니다/);
    assert.deepEqual(offline, [UUID]);
});

test('세션 확인: 계정 상태가 ACTIVE 아니면 403 + ACCOUNT_INACTIVE + 세션 내림', async (t) => {
    const offline = stubSession(t, { status: 'DORMANT' });
    const result = await sessionLifecycle.resolveSession({ uuid: UUID, sessionId: 's' });
    assert.deepEqual({ ok: result.ok, status: result.status, code: result.code }, { ok: false, status: 403, code: 'ACCOUNT_INACTIVE' });
    assert.deepEqual(offline, [UUID]);
});

test('세션 확인: 상태 ACTIVE거나 상태 정보 없으면 통과 (예전 동작 그대로)', async (t) => {
    stubSession(t, { status: 'ACTIVE' });
    assert.deepEqual(await sessionLifecycle.resolveSession({ uuid: UUID, sessionId: 's' }), { ok: true });
    t.mock.restoreAll();
    stubSession(t);
    assert.deepEqual(await sessionLifecycle.resolveSession({ uuid: UUID, sessionId: 's' }), { ok: true });
});

test('세션 저장소: 살아 있는 세션 찾을 때 계정 상태를 같은 쿼리로 같이 읽음', async (t) => {
    const db = require('../../models');
    let options;
    t.mock.method(db.UserSession, 'findOne', async (o) => { options = o; return null; });
    await userRepository.findActiveSession('s', UUID);
    assert.equal(options.include[0].model, db.User);
    assert.deepEqual(options.include[0].attributes, ['status']);
    assert.equal(options.include[0].required, false);
});

// ── refresh ──

test('refresh: 계정 상태가 ACTIVE 아니면 403 ACCOUNT_INACTIVE + 세션 내림', async (t) => {
    const offline = [];
    const { hashRefreshToken } = require('../../services/auth/account/tokens');
    const raw = 'refresh-raw-token';
    t.mock.method(userRepository, 'withTransaction', async (work) => work({}));
    t.mock.method(userRepository, 'findSessionForRefresh', async () => ({
        id: 's', user_id: UUID, refresh_token_hash: hashRefreshToken(raw), refresh_token_expires_at: new Date(Date.now() + 60_000),
    }));
    t.mock.method(userRepository, 'checkActiveBan', async () => null);
    t.mock.method(userRepository, 'findByUuid', async () => ({ uuid: UUID, status: 'WITHDRAWN', role: 'USER' }));
    t.mock.method(userRepository, 'markOnlineSessionsOffline', async (uuid) => { offline.push(uuid); });
    await assert.rejects(accountService.refresh(raw), (e) => e.status === 403 && e.code === 'ACCOUNT_INACTIVE');
    assert.deepEqual(offline, [UUID]);
});

// ── 소켓 끊김 code ──

const flush = () => new Promise((resolve) => setImmediate(resolve));
const watchedSocket = () => {
    const socket = { data: { user: { uuid: UUID, sessionId: 's' } }, emitted: [], disconnected: 0 };
    socket.emit = (event, payload) => socket.emitted.push({ event, payload });
    socket.disconnect = () => { socket.disconnected += 1; };
    return socket;
};

for (const [code, expected] of [['ACCOUNT_BANNED', 'ACCOUNT_BANNED'], ['ACCOUNT_INACTIVE', 'ACCOUNT_INACTIVE'], [undefined, 'SESSION_EXPIRED'], ['WEIRD', 'SESSION_EXPIRED']]) {
    test(`소켓 주기 검사: 세션 확인 code ${code ?? '없음'} → force_disconnect code ${expected}`, async (t) => {
        t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: false, status: 403, code, message: '끊김' }));
        t.mock.timers.enable({ apis: ['setInterval'] });
        const socket = watchedSocket();
        const watcher = socketAuth.startSessionRevocationWatcher(socket);
        t.after(() => watcher.stop());
        t.mock.timers.tick(socketAuth.SESSION_CHECK_INTERVAL_MS);
        await flush();
        assert.deepEqual(socket.emitted, [{ event: 'force_disconnect', payload: { message: '끊김', code: expected } }]);
        assert.equal(socket.disconnected, 1);
    });
}

test('소켓 사건 검사: 정지면 사건 처리 안 하고 ACCOUNT_BANNED로 끊음', async (t) => {
    t.mock.method(sessionLifecycle, 'resolveSession', async () => ({ ok: false, status: 403, code: 'ACCOUNT_BANNED', message: '정지' }));
    const socket = watchedSocket();
    const listeners = new Map();
    socket.on = (event, fn) => listeners.set(event, fn);
    socketAuth.wrapSocketWithSessionGuard(socket);
    let handled = false;
    socket.on('anything', () => { handled = true; });
    let ack;
    await listeners.get('anything')((reply) => { ack = reply; });
    assert.equal(handled, false);
    assert.equal(ack.ok, false);
    assert.equal(socket.emitted[0].payload.code, 'ACCOUNT_BANNED');
});

// ── 운영 공지 ──

const fakeNotificationService = () => {
    const created = [];
    const emitted = [];
    const seen = new Set();
    return {
        created,
        emitted,
        NOTIFICATION_TYPES: { SYSTEM: 'system' },
        async createNotification(input) {
            const key = `${input.userId}|${input.sourceKey}`;
            if (input.userId === 'fail') throw Object.assign(new Error('FK'), { name: 'SequelizeForeignKeyConstraintError' });
            if (seen.has(key)) return { created: false, notification: { id: key } };
            seen.add(key);
            created.push(input);
            return { created: true, notification: { id: key, type: 'system' } };
        },
        emitNotificationCreated(userId, notification) { emitted.push({ userId, notification }); },
    };
};

test('공지: 접속자 전체에 시스템 알림 저장 + 바로 보냄, 같은 공지 id는 두 번째에 중복', async () => {
    const service = fakeNotificationService();
    const deps = { notificationService: service, onlineUsers: new Map([[UUID, 's1'], [OTHER, 's2']]) };
    const input = { announcementId: 'notice-1', title: ' 점검 안내 ', body: '내일 점검', target: 'online' };
    const first = await sendAnnouncement(input, deps);
    assert.deepEqual({ created: first.created, duplicated: first.duplicated, recipientCount: first.recipientCount }, { created: 2, duplicated: 0, recipientCount: 2 });
    assert.equal(service.created[0].type, 'system');
    assert.equal(service.created[0].sourceKey, announcementSourceKey('notice-1'));
    assert.equal(service.created[0].title, '점검 안내');
    assert.equal(service.emitted.length, 2);
    const second = await sendAnnouncement(input, deps);
    assert.deepEqual({ created: second.created, duplicated: second.duplicated }, { created: 0, duplicated: 2 });
    assert.equal(service.emitted.length, 2);
});

test('공지: uuid 목록이면 그 사람들만 (겹친 uuid 한 번), 한 사람 실패는 세기만', async () => {
    const service = fakeNotificationService();
    const originalError = console.error;
    console.error = () => {};
    let result;
    try {
        result = await sendAnnouncement(
            { announcementId: 'n2', title: 't', body: 'b', target: 'users', userUuids: [UUID, UUID, OTHER] },
            { notificationService: { ...service, createNotification: (i) => (i.userId === OTHER ? Promise.reject(new Error('x')) : service.createNotification(i)) }, onlineUsers: new Map() },
        );
    } finally { console.error = originalError; }
    assert.deepEqual({ recipientCount: result.recipientCount, created: result.created, failed: result.failed }, { recipientCount: 2, created: 1, failed: 1 });
});

test('공지: 모양 검사 (id 모양·제목 길이·본문 길이·대상 종류·uuid 모양)', () => {
    const base = { announcementId: 'a', title: 't', body: 'b', target: 'online' };
    const bads = [
        { ...base, announcementId: '' },
        { ...base, title: 'x'.repeat(121) },
        { ...base, body: '' },
        { ...base, body: 'x'.repeat(501) },
        { ...base, target: 'all' },
        { ...base, target: 'users', userUuids: [] },
        { ...base, target: 'users', userUuids: ['not-uuid'] },
    ];
    for (const bad of bads) assert.throws(() => validateAnnouncement(bad), (e) => e.code === 'INVALID_ANNOUNCEMENT');
    assert.equal(validateAnnouncement(base).target, 'online');
});
