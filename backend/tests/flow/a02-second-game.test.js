'use strict';

// 둘째 판 시험 — 판 끝 뒤 "대기방으로"로 같은 방에 모여 다시 시작: 구성·역할 확인 10초·새 판 id·색·직접 구성 그대로·동료 안 섞임·인원 바뀜
// 목록 A02-B-264~270 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md "둘째 판"), 돌리기: node --env-file=.env.test --test tests/flow/a02-second-game.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 → 꼭 socket 파일보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const matchmaking = require('../../socket/matchmaking');
const gs = require('../../socket/gameSession');
const mf = require('../helpers/matchmakingFixtures');
const { getSessionById } = require('../../game-core/queries/byId');
const { handleReturnToRoom } = require('../../socket/matchmaking/room/returnRoom');
const e2eHooks = require('../../socket/e2e/gameHooks');

const MM = matchmaking.__testables;
const G = gs.__testables;

// 방 시간: 방 설정 최소값 (토론·투표 30초, 재판 15초, 밤 30초)
const TIMES = { dayDiscussionTime: 30, dayVoteTime: 30, tribunalTime: 15, nightActionTime: 30 };

// ── 대기방 → 시작 → 판 끝 → 같은 방 세상 (이 파일 안에서만 씀, 공용으로 올릴 것) ──
// 가짜 시계(setTimeout·Date)를 켬 → 역할 확인 10초·낮·재판·밤 타이머가 모두 이 시계를 따름
function makeWorld(t) {
    gf.resetCore();
    matchmaking.__resetStateForTests();
    gs.__resetStateForTests();
    mf.installFakeMatchmakingDeps(matchmaking);
    // 낮 표 기록·업적·전적 저장은 DB에 씀 → 아무것도 안 하는 함수로 바꿔 끼움
    G.__setRecordVoteParticipationForTests(async () => {});
    G.__setEvaluateAchievementsForTests(async () => {});
    G.__setGameResultPersistForTests(async () => {});
    t.mock.method(Math, 'random', () => 0);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
    const registry = new Map();
    matchmaking.setOnlineUsersRegistry(registry);
    gs.setOnlineUsersRegistry(registry);
    const io = mf.createFakeIo([]);
    t.after(() => {
        gs.__resetStateForTests();
        matchmaking.__resetStateForTests();
        e2eHooks.clearRolePresets();
        gf.resetCore();
        G.__setRecordVoteParticipationForTests(null);
        G.__setEvaluateAchievementsForTests(null);
        G.__setGameResultPersistForTests(null);
    });
    const sockets = new Map();
    const connect = (uuid) => {
        const s = mf.createFakeSocket(uuid);
        io.sockets.sockets.set(s.id, s);
        registry.set(uuid, s.id);
        sockets.set(uuid, s);
        return s;
    };
    const sock = (uuid) => sockets.get(uuid);
    const received = (uuid, event) => sock(uuid).received.filter((e) => e.event === event).map((e) => e.payload);
    // 화면이 보내는 것처럼 판 사건 핸들러 부르고 답 받기
    const ask = (handler, uuid, payload) => mf.callAsPromise(handler, io, sock(uuid), uuid, payload);

    // 방장 시작 (presets = { uuid: 역할 } 이면 그 방만 역할 미리 정하기 손잡이를 켜고 시작)
    async function start(room, host, presets = null) {
        const saved = process.env.E2E_HOOKS;
        if (presets) {
            process.env.E2E_HOOKS = '1';
            e2eHooks.setRolePresets(presets, { roomId: room.roomId });
        }
        try {
            return await mf.callAsPromise(MM.handleStartGame, io, sock(host), host, mf.startPayload(room));
        } finally {
            if (saved === undefined) delete process.env.E2E_HOOKS;
            else process.env.E2E_HOOKS = saved;
        }
    }

    // 첫 판: 방 만들기 → 코드 입장 → 전원 준비 → 시작 (방장 = 첫 사람)
    async function openAndStart({ prefix, n, maxPlayers = n, jokerCount = 1, roleCounts = null, presets = null }) {
        const uuids = Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
        for (const uuid of uuids) connect(uuid);
        const [host, ...guests] = uuids;
        const payload = {
            accessType: 'code', maxPlayers, jokerCount, ...TIMES,
            ...(roleCounts ? { roleCompositionMode: 'custom', roleCounts: { JOKER: jokerCount, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts } } : {}),
        };
        const created = await mf.callAsPromise(MM.handleCreateRoom, io, sock(host), host, payload);
        assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
        for (const uuid of guests) await MM.handleJoinRoomByCode(io, sock(uuid), uuid, created.room.roomCode);
        for (const uuid of uuids) await mf.callAsPromise(MM.handleSetReady, io, sock(uuid), uuid, mf.readyPayload(created.room));
        const reply = await start(created.room, host, presets);
        assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`);
        return { uuids, host, gameId: reply.gameId, roomCode: created.room.roomCode, ...gameView(uuids, reply.gameId) };
    }

    // 그 판 시작 알림으로 직업 모으기 → { roles: uuid → 직업, started: uuid → 알림 }
    function gameView(uuids, gameId) {
        const started = new Map(uuids.map((uuid) => [uuid, received(uuid, 'game_started').find((p) => p.gameId === gameId)]));
        const roles = new Map([...started].map(([uuid, p]) => [uuid, p.state.self.role]));
        return { started, roles };
    }

    // 판 상태가 맞을 때까지 가짜 시계를 1초씩 넘김 (판을 끝까지 몰고 갈 때만 씀, 확인은 받은 알림으로)
    function advanceUntil(gameId, done, limitMs = 600_000) {
        for (let spent = 0; spent <= limitMs; spent += 1_000) {
            const session = getSessionById(gameId);
            if (!session || done(session)) return session;
            t.mock.timers.tick(1_000);
        }
        throw new Error(`판이 ${limitMs}ms 안에 원하는 상태가 안 됨`);
    }

    // 낮에 한 사람을 표로 재판에 세우고 전원 유죄로 처형 (피고는 기권)
    async function voteOut(g, target) {
        const session = advanceUntil(g.gameId, (s) => s.phase === 'DAY');
        const alive = [...session.players.values()].filter((p) => p.alive).map((p) => p.uuid);
        for (const uuid of alive) await ask(G.handleAcknowledgeDayVoteReady, uuid, { gameId: g.gameId });
        for (const uuid of alive) {
            const r = await ask(G.handleSubmitDayVote, uuid, { gameId: g.gameId, targetId: uuid === target ? null : target });
            assert.equal(r.ok, true, `${uuid} 낮 표 거절: ${r.code}`);
        }
        const tribunal = advanceUntil(g.gameId, (s) => s.phase !== 'DAY');
        assert.equal(tribunal.phase, 'TRIBUNAL', '재판으로 안 감');
        for (const uuid of alive.filter((u) => u !== target)) {
            await ask(G.handleCastTribunalVote, uuid, { gameId: g.gameId, dayIndex: tribunal.dayIndex, vote: 'GUILTY' });
        }
        advanceUntil(g.gameId, (s) => s.phase !== 'TRIBUNAL');
    }

    // 판 끝까지: 광대를 차례로 처형 (밤은 아무도 안 내고 마감까지)
    async function playToCitizenWin(g) {
        for (const [uuid, role] of g.roles) {
            if (role !== 'JOKER') continue;
            await voteOut(g, uuid);
        }
        assert.equal(getSessionById(g.gameId)?.phase, 'ENDED', '판이 안 끝남');
    }

    // 결과 화면에서 "대기방으로" (방장 먼저) → 돌아온 방 내용
    async function returnAll(g, uuids = g.uuids) {
        const order = [g.host, ...uuids.filter((u) => u !== g.host)];
        let room = null;
        for (const uuid of order) {
            const r = await mf.callAsPromise(handleReturnToRoom, io, sock(uuid), uuid, { gameId: g.gameId });
            assert.equal(r.ok, true, `${uuid} 대기방으로 실패: ${r.code} ${r.message}`);
            room = r.room;
        }
        return room;
    }

    // 돌아온 방에서 전원 준비 → 방장 시작 → 둘째 판
    async function startAgain(room, uuids, host, presets = null) {
        for (const uuid of uuids) {
            const r = await mf.callAsPromise(MM.handleSetReady, io, sock(uuid), uuid, mf.readyPayload(room));
            assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`);
        }
        const reply = await start(room, host, presets);
        return { reply, ...(reply.ok ? gameView(uuids, reply.gameId) : {}) };
    }

    return { io, connect, sock, received, openAndStart, playToCitizenWin, returnAll, startAgain };
}

