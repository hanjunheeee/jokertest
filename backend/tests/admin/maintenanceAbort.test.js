'use strict';

// 점검 판 무효 끝·대기방 닫기 시험 (AD-131·134·135·136·137·138·142)
// 가짜 소켓 세상(gameFixtures)에서 진짜 판 끝내기 길을 돌림, 전적 저장·업적은 가짜 주입 (진짜 DB 안 붙음)
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../audit-2026-11-09/gameFixtures');

const { core } = F;
const gs = require('../../socket/gameSession');
const matchmaking = require('../../socket/matchmaking');
const maintenance = require('../../services/ops/maintenance');
const liveService = require('../../services/ops/live');
const { abortGamesForMaintenance } = require('../../socket/gameSession/departure/maintenanceAbort');
const { closeRoomsForMaintenance } = require('../../socket/matchmaking/room/maintenanceClose');
const { validSettingsPayload } = require('../helpers/matchmakingFixtures');

const H = gs.__testables;
const persisted = [];
let achievementCalls = 0;

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

const resetAll = () => {
    core.__resetStateForTests();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    maintenance.__setStateForTests({ enabled: false });
    persisted.length = 0;
    achievementCalls = 0;
    H.__setGameResultPersistForTests(async (record) => { persisted.push(record); });
    H.__setRecordVoteParticipationForTests(async () => ({ recorded: true }));
    H.__setEvaluateAchievementsForTests(async () => { achievementCalls += 1; });
};
test.beforeEach(resetAll);
test.afterEach(resetAll);

let seq = 0;
const world = ({ n = 5, phase = 'DAY' } = {}) => {
    seq += 1;
    const session = F.startGame({ id: `mt${seq}`, n });
    if (phase !== 'ROLE_REVEAL') F.toDay(session);
    if (phase === 'NIGHT') F.toNight(session);
    const w = F.socketWorld(gs, session);
    return { session, ...w, uuids: [...session.players.keys()] };
};

// ── AD-138: 판 참가자 소켓 game_ended ──

test('AD-138: 진행 중 판 → 참가자 전원 game_ended { reason: MAINTENANCE }, 판 장부에서 빠짐', () => {
    const { session, received, uuids, io } = world();
    assert.equal(abortGamesForMaintenance(io), 1);
    for (const uuid of uuids) {
        assert.deepEqual(received(uuid, 'game_ended').map((e) => e.payload), [{ gameId: session.id, reason: 'MAINTENANCE' }]);
        assert.equal(core.getActiveSessionRoutingInfo(uuid), null);
    }
    assert.equal(liveService.getLiveSummary().gameCount, 0);
});

test('AD-138: 역할 공개·밤 판도 끝냄, 판 여럿이면 다 셈', () => {
    const a = world({ phase: 'ROLE_REVEAL' });
    const b = world({ phase: 'NIGHT' });
    const io = F.createFakeIo([...a.sockets.values(), ...b.sockets.values()]);
    assert.equal(abortGamesForMaintenance(io), 2);
    assert.equal(liveService.getLiveSummary().gameCount, 0);
});

// ── AD-134·135: 무효 ──

test('AD-134: 강제 종료 판 전적 — completed false·winner NONE·win_reason MAINTENANCE·won 전부 null·통계 줄 없음', async () => {
    const { session, io, uuids } = world();
    // 판 중간에 이미 나간 사람이 있어도 패로 안 셈
    core.commitParticipantDeparture(session, uuids[4]);
    abortGamesForMaintenance(io);
    await F.flush();
    assert.equal(persisted.length, 1);
    const { result, players, stats } = persisted[0];
    assert.deepEqual([result.completed, result.winner, result.win_reason], [false, 'NONE', 'MAINTENANCE']);
    assert.deepEqual(players.map((p) => p.won), [null, null, null, null, null]);
    assert.equal(stats.length, 0);
});

test('AD-135: 강제 종료 판엔 업적 평가(보상 장부) 안 돎', async () => {
    const { io } = world();
    abortGamesForMaintenance(io);
    await F.flush();
    await F.flush();
    assert.equal(persisted.length, 1);
    assert.equal(achievementCalls, 0);
});

// ── AD-136·142: 옛 동작 지킴 ──

