'use strict';

// 운영 받침 시험: 점검 모드 (DB 다시 읽기·켜짐/꺼짐·시작 전·방 만들기/시작/코드 입장/자동 매칭 거절·진행 중 판은 그대로)
// 소켓 처리기는 가짜 소켓에 등록해 사건을 직접 부름 (진짜 DB 안 씀)
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db';

const test = require('node:test');
const assert = require('node:assert/strict');

const maintenance = require('../../services/ops/maintenance');
const matchmaking = require('../../socket/matchmaking');
const liveService = require('../../services/ops/live');
const { createFakeSocket, createFakeIo, validSettingsPayload } = require('../helpers/matchmakingFixtures');

const UUID = 'aaaaaaaa-0000-4000-8000-000000000001';

matchmaking.__setUserRepositoryForTests({ findByUuid: async (uuid) => ({ uuid, nickname: `닉-${uuid.slice(-2)}` }) });
matchmaking.__setEconomyServiceForTests({
    getPublicProfileLoadouts: async (ids) => Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }])),
    getGameStartLoadouts: async () => ({}),
    getEmojiPalette: async () => ({ slots: [], owned: [] }),
});
matchmaking.__setGameInviteServiceForTests({
    cancelPendingInvitesForRoom: async () => [],
    cancelPendingInvitesBetween: async () => [],
    recordEntryInterrupted: async () => true,
});
matchmaking.__setGameResultRepositoryForTests({ getAccountRecordSummaries: async (ids) => new Map(ids.map((id) => [id, { totalGames: 0, winRate: 0 }])) });

test.beforeEach(() => {
    maintenance.__setStateForTests({ enabled: false });
    matchmaking.__resetStateForTests();
});
test.after(() => maintenance.__setStateForTests({ enabled: false }));

// 점검 한 줄 가짜 db
const dbWith = (row, { fail = false } = {}) => ({
    MaintenanceState: {
        async findOne({ where }) {
            if (fail) throw new Error('DB 꺼짐');
            assert.equal(where.id, 1);
            return row;
        },
    },
});

// 처리기 등록한 가짜 소켓
const registered = () => {
    const socket = createFakeSocket(UUID);
    const io = createFakeIo([socket]);
    matchmaking.registerMatchmakingHandlers(io, socket, UUID, { getCurrentSocketId: () => socket.id });
    return socket;
};
const ackOf = (socket, event, payload) => new Promise((resolve) => socket.trigger(event, payload, resolve));
const lastJoinFailed = (socket) => socket.emitted.filter((e) => e.event === 'room_join_failed').at(-1)?.payload;

// ── 상태 읽기 ──

test('점검: 줄 없으면 꺼짐으로 읽음', async () => {
    const state = await maintenance.reloadMaintenance({ db: dbWith(null) });
    assert.equal(state.enabled, false);
    assert.equal(maintenance.maintenanceRejection(), null);
});

test('점검: 켜짐 줄 읽으면 거절 답에 MAINTENANCE 코드와 안내 문구', async () => {
    await maintenance.reloadMaintenance({ db: dbWith({ is_enabled: 1, message: ' 2시까지 점검 ', starts_at: null, ends_at: '2026-11-09T05:00:00Z' }) });
    const rejection = maintenance.maintenanceRejection();
    assert.equal(rejection.code, 'MAINTENANCE');
    assert.equal(rejection.message, '2시까지 점검');
    assert.equal(rejection.endsAt, '2026-11-09T05:00:00.000Z');
});

test('점검: 안내 문구 비면 기본 문구', async () => {
    await maintenance.reloadMaintenance({ db: dbWith({ is_enabled: true, message: '   ' }) });
    assert.equal(maintenance.maintenanceRejection().message, maintenance.DEFAULT_MESSAGE);
});

test('점검: 시작 시각 전이면 아직 안 막고, 지나면 막음', async () => {
    const startsAt = new Date('2026-11-09T10:00:00Z');
    await maintenance.reloadMaintenance({ db: dbWith({ is_enabled: true, starts_at: startsAt }) });
    assert.equal(maintenance.isMaintenanceActive(new Date('2026-11-09T09:59:59Z')), false);
    assert.equal(maintenance.isMaintenanceActive(new Date('2026-11-09T10:00:00Z')), true);
});

test('점검: 끝 예정 시각이 지나도 자동으로 안 꺼짐 (관리자가 꺼야 함)', async () => {
    await maintenance.reloadMaintenance({ db: dbWith({ is_enabled: true, ends_at: '2020-01-01T00:00:00Z' }) });
    assert.equal(maintenance.isMaintenanceActive(new Date('2026-11-09T00:00:00Z')), true);
});