// 직업 수 세기 → { JOKER, DOCTOR, GUARD, WITCH_HUNTER, CITIZEN }
function countRoles(roles) {
    const counts = { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 0 };
    for (const role of roles.values()) counts[role] += 1;
    return counts;
}

test('A02-B-264 5명 판 끝 → 5명 모두 같은 방으로 → 둘째 판 시작 → 직업 수 J1C4', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b264', n: 5 });
    await w.playToCitizenWin(g);
    const room = await w.returnAll(g);
    const second = await w.startAgain(room, g.uuids, g.host);
    assert.equal(second.reply.ok, true, `둘째 판 시작 실패: ${second.reply.message}`);
    assert.deepEqual(countRoles(second.roles), { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 4 });
});

test('A02-B-265 6명 둘째 판 → 0일째 역할 확인, 10초에 1일째 낮', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b265', n: 6 });
    await w.playToCitizenWin(g);
    const room = await w.returnAll(g);
    const second = await w.startAgain(room, g.uuids, g.host);
    assert.equal(second.reply.ok, true, `둘째 판 시작 실패: ${second.reply.message}`);
    const dayOf = (uuid) => w.received(uuid, 'game_phase_changed').filter((p) => p.gameId === second.reply.gameId);
    for (const [uuid, payload] of second.started) {
        assert.equal(payload.state.phase, 'ROLE_REVEAL', uuid);
        assert.equal(payload.state.dayIndex, 0, uuid);
    }
    t.mock.timers.tick(9_999);
    for (const uuid of g.uuids) assert.equal(dayOf(uuid).length, 0, `${uuid} 10초 전에 낮`);
    t.mock.timers.tick(1);
    for (const uuid of g.uuids) {
        const [day] = dayOf(uuid);
        assert.ok(day, `${uuid} 낮 알림 없음`);
        assert.equal(day.phase, 'DAY');
        assert.equal(day.dayIndex, 1);
    }
});