test('AD-136: 결과 화면 판(ENDED)은 안 건드림', () => {
    const { session, io, received, uuids } = world();
    session.phase = 'ENDED';
    session.winResult = { winner: 'CITIZEN' };
    assert.equal(abortGamesForMaintenance(io), 0);
    assert.equal(received(uuids[0], 'game_ended').length, 0);
    assert.equal(liveService.getLiveSummary().gameCount, 1);
    assert.equal(session.abortReason, undefined);
});

test('AD-142: 기존 깨진 판(나간 사람 패)은 그대로 — win_reason ABORTED, 나간 사람 won false, 업적 평가 돎', async () => {
    const { session, io, uuids } = world();
    const leaver = uuids[0];
    const ended = core.endGameSessionForPlayer(leaver, 'PARTICIPANT_LEFT', session.id);
    H.finalizeGameSessionEnd(io, ended.session, ended.reason, leaver, ended.cleanupUuids);
    await F.flush();
    await F.flush();
    const { result, players, stats } = persisted[0];
    assert.equal(result.win_reason, 'ABORTED');
    assert.equal(players.find((p) => p.user_id === leaver).won, false);
    assert.equal(stats.length, 1);
    assert.equal(achievementCalls, uuids.length, "사람마다 한 번씩 업적 평가");
});

// ── AD-137: 대기방 닫힘 ──

const registered = (uuid) => {
    const socket = F.createFakeSocket(uuid);
    return socket;
};
const ackOf = (socket, event, payload) => new Promise((resolve) => socket.trigger(event, payload, resolve));

test('AD-137: 대기방 닫힘 → room_deleted { code: MAINTENANCE, message }, 방 장부 비움', async () => {
    const host = registered('aaaaaaaa-0000-4000-8000-000000000001');
    const io = F.createFakeIo([host]);
    matchmaking.registerMatchmakingHandlers(io, host, host.data.user.uuid, { getCurrentSocketId: () => host.id });
    const created = await ackOf(host, 'create_room', validSettingsPayload());
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(liveService.getLiveSummary().roomCount, 1);

    assert.equal(closeRoomsForMaintenance(io, '2시까지 점검'), 1);
    const deleted = host.received.filter((e) => e.event === 'room_deleted').map((e) => e.payload);
    assert.deepEqual(deleted, [{ code: 'MAINTENANCE', message: '2시까지 점검' }]);
    assert.equal(liveService.getLiveSummary().roomCount, 0);
    assert.equal(host.rooms.has(created.room.roomId), false);
    const current = await ackOf(host, 'get_current_room', {});
    assert.ok(!current?.room, JSON.stringify(current));
});

test('AD-137: 방 없으면 0, 안내 문구 없으면 기본 문구', () => {
    assert.equal(closeRoomsForMaintenance(F.createFakeIo([]), null), 0);
});

// ── AD-131: 시작 시각 뒤 새 판 막힘 (기존 거절) ──

test('AD-131: 시작 시각 뒤 방 만들기·코드 입장·시작 거절 MAINTENANCE + 안내 문구', async () => {
    maintenance.__setStateForTests({ enabled: true, message: '정기 점검', startsAt: new Date(Date.now() - 1_000) });
    const socket = registered('aaaaaaaa-0000-4000-8000-000000000002');
    const io = F.createFakeIo([socket]);
    matchmaking.registerMatchmakingHandlers(io, socket, socket.data.user.uuid, { getCurrentSocketId: () => socket.id });
    const created = await ackOf(socket, 'create_room', validSettingsPayload());
    assert.deepEqual([created.code, created.message], ['MAINTENANCE', '정기 점검']);
    const started = await ackOf(socket, 'start_game', { roomId: 'r', settingsVersion: 1 });
    assert.equal(started.code, 'MAINTENANCE');
    socket.trigger('join_room_by_code', { roomCode: 'ABCD12' });
    const failed = socket.emitted.filter((e) => e.event === 'room_join_failed').at(-1)?.payload;
    assert.deepEqual([failed.code, failed.message], ['MAINTENANCE', '정기 점검']);
});

test('AD-131: 시작 시각 전엔 아직 안 막음', async () => {
    maintenance.__setStateForTests({ enabled: true, startsAt: new Date(Date.now() + 600_000) });
    const socket = registered('aaaaaaaa-0000-4000-8000-000000000003');
    const io = F.createFakeIo([socket]);
    matchmaking.registerMatchmakingHandlers(io, socket, socket.data.user.uuid, { getCurrentSocketId: () => socket.id });
    const created = await ackOf(socket, 'create_room', validSettingsPayload());
    assert.equal(created.ok, true, JSON.stringify(created));
});