test('점검: 다시 읽기 실패하면 있던 상태 그대로 (읽기 오류로 풀리지 않음)', async () => {
    maintenance.__setStateForTests({ enabled: true });
    await assert.rejects(maintenance.reloadMaintenance({ db: dbWith(null, { fail: true }) }));
    assert.equal(maintenance.isMaintenanceActive(), true);
});

test('점검: 꺼짐으로 다시 읽으면 바로 풀림', async () => {
    maintenance.__setStateForTests({ enabled: true });
    await maintenance.reloadMaintenance({ db: dbWith({ is_enabled: false }) });
    assert.equal(maintenance.maintenanceRejection(), null);
});

// ── 소켓 거절 ──

test('점검 켜짐: 방 만들기 거절 (MAINTENANCE, 방 안 생김)', async () => {
    maintenance.__setStateForTests({ enabled: true, message: '점검 중' });
    const socket = registered();
    const reply = await ackOf(socket, 'create_room', validSettingsPayload());
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'MAINTENANCE');
    assert.equal(reply.message, '점검 중');
    assert.equal(liveService.getLiveSummary().roomCount, 0);
});

test('점검 켜짐: 게임 시작 거절', async () => {
    maintenance.__setStateForTests({ enabled: true });
    const socket = registered();
    const reply = await ackOf(socket, 'start_game', { roomId: 'r', settingsVersion: 1 });
    assert.equal(reply.code, 'MAINTENANCE');
});

test('점검 켜짐: 코드 입장 거절 (room_join_failed MAINTENANCE)', () => {
    maintenance.__setStateForTests({ enabled: true, message: '곧 끝나요' });
    const socket = registered();
    socket.trigger('join_room_by_code', { roomCode: 'ABCD12' });
    const failed = lastJoinFailed(socket);
    assert.equal(failed.code, 'MAINTENANCE');
    assert.equal(failed.message, '곧 끝나요');
});

test('점검 켜짐: 자동 매칭도 거절', () => {
    maintenance.__setStateForTests({ enabled: true });
    const socket = registered();
    socket.trigger('join_matchmaking');
    assert.equal(lastJoinFailed(socket).code, 'MAINTENANCE');
});

test('점검 켜짐: 답 함수 없는 방 만들기도 던지지 않음', () => {
    maintenance.__setStateForTests({ enabled: true });
    const socket = registered();
    assert.doesNotThrow(() => socket.trigger('create_room', validSettingsPayload()));
});

test('점검 꺼짐: 방 만들기 그대로 진행 (방 생김)', async () => {
    const socket = registered();
    const reply = await ackOf(socket, 'create_room', validSettingsPayload());
    assert.equal(reply.ok, true, JSON.stringify(reply));
    assert.equal(liveService.getLiveSummary().roomCount, 1);
});

test('점검 켜짐: 이미 있던 방은 남고 방 안 행동(나가기)은 막지 않음', async () => {
    const socket = registered();
    const created = await ackOf(socket, 'create_room', validSettingsPayload());
    assert.equal(created.ok, true);
    maintenance.__setStateForTests({ enabled: true });
    assert.equal(liveService.getLiveSummary().roomCount, 1);
    socket.trigger('leave_room');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(lastJoinFailed(socket), undefined, '나가기에 점검 거절이 붙음');
});

test('점검 켜짐: 진행 중 판은 장부에 그대로 (점검이 판을 안 건드림)', () => {
    const gameSessions = new Map([['g1', { id: 'g1', roomId: 'r1', roomCode: 'AB12', phase: 'NIGHT', dayIndex: 2, startedAt: 0, players: new Map([['u1', { alive: true }], ['u2', { alive: false }]]) }]]);
    maintenance.__setStateForTests({ enabled: true });
    const summary = liveService.getLiveSummary({ gameRooms: new Map(), gameSessions, onlineUsers: new Map([['u1', 's1']]) });
    assert.equal(summary.gameCount, 1);
    assert.deepEqual(summary.games[0], {
        gameId: 'g1', roomId: 'r1', roomCode: 'AB12', playerCount: 2, aliveCount: 1, phase: 'NIGHT', dayIndex: 2, startedAt: '1970-01-01T00:00:00.000Z',
    });
});

test('지금 상황: 대기방 요약엔 명단·닉네임 없음 (인원 수만)', () => {
    const rooms = new Map([['r1', { id: 'r1', code: 'XY99', accessType: 'code', settings: { maxPlayers: 8 }, players: new Map([['u1', { nickname: '비밀닉' }]]) }]]);
    const summary = liveService.getLiveSummary({ gameRooms: rooms, gameSessions: new Map(), onlineUsers: new Map() });
    assert.deepEqual(summary.rooms[0], { roomId: 'r1', code: 'XY99', accessType: 'code', playerCount: 1, maxPlayers: 8 });
    assert.ok(!JSON.stringify(summary).includes('비밀닉'));
    assert.ok(!JSON.stringify(summary).includes('u1'));
});