test('A02-B-266 7명 둘째 판 → 새 판 id, 색 0~9 안·안 겹침', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b266', n: 7 });
    await w.playToCitizenWin(g);
    const room = await w.returnAll(g);
    const second = await w.startAgain(room, g.uuids, g.host);
    assert.equal(second.reply.ok, true, `둘째 판 시작 실패: ${second.reply.message}`);
    assert.notEqual(second.reply.gameId, g.gameId);
    const themes = second.started.get(g.host).state.players.map((p) => p.themeIndex);
    assert.equal(themes.length, 7);
    for (const th of themes) assert.ok(Number.isInteger(th) && th >= 0 && th <= 9, `색 번호 ${th}`);
    assert.equal(new Set(themes).size, 7, `색이 겹침: ${themes.join(',')}`);
});

test('A02-B-267 8명 J2D2G2W2 판 끝 → 같은 방 둘째 판 → 같은 구성', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b267', n: 8, jokerCount: 2, roleCounts: { DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
    await w.playToCitizenWin(g);
    const room = await w.returnAll(g);
    const second = await w.startAgain(room, g.uuids, g.host);
    assert.equal(second.reply.ok, true, `둘째 판 시작 실패: ${second.reply.message}`);
    assert.deepEqual(countRoles(second.roles), { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2, CITIZEN: 0 });
});

test('A02-B-268 7명, 첫 판 의사 A·B → 둘째 판 A 시민·B 광대로 정해 둠 → A는 allies 칸 없음, B 목록에 A 없음', async (t) => {
    const w = makeWorld(t);
    const [a, b] = ['b268-2', 'b268-4'];
    const g = await w.openAndStart({ prefix: 'b268', n: 7, roleCounts: { DOCTOR: 2 }, presets: { [a]: 'DOCTOR', [b]: 'DOCTOR' } });
    assert.equal(g.roles.get(a), 'DOCTOR', '첫 판 A 직업이 안 맞음');
    assert.equal(g.roles.get(b), 'DOCTOR', '첫 판 B 직업이 안 맞음');
    assert.deepEqual(g.started.get(a).state.self.allies, [b]);
    await w.playToCitizenWin(g);
    const room = await w.returnAll(g);
    const second = await w.startAgain(room, g.uuids, g.host, { [a]: 'CITIZEN', [b]: 'JOKER' });
    assert.equal(second.reply.ok, true, `둘째 판 시작 실패: ${second.reply.message}`);
    const selfA = second.started.get(a).state.self;
    const selfB = second.started.get(b).state.self;
    assert.equal(selfA.role, 'CITIZEN', '둘째 판 A 직업이 안 맞음');
    assert.equal(selfB.role, 'JOKER', '둘째 판 B 직업이 안 맞음');
    assert.equal(Object.hasOwn(selfA, 'allies'), false);
    assert.equal(selfB.allies.includes(a), false);
});

test('A02-B-269 5명 판 끝, 결과 화면 중 같은 방 둘째 판 시작 → PLAYER_ALREADY_IN_SESSION 아님, 시작 됨', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b269', n: 5 });
    await w.playToCitizenWin(g);
    // 결과 화면 180초 안 (시계를 안 넘김)
    const room = await w.returnAll(g);
    const second = await w.startAgain(room, g.uuids, g.host);
    assert.notEqual(second.reply.code, 'PLAYER_ALREADY_IN_SESSION');
    assert.equal(second.reply.ok, true, `둘째 판 시작 실패: ${second.reply.message}`);
    for (const uuid of g.uuids) assert.ok(second.started.get(uuid), `${uuid} 둘째 판 알림 없음`);
});

test('A02-B-270 6명 판 끝, 같은 방에 새 사람 1명 들어와 7명 → 자동 구성 7명 기준 J1D1C5', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b270', n: 6, maxPlayers: 7 });
    await w.playToCitizenWin(g);
    const room = await w.returnAll(g);
    const newcomer = 'b270-new';
    w.connect(newcomer);
    await MM.handleJoinRoomByCode(w.io, w.sock(newcomer), newcomer, g.roomCode);
    assert.equal(matchmaking.hasRoomMembership(newcomer), true, '새 사람이 방에 못 들어감');
    const everyone = [...g.uuids, newcomer];
    const second = await w.startAgain(room, everyone, g.host);
    assert.equal(second.reply.ok, true, `둘째 판 시작 실패: ${second.reply.message}`);
    assert.deepEqual(countRoles(second.roles), { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 5 });
});
