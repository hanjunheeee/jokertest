'use strict';

// 스냅샷 시험 — 역할 확인 중·첫 낮·첫 밤에 새로고침해도 내 직업·팀·같은 직업 목록 그대로, 남의 직업 안 샘, 판 밖 사람·남의 uuid 요청
// 목록 A02-B-245~263 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md "스냅샷"), 돌리기: node --env-file=.env.test --test tests/flow/a02-snapshot.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 → 꼭 socket 파일보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const matchmaking = require('../../socket/matchmaking');
const gs = require('../../socket/gameSession');
const mf = require('../helpers/matchmakingFixtures');
const testUtils = require('../helpers/gameSession.testUtils');
const { getSessionById } = require('../../game-core/queries/byId');

const MM = matchmaking.__testables;
const G = gs.__testables;

// ── 대기방 → 시작 세상 (이 파일 안에서만 씀, 공용으로 올릴 것) ──
// 가짜 시계(setTimeout·Date)를 켬 → 역할 확인 10초를 시계로 넘김
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

    // 방 열고 시작 (방장 = 첫 사람) → { uuids, gameId, started: uuid → 받은 game_started 내용 }
    async function openAndStart({ prefix, n, jokerCount = 1, roleCounts = null }) {
        const uuids = Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
        for (const uuid of uuids) connect(uuid);
        const [host, ...guests] = uuids;
        const payload = {
            accessType: 'code', maxPlayers: n, jokerCount, dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60,
            ...(roleCounts ? { roleCompositionMode: 'custom', roleCounts: { JOKER: jokerCount, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts } } : {}),
        };
        const created = await mf.callAsPromise(MM.handleCreateRoom, io, sock(host), host, payload);
        assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
        for (const uuid of guests) await MM.handleJoinRoomByCode(io, sock(uuid), uuid, created.room.roomCode);
        for (const uuid of uuids) await mf.callAsPromise(MM.handleSetReady, io, sock(uuid), uuid, mf.readyPayload(created.room));
        const reply = await mf.callAsPromise(MM.handleStartGame, io, sock(host), host, mf.startPayload(created.room));
        assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`);
        const started = new Map(uuids.map((uuid) => [uuid, received(uuid, 'game_started').at(-1)]));
        return { uuids, gameId: reply.gameId, started };
    }

    // 화면이 보내는 것처럼 스냅샷 요청
    const snapshot = (uuid, payload) => mf.callAsPromise(G.handleGetSessionSnapshot, io, sock(uuid), uuid, payload);

    return { io, connect, sock, received, openAndStart, snapshot };
}

// 내 칸 중 직업·팀·같은 직업 목록만 (allies 칸이 없으면 없는 채로)
const roleView = (self) => ({
    role: self.role,
    team: self.team,
    ...(Object.hasOwn(self, 'allies') ? { allies: [...self.allies].sort() } : {}),
});

// 받은 시작 알림으로 직업별 사람 묶기 → { DOCTOR: [uuid…], … }
function rolesFromStarted(started) {
    const byRole = {};
    for (const [uuid, payload] of started) (byRole[payload.state.self.role] ??= []).push(uuid);
    return byRole;
}

// 남의 직업 = 그 사람이 자기 알림에서 받은 직업 → 비밀 목록
const secretsFor = (started, viewer) => [...started]
    .filter(([uuid]) => uuid !== viewer)
    .map(([uuid, p]) => ({ value: p.state.self.role, label: `role(${uuid})` }));

// 인원별 판 (10명은 J2D2G2W2C2)
const optsFor = (n) => (n === 10 ? { n, jokerCount: 2, roleCounts: { DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } } : { n });

// A02-B-245~250 역할 확인 중 새로고침
for (let n = 5; n <= 10; n += 1) {
    const no = `A02-B-${String(245 + n - 5).padStart(3, '0')}`;
    test(`${no} ${n}명 역할 확인 중, 사람마다 get_session_snapshot → 직업·팀·allies가 시작 알림과 같음`, async (t) => {
        const w = makeWorld(t);
        const g = await w.openAndStart({ prefix: `b${245 + n - 5}`, ...optsFor(n) });
        for (const uuid of g.uuids) {
            const snap = await w.snapshot(uuid, { gameId: g.gameId });
            assert.equal(snap.ok, true, `${uuid} 스냅샷 거절: ${snap.code}`);
            assert.equal(snap.phase, 'ROLE_REVEAL');
            assert.deepEqual(roleView(snap.self), roleView(g.started.get(uuid).state.self), uuid);
        }
    });
}

// A02-B-251~256 첫 낮 스냅샷: allies 그대로, 남의 직업 없음
for (let n = 5; n <= 10; n += 1) {
    const no = `A02-B-${String(251 + n - 5).padStart(3, '0')}`;
    test(`${no} ${n}명 1일째 낮 스냅샷 → allies 그대로, 남의 직업 없음`, async (t) => {
        const w = makeWorld(t);
        const g = await w.openAndStart({ prefix: `b${251 + n - 5}`, n });
        t.mock.timers.tick(10_000);
        for (const uuid of g.uuids) {
            const snap = await w.snapshot(uuid, { gameId: g.gameId });
            assert.equal(snap.ok, true, `${uuid} 스냅샷 거절: ${snap.code}`);
            assert.equal(snap.phase, 'DAY');
            assert.equal(snap.dayIndex, 1);
            assert.deepEqual(roleView(snap.self), roleView(g.started.get(uuid).state.self), uuid);
            for (const p of snap.players) assert.equal(Object.hasOwn(p, 'role'), false, `${uuid}가 받은 ${p.uuid} 칸에 직업`);
            testUtils.assertNoForbiddenPrivateData(snap, secretsFor(g.started, uuid));
        }
    });
}

// 판을 1일째 밤으로 (역할 확인 마감 → 낮 → 밤, 판 상태로 바로)
function toFirstNight(gameId) {
    const session = getSessionById(gameId);
    gf.toDay(session);
    gf.toNight(session);
    return session;
}

// A02-B-257~260 1일 밤 새로고침 뒤 동료
const NIGHT_PAIRS = [
    ['A02-B-257', '광대 2', 'JOKER', { n: 6, jokerCount: 2 }],
    ['A02-B-258', '의사 2', 'DOCTOR', { n: 7, roleCounts: { DOCTOR: 2 } }],
    ['A02-B-259', '경비원 2', 'GUARD', { n: 8, roleCounts: { GUARD: 2 } }],
    ['A02-B-260', '마녀사냥꾼 2', 'WITCH_HUNTER', { n: 10, roleCounts: { WITCH_HUNTER: 2 } }],
];
for (const [no, label, role, opts] of NIGHT_PAIRS) {
    test(`${no} ${label}(${opts.n}명), 1일째 밤 스냅샷 → 상대가 allies에 그대로`, async (t) => {
        const w = makeWorld(t);
        const g = await w.openAndStart({ prefix: no.slice(4).toLowerCase(), ...opts });
        toFirstNight(g.gameId);
        const [a, b] = rolesFromStarted(g.started)[role];
        for (const [me, partner] of [[a, b], [b, a]]) {
            const snap = await w.snapshot(me, { gameId: g.gameId });
            assert.equal(snap.ok, true, `${me} 스냅샷 거절: ${snap.code}`);
            assert.equal(snap.phase, 'NIGHT');
            assert.equal(snap.dayIndex, 1);
            assert.deepEqual(snap.self.allies, [partner]);
        }
    });
}

test('A02-B-261 [지금 동작] 의사 2(7명) 중 B가 1일 재판에서 처형 → A의 2일째 스냅샷 allies에 B 남음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b261', n: 7, roleCounts: { DOCTOR: 2 } });
    const [a, b] = rolesFromStarted(g.started).DOCTOR;
    const session = getSessionById(g.gameId);
    // 1일째 낮 재판에 B → B만 기권, 나머지 전원 유죄 → 처형 (판 상태로 바로)
    gf.toTribunal(session, b);
    const votes = Object.fromEntries([...session.players.keys()].filter((u) => u !== b).map((u) => [u, 'GUILTY']));
    testUtils.resolveTribunalVotes(session, votes);
    assert.equal(session.players.get(b).alive, false, 'B가 처형 안 됨');
    // 1일째 밤: 다 기권 → 2일째 낮
    if (session.phase !== 'NIGHT') gf.toNight(session);
    gf.skipAllNight(session);
    gf.resolveNightDirect(session);
    const snap = await w.snapshot(a, { gameId: g.gameId });
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.dayIndex, 2);
    assert.deepEqual(snap.self.allies, [b]);
});

test('A02-B-262 6명 판 밖 계정이 그 판 id로 스냅샷 요청 → NOT_A_PARTICIPANT 거절, 직업 값 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b262', n: 6 });
    w.connect('b262-outsider');
    const reply = await w.snapshot('b262-outsider', { gameId: g.gameId });
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'NOT_A_PARTICIPANT');
    const text = JSON.stringify(reply);
    for (const role of ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN']) assert.equal(text.includes(role), false, `${role} 값이 샘`);
});

test('A02-B-263 8명 중 시민이 요청 값에 광대 uuid를 끼움 → 시민 자기 것만 옴', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b263', n: 8 });
    const byRole = rolesFromStarted(g.started);
    const [citizen] = byRole.CITIZEN;
    const [joker] = byRole.JOKER;
    const snap = await w.snapshot(citizen, { gameId: g.gameId, uuid: joker, targetUuid: joker, viewerUuid: joker });
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.self.uuid, citizen);
    assert.equal(snap.self.role, 'CITIZEN');
    testUtils.assertNoForbiddenPrivateData(snap, secretsFor(g.started, citizen));
});
