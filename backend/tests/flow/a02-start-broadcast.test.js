'use strict';

// 시작 방송 시험 — 방장이 시작하면 사람마다 game_started 한 번, 남의 직업 안 샘, 같은 직업끼리 보임, 구성·방 칸·색·순서
// 목록 A02-B-161~212 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md "시작 방송"), 돌리기: node --env-file=.env.test --test tests/flow/a02-start-broadcast.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 → 꼭 socket 파일보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const matchmaking = require('../../socket/matchmaking');
const gs = require('../../socket/gameSession');
const mf = require('../helpers/matchmakingFixtures');
const { assertNoForbiddenPrivateData } = require('../helpers/gameSession.testUtils');
const e2eHooks = require('../../socket/e2e/gameHooks');

const MM = matchmaking.__testables;
const G = gs.__testables;

// ── 대기방 → 시작 세상 (이 파일 안에서만 씀, 공용으로 올릴 것) ──
// 가짜 소켓·가짜 io·접속 목록 + 매칭 가짜 서비스(DB 안 감), 직업 무작위는 0으로 고정
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
    // 계정 하나 접속 (접속 목록에 이 소켓을 지금 소켓으로 적음)
    const connect = (uuid) => {
        const s = mf.createFakeSocket(uuid);
        io.sockets.sockets.set(s.id, s);
        registry.set(uuid, s.id);
        sockets.set(uuid, s);
        return s;
    };
    const sock = (uuid) => sockets.get(uuid);
    // 그 사람이 받은 사건 내용 목록
    const received = (uuid, event) => sock(uuid).received.filter((e) => e.event === event).map((e) => e.payload);

    // 방 만들기 → 나머지 코드 입장 → 전원 준비 (방장 = 첫 사람), 시간은 안 주면 60초
    async function openRoom({ prefix, n, accessType = 'code', maxPlayers = n, jokerCount = 1, roleCounts = null, times = {} }) {
        const uuids = Array.from({ length: n }, (_, i) => `${prefix}-${i}`);
        for (const uuid of uuids) connect(uuid);
        const [host, ...guests] = uuids;
        const payload = {
            accessType, maxPlayers, jokerCount,
            dayDiscussionTime: 60, dayVoteTime: 60, nightActionTime: 60, ...times,
            ...(roleCounts ? { roleCompositionMode: 'custom', roleCounts: { JOKER: jokerCount, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...roleCounts } } : {}),
        };
        const created = await mf.callAsPromise(MM.handleCreateRoom, io, sock(host), host, payload);
        assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
        for (const uuid of guests) await MM.handleJoinRoomByCode(io, sock(uuid), uuid, created.room.roomCode);
        for (const uuid of uuids) {
            const r = await mf.callAsPromise(MM.handleSetReady, io, sock(uuid), uuid, mf.readyPayload(created.room));
            assert.equal(r.ok, true, `${uuid} 준비 실패: ${r.message}`);
        }
        return { ...created.room, host, uuids };
    }

    // 방장 시작 (presets = { 자리번호: 역할 } 이면 그 방만 역할 미리 정하기 손잡이를 켜고 시작)
    async function start(room, { presets = null } = {}) {
        if (!presets) return mf.callAsPromise(MM.handleStartGame, io, sock(room.host), room.host, mf.startPayload(room));
        const saved = process.env.E2E_HOOKS;
        process.env.E2E_HOOKS = '1';
        try {
            const byUuid = Object.fromEntries(Object.entries(presets).map(([i, role]) => [room.uuids[i], role]));
            e2eHooks.setRolePresets(byUuid, { roomId: room.roomId });
            return await mf.callAsPromise(MM.handleStartGame, io, sock(room.host), room.host, mf.startPayload(room));
        } finally {
            if (saved === undefined) delete process.env.E2E_HOOKS;
            else process.env.E2E_HOOKS = saved;
        }
    }

    // 방 열고 바로 시작 → { room, reply, started: uuid → 받은 game_started 내용 }
    async function openAndStart(opts, startOpts) {
        const room = await openRoom(opts);
        const reply = await start(room, startOpts);
        assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`);
        const started = new Map(room.uuids.map((uuid) => [uuid, received(uuid, 'game_started').at(-1)]));
        return { room, reply, started };
    }

    return { io, connect, sock, received, openRoom, start, openAndStart };
}

// 받은 시작 알림으로 직업별 사람 묶기 (각자 자기 알림의 self.role만 씀) → { JOKER: [uuid…], … }
function rolesFromStarted(started) {
    const byRole = {};
    for (const [uuid, payload] of started) (byRole[payload.state.self.role] ??= []).push(uuid);
    return byRole;
}

// 직업 수 세기 → { JOKER, DOCTOR, GUARD, WITCH_HUNTER, CITIZEN }
function countRoles(started) {
    const counts = { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 0 };
    for (const payload of started.values()) counts[payload.state.self.role] += 1;
    return counts;
}

// 'J1D1C4' → 직업 수 (빠진 직업 0)
function parseComposition(text) {
    const map = { J: 'JOKER', D: 'DOCTOR', G: 'GUARD', W: 'WITCH_HUNTER', C: 'CITIZEN' };
    const counts = { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 0 };
    for (const [, letter, num] of text.matchAll(/([JDGWC])(\d+)/g)) counts[map[letter]] = Number(num);
    return counts;
}

// 전원 같은 직업 목록 확인: 시민은 칸 없음, 나머지는 같은 직업 다른 사람뿐
function checkAllAllies(started) {
    const byRole = rolesFromStarted(started);
    for (const [uuid, payload] of started) {
        const { self } = payload.state;
        if (self.role === 'CITIZEN') {
            assert.equal(Object.hasOwn(self, 'allies'), false, `시민 ${uuid}에게 allies 칸`);
            continue;
        }
        const expected = byRole[self.role].filter((u) => u !== uuid).sort();
        assert.deepEqual([...self.allies].sort(), expected, `${uuid}(${self.role}) 동료 목록`);
    }
}

// A02-B-161~166 시작하면 사람마다 알림 하나, 방장 답 ok + gameId
for (let n = 5; n <= 10; n += 1) {
    const no = `A02-B-${String(161 + n - 5).padStart(3, '0')}`;
    test(`${no} 전원 준비한 ${n}명 대기방, 방장 start_game → 사람마다 game_started 1번, 답 ok + gameId`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ prefix: `b${161 + n - 5}`, n });
        const reply = await w.start(room);
        assert.equal(reply.ok, true, `시작 실패: ${reply.message}`);
        assert.equal(typeof reply.gameId, 'string');
        assert.ok(reply.gameId.length > 0);
        for (const uuid of room.uuids) assert.equal(w.received(uuid, 'game_started').length, 1, `${uuid} 알림 수`);
    });
}

// A02-B-167~172 실제 방송에 남의 직업이 안 샘 (남의 직업 = 그 사람이 자기 알림에서 받은 직업)
for (let n = 5; n <= 10; n += 1) {
    const no = `A02-B-${String(167 + n - 5).padStart(3, '0')}`;
    test(`${no} ${n}명 시작 → 사람마다 받은 game_started에 남의 직업 값 없음`, async (t) => {
        const w = makeWorld(t);
        const { started } = await w.openAndStart({ prefix: `b${167 + n - 5}`, n });
        for (const [viewer, payload] of started) {
            const secrets = [...started]
                .filter(([uuid]) => uuid !== viewer)
                .map(([uuid, p]) => ({ value: p.state.self.role, label: `role(${uuid})` }));
            for (const p of payload.state.players) assert.equal(Object.hasOwn(p, 'role'), false, `${viewer}가 받은 ${p.uuid} 칸에 직업`);
            // 도우미는 맨 위 self만 내 칸으로 봄 → self가 든 state를 넘김
            assertNoForbiddenPrivateData(payload.state, secrets);
        }
    });
}

// A02-B-173~180 같은 직업 2명이 서로 보임 (자리 1·3번 사람을 그 직업으로 미리 정해 둠)
const PAIR_CASES = [
    ['A02-B-173', '광대 2', 'JOKER', { n: 5, jokerCount: 2 }],
    ['A02-B-174', '광대 2', 'JOKER', { n: 10, jokerCount: 2 }],
    ['A02-B-175', '의사 2', 'DOCTOR', { n: 6, roleCounts: { DOCTOR: 2 } }],
    ['A02-B-176', '의사 2', 'DOCTOR', { n: 10, roleCounts: { DOCTOR: 2 } }],
    ['A02-B-177', '경비원 2', 'GUARD', { n: 8, roleCounts: { GUARD: 2 } }],
    ['A02-B-178', '경비원 2', 'GUARD', { n: 10, roleCounts: { GUARD: 2 } }],
    ['A02-B-179', '마녀사냥꾼 2', 'WITCH_HUNTER', { n: 7, roleCounts: { WITCH_HUNTER: 2 } }],
    ['A02-B-180', '마녀사냥꾼 2', 'WITCH_HUNTER', { n: 10, roleCounts: { WITCH_HUNTER: 2 } }],
];
for (const [no, label, role, opts] of PAIR_CASES) {
    test(`${no} ${label}(${opts.n}명), 역할 미리 정해 둠 → 둘이 받은 self.allies에 서로만`, async (t) => {
        const w = makeWorld(t);
        const { room, started } = await w.openAndStart({ prefix: no.slice(4).toLowerCase(), ...opts }, { presets: { 1: role, 3: role } });
        const [a, b] = [room.uuids[1], room.uuids[3]];
        assert.equal(started.get(a).state.self.role, role, '미리 정한 직업이 안 맞음');
        assert.equal(started.get(b).state.self.role, role, '미리 정한 직업이 안 맞음');
        assert.deepEqual(started.get(a).state.self.allies, [b]);
        assert.deepEqual(started.get(b).state.self.allies, [a]);
    });
}

test('A02-B-181 10명 자동(시민 6) → 시민 6명 모두 allies 칸 없음', async (t) => {
    const w = makeWorld(t);
    const { started } = await w.openAndStart({ prefix: 'b181', n: 10 });
    const citizens = rolesFromStarted(started).CITIZEN;
    assert.equal(citizens.length, 6);
    for (const uuid of citizens) assert.equal(Object.hasOwn(started.get(uuid).state.self, 'allies'), false, uuid);
});

test('A02-B-182 10명 자동 → 의사·경비원·마녀사냥꾼 allies: []', async (t) => {
    const w = makeWorld(t);
    const { started } = await w.openAndStart({ prefix: 'b182', n: 10 });
    const byRole = rolesFromStarted(started);
    for (const role of ['DOCTOR', 'GUARD', 'WITCH_HUNTER']) {
        assert.equal(byRole[role].length, 1, `${role} 수`);
        assert.deepEqual(started.get(byRole[role][0]).state.self.allies, [], role);
    }
});

// A02-B-183~188 자동 구성(광대 1)이 실제 판에 맞음
const AUTO_TABLE = ['J1C4', 'J1D1C4', 'J1D1C5', 'J1D1G1C5', 'J1D1G1C6', 'J1D1G1W1C6'];
for (let n = 5; n <= 10; n += 1) {
    const no = `A02-B-${String(183 + n - 5).padStart(3, '0')}`;
    test(`${no} ${n}명 자동(광대 1) → 받은 직업을 세면 ${AUTO_TABLE[n - 5]}`, async (t) => {
        const w = makeWorld(t);
        const { started } = await w.openAndStart({ prefix: `b${183 + n - 5}`, n });
        assert.deepEqual(countRoles(started), parseComposition(AUTO_TABLE[n - 5]));
    });
}

// A02-B-189~194 직접 구성이 실제 판에 맞음 (남는 자리 시민)
const CUSTOM_CASES = [
    ['A02-B-189', 5, 1, { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, 'J1D1G1W1C1'],
    ['A02-B-190', 6, 2, { DOCTOR: 2 }, 'J2D2C2'],
    ['A02-B-191', 7, 2, { DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 1 }, 'J2D2G2W1C0'],
    ['A02-B-192', 8, 2, { DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }, 'J2D2G2W2C0'],
    ['A02-B-193', 9, 1, {}, 'J1C8'],
    ['A02-B-194', 10, 2, { DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }, 'J2D2G2W2C2'],
];
for (const [no, n, jokerCount, roleCounts, expected] of CUSTOM_CASES) {
    test(`${no} ${n}명 직접 구성 → 받은 직업 수 ${expected}`, async (t) => {
        const w = makeWorld(t);
        const { started } = await w.openAndStart({ prefix: no.slice(4).toLowerCase(), n, jokerCount, roleCounts });
        assert.deepEqual(countRoles(started), parseComposition(expected));
    });
}

test('A02-B-195 10명 J2D2G2W2C2 → 10명 모두 allies가 같은 직업 상대뿐(시민은 칸 없음)', async (t) => {
    const w = makeWorld(t);
    const { started } = await w.openAndStart({ prefix: 'b195', n: 10, jokerCount: 2, roleCounts: { DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
    assert.deepEqual(countRoles(started), parseComposition('J2D2G2W2C2'));
    checkAllAllies(started);
});

test('A02-B-196 8명 J2D2G2W2(시민 0) → 8명 모두 상대 하나씩', async (t) => {
    const w = makeWorld(t);
    const { started } = await w.openAndStart({ prefix: 'b196', n: 8, jokerCount: 2, roleCounts: { DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
    for (const [uuid, payload] of started) assert.equal(payload.state.self.allies?.length, 1, `${uuid} 목록`);
    checkAllAllies(started);
});

test('A02-B-197 5명 자동·광대 2 → 시작 됨, 광대 2·시민 3', async (t) => {
    const w = makeWorld(t);
    const { started } = await w.openAndStart({ prefix: 'b197', n: 5, jokerCount: 2 });
    assert.deepEqual(countRoles(started), parseComposition('J2C3'));
});

test('A02-B-198 6명 → 방장 답 gameId = 모두가 받은 game_started.gameId', async (t) => {
    const w = makeWorld(t);
    const { reply, started } = await w.openAndStart({ prefix: 'b198', n: 6 });
    for (const [uuid, payload] of started) assert.equal(payload.gameId, reply.gameId, uuid);
});

test('A02-B-199 7명, 방 만든 사람 = 방장 → state.hostUuid = 그 사람', async (t) => {
    const w = makeWorld(t);
    const { room, started } = await w.openAndStart({ prefix: 'b199', n: 7 });
    for (const payload of started.values()) assert.equal(payload.state.hostUuid, room.host);
});

test('A02-B-200 8명 코드 방 → state.roomCode = 방 코드 6자리', async (t) => {
    const w = makeWorld(t);
    const { room, started } = await w.openAndStart({ prefix: 'b200', n: 8, accessType: 'code' });
    assert.equal(room.roomCode.length, 6);
    for (const payload of started.values()) assert.equal(payload.state.roomCode, room.roomCode);
});

// A02-B-201~202 공개/코드 칸
for (const [no, accessType] of [['A02-B-201', 'open'], ['A02-B-202', 'code']]) {
    test(`${no} 5명 ${accessType === 'open' ? '공개' : '코드'} 방 → accessType '${accessType}'`, async (t) => {
        const w = makeWorld(t);
        const { started } = await w.openAndStart({ prefix: no.slice(4).toLowerCase(), n: 5, accessType });
        for (const payload of started.values()) assert.equal(payload.state.roomSettingsSource.accessType, accessType);
    });
}

// A02-B-203~206 시간 최대값이 그대로 (9명, 토론 150·투표 90·재판 120·밤 120초)
const MAX_TIMES = { dayDiscussionTime: 150, dayVoteTime: 90, tribunalTime: 120, nightActionTime: 120 };
const MAX_TIME_CASES = [
    ['A02-B-203', '토론', 'dayDiscussionTime'],
    ['A02-B-204', '투표', 'dayVoteTime'],
    ['A02-B-205', '재판', 'tribunalTime'],
    ['A02-B-206', '밤', 'nightActionTime'],
];
for (const [no, label, key] of MAX_TIME_CASES) {
    test(`${no} 9명, ${label} ${MAX_TIMES[key]}초 → 알림 설정 칸 같은 값`, async (t) => {
        const w = makeWorld(t);
        const { started } = await w.openAndStart({ prefix: no.slice(4).toLowerCase(), n: 9, times: MAX_TIMES });
        for (const payload of started.values()) assert.equal(payload.state.roomSettingsSource.settings[key], MAX_TIMES[key]);
    });
}

// A02-B-207~212 사람 순서·색은 누가 받아도 같음
for (let n = 5; n <= 10; n += 1) {
    const no = `A02-B-${String(207 + n - 5).padStart(3, '0')}`;
    test(`${no} ${n}명 → 사람마다 받은 players의 uuid 순서·themeIndex 같음`, async (t) => {
        const w = makeWorld(t);
        const { started } = await w.openAndStart({ prefix: `b${207 + n - 5}`, n });
        const view = (payload) => payload.state.players.map((p) => [p.uuid, p.themeIndex]); // → [['b207-2', 4], …]
        const [first, ...rest] = [...started.values()];
        assert.equal(first.state.players.length, n);
        for (const payload of rest) assert.deepEqual(view(payload), view(first));
    });
}
