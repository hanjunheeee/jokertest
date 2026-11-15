'use strict';

// 시작 조건 시험 — 4명 거절(개발 환경 포함), 정원 안 채워도 시작, 구성이 지금 인원과 맞음, 시민 0명·광대 2명, 전원 준비, 들어오는 중·끊김, 손님 시작, 시작 사이 바뀜·따닥, 대기방 없어짐, 시작 가능 표시, 남은 칸 그대로
// 목록 A01-B-155~180 (docs/게임_의도_2026-11-15/시험목록/A01a-방만들기-설정-시작.md "시작 조건"), 돌리기: node --env-file=.env.test --test tests/flow/a01a-start-conditions.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, customRoles, makeInviteService, admitByInvite } = require('./a01a-world');

const MIN_PLAYERS_MESSAGE = '게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다.';
const COMPOSITION_MESSAGE = '설정한 역할 구성이 현재 인원과 맞지 않습니다. 인원을 더 모아주세요.';
const NOT_READY_MESSAGE = '아직 준비하지 않은 참가자가 있습니다.';
const J2D2G2W2 = { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 };

// 시작 거절 확인: 코드·글·아무도 game_started 못 받음
function assertRejected(w, reply, uuids, code, message) {
    assert.equal(reply.ok, false);
    assert.equal(reply.code, code);
    if (message) assert.equal(reply.message, message);
    assert.equal(w.nobodyStarted(uuids), true, '누가 game_started를 받음');
}
// 시작 됨 확인: gameId, 사람마다 game_started 1번
function assertStarted(w, reply, uuids) {
    assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`);
    assert.equal(typeof reply.gameId, 'string');
    for (const uuid of uuids) assert.equal(w.received(uuid, 'game_started').length, 1, uuid);
}

// ── 4명이면 거절 ──
for (const [no, maxPlayers] of [['A01-B-155', 5], ['A01-B-156', 10]]) {
    test(`${no} 정원 ${maxPlayers} 방에 4명 전원 준비 → MIN_PLAYERS_NOT_MET "${MIN_PLAYERS_MESSAGE}", 판 없음`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ prefix: no.slice(4).toLowerCase(), n: 4, maxPlayers });
        assertRejected(w, await w.start(room.host), room.uuids, 'MIN_PLAYERS_NOT_MET', MIN_PLAYERS_MESSAGE);
    });
}

// ── 정원 안 채워도 시작 ──
const PARTIAL_CASES = [['A01-B-157', 5], ['A01-B-158', 7], ['A01-B-159', 9], ['A01-B-160', 10]];
for (const [no, n] of PARTIAL_CASES) {
    test(`${no} 정원 10 방에 ${n}명 전원 준비 → { ok:true, gameId }`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ prefix: no.slice(4).toLowerCase(), n, maxPlayers: 10 });
        assertStarted(w, await w.start(room.host), room.uuids);
    });
}

test('A01-B-161 NODE_ENV=development + GAME_DEV_MIN_PLAYERS=1, 4명 → MIN_PLAYERS_NOT_MET, 5명이면 시작', async (t) => {
    const w = makeWorld(t, { env: { NODE_ENV: 'development', GAME_DEV_MIN_PLAYERS: '1' } });
    const four = await w.openRoom({ prefix: 'b161a', n: 4, maxPlayers: 5 });
    assertRejected(w, await w.start(four.host), four.uuids, 'MIN_PLAYERS_NOT_MET', MIN_PLAYERS_MESSAGE);
    const five = await w.openRoom({ prefix: 'b161b', n: 5, maxPlayers: 5 });
    assertStarted(w, await w.start(five.host), five.uuids);
});

// ── 직접 구성이 지금 인원과 맞아야 함 (정원 10 J2D2G2W2) ──
const COMPOSITION_CASES = [['A01-B-162', 5, false], ['A01-B-163', 7, false], ['A01-B-164', 8, true]];
for (const [no, n, pass] of COMPOSITION_CASES) {
    test(`${no} 정원 10 J2D2G2W2, 지금 ${n}명 → ${pass ? '시작' : 'INVALID_ROLE_COMPOSITION'}`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ prefix: no.slice(4).toLowerCase(), n, maxPlayers: 10, ...customRoles(J2D2G2W2) });
        const reply = await w.start(room.host);
        if (pass) assertStarted(w, reply, room.uuids);
        else assertRejected(w, reply, room.uuids, 'INVALID_ROLE_COMPOSITION', COMPOSITION_MESSAGE);
    });
}

test('A01-B-165 정원 10 직접 J1D1, 지금 5명(남는 자리 시민) → 시작', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b165', n: 5, maxPlayers: 10, ...customRoles({ JOKER: 1, DOCTOR: 1 }) });
    assertStarted(w, await w.start(room.host), room.uuids);
});

test('A01-B-166 정원 5 J2D1G1W1(시민 0명), 5명 → 시작', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b166', n: 5, maxPlayers: 5, ...customRoles({ JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }) });
    assertStarted(w, await w.start(room.host), room.uuids);
});

test('A01-B-167 자동·광대 2, 5명 → 시작', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b167', n: 5, jokerCount: 2 });
    assertStarted(w, await w.start(room.host), room.uuids);
});

test(`A01-B-168 5명, 손님 4명만 준비(방장 안 함) → PLAYERS_NOT_READY "${NOT_READY_MESSAGE}"`, async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b168', n: 5, readyAll: false });
    for (const g of room.guests) assert.equal((await w.ready(g, true)).ok, true);
    assertRejected(w, await w.start(room.host), room.uuids, 'PLAYERS_NOT_READY', NOT_READY_MESSAGE);
});

test('A01-B-169 6명, 1명 준비 안 함 → PLAYERS_NOT_READY', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b169', n: 6, readyUuids: ['b169-0', 'b169-1', 'b169-2', 'b169-3', 'b169-4'] });
    assertRejected(w, await w.start(room.host), room.uuids, 'PLAYERS_NOT_READY', NOT_READY_MESSAGE);
});

test('A01-B-170 5명 전원 준비 + 초대 수락 중 1명 → ADMISSION_IN_PROGRESS, 입장 끝나고 그 사람 준비하면 시작', async (t) => {
    const invites = makeInviteService();
    const w = makeWorld(t, { depsOverrides: { gameInviteService: invites.service } });
    const room = await w.openRoom({ prefix: 'b170', n: 5, maxPlayers: 10 });
    const pending = await admitByInvite(w, invites, { uuid: 'b170-guest', roomHolder: room.host, point: 'decision' });
    assertRejected(w, await w.start(room.host), room.uuids, 'ADMISSION_IN_PROGRESS');
    pending.open();
    const accepted = await pending.reply;
    assert.equal(accepted.ok, true, `초대 입장 실패: ${accepted.code}`);
    assert.equal((await w.ready('b170-guest', true)).ok, true);
    assertStarted(w, await w.start(room.host), [...room.uuids, 'b170-guest']);
});

const UNAVAILABLE_MESSAGE = '일부 참가자와의 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.';

// 5명 전원 준비 방에서 손님 하나 소켓 끊김 (대기방 15초 기다림 안)
async function oneDisconnected(w, prefix) {
    const room = await w.openRoom({ prefix, n: 5 });
    const offline = room.guests[2];
    const s = w.sock(offline);
    s.connected = false;
    w.matchmaking.onDisconnect(w.io, s, offline);
    return { room, offline };
}

test(`A01-B-171 5명 전원 준비, 1명 소켓 끊김(15초 안) → PARTICIPANT_UNAVAILABLE "${UNAVAILABLE_MESSAGE}", 판 없음, 방 그대로`, async (t) => {
    const w = makeWorld(t);
    const { room, offline } = await oneDisconnected(w, 'b171');
    assertRejected(w, await w.start(room.host), room.uuids, 'PARTICIPANT_UNAVAILABLE', UNAVAILABLE_MESSAGE);
    const now = await w.currentRoom(room.host);
    assert.equal(now?.roomId, room.roomId);
    assert.deepEqual(now.players.map((p) => p.uuid).sort(), [...room.uuids].sort());
    assert.ok(now.players.some((p) => p.uuid === offline));
});

test('A01-B-172 B-171 뒤 그 사람 다시 붙음 → 시작', async (t) => {
    const w = makeWorld(t);
    const { room, offline } = await oneDisconnected(w, 'b172');
    assert.equal((await w.start(room.host)).ok, false);
    // 새 소켓으로 다시 붙음 → 서버처럼 방 채널 다시 넣고 지금 방 물음
    const fresh = w.connect(offline, `sock-${offline}-2`);
    await w.matchmaking.resyncRoomChannelOnReconnect(fresh, offline);
    assert.equal((await w.currentRoom(offline))?.roomId, room.roomId);
    assertStarted(w, await w.start(room.host), room.uuids);
});

test('A01-B-173 5명 손님이 start_game → NOT_HOST "방장만 게임을 시작할 수 있습니다."', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b173', n: 5 });
    const reply = await w.start(room.guests[0]);
    assertRejected(w, reply, room.uuids, 'NOT_HOST', '방장만 게임을 시작할 수 있습니다.');
});

test('A01-B-174 5명, 프로필 읽는 사이 손님이 준비 풂 → ROOM_STATE_CHANGED, 판 없음', async (t) => {
    let openGate;
    const gate = new Promise((resolve) => { openGate = resolve; });
    let reading;
    const reached = new Promise((resolve) => { reading = resolve; });
    const loadouts = (ids) => Object.fromEntries(ids.map((id) => [id, { profilePhotoId: null, profileBorderId: null }]));
    const w = makeWorld(t, {
        depsOverrides: {
            economyService: {
                getPublicProfileLoadouts: async (ids) => loadouts(ids),
                getGameStartLoadouts: async (ids) => { reading(); await gate; return loadouts(ids); },
                getEmojiPalettes: async (ids) => new Map(ids.map((id) => [id, { slots: [], owned: [] }])),
                getEmojiPalette: async () => ({ slots: [], owned: [] }),
            },
        },
    });
    const room = await w.openRoom({ prefix: 'b174', n: 5 });
    const pending = w.start(room.host);
    await reached;
    assert.equal((await w.ready(room.guests[1], false)).ok, true);
    openGate();
    assertRejected(w, await pending, room.uuids, 'ROOM_STATE_CHANGED');
});

test('A01-B-175 5명, start_game 두 번 → 판 1개, 둘째 답 ok:false', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b175', n: 5 });
    const payload = { roomId: room.roomId, expectedSettingsVersion: 1 };
    const [a, b] = await Promise.all([w.emit(room.host, 'start_game', payload), w.emit(room.host, 'start_game', payload)]);
    assert.equal(a.ok, true, a.message);
    assert.equal(b.ok, false);
    for (const uuid of room.uuids) assert.equal(w.received(uuid, 'game_started').length, 1, uuid);
});

test('A01-B-176 5명 시작 → 다섯 사람 get_current_room에 방 없음, 방장 답 gameId', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b176', n: 5 });
    const reply = await w.start(room.host);
    assert.equal(reply.ok, true, reply.message);
    assert.equal(typeof reply.gameId, 'string');
    for (const uuid of room.uuids) assert.equal(await w.currentRoom(uuid), null, `${uuid}에게 대기방이 남음`);
});

// ── 방 정보의 시작 가능 표시 ──
const CAN_START_CASES = [
    ['A01-B-177', '4명 전원 준비', { n: 4, maxPlayers: 5 }, false],
    ['A01-B-178', '5명 전원 준비', { n: 5 }, true],
    ['A01-B-179', '정원 10 J2D2G2W2 5명 전원 준비', { n: 5, maxPlayers: 10, ...customRoles(J2D2G2W2) }, false],
];
for (const [no, label, options, expected] of CAN_START_CASES) {
    test(`${no} canStart: ${label} → ${expected}`, async (t) => {
        const w = makeWorld(t);
        const room = await w.openRoom({ prefix: no.slice(4).toLowerCase(), ...options });
        assert.equal((await w.currentRoom(room.host)).canStart, expected);
    });
}

test('A01-B-180 정원 7·광대 1·직접 J1D1G1·토론 90·투표 30·재판 45·밤 60(+지운 3칸)으로 만든 방 → 5명 시작 → game_started 설정이 그 값', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({
        prefix: 'b180', n: 5, maxPlayers: 7, ...customRoles({ JOKER: 1, DOCTOR: 1, GUARD: 1 }),
        dayDiscussionTime: 90, dayVoteTime: 30, tribunalTime: 45, nightActionTime: 60,
        lightsOut: true, soulBetting: true, voteReveal: false,
    });
    assertStarted(w, await w.start(room.host), room.uuids);
    const expected = {
        maxPlayers: 7,
        jokerCount: 1,
        roleCompositionMode: 'custom',
        roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 },
        dayDiscussionTime: 90,
        dayVoteTime: 30,
        tribunalTime: 45,
        nightActionTime: 60,
    };
    for (const uuid of room.uuids) {
        const [payload] = w.received(uuid, 'game_started');
        assert.deepEqual(payload.state.roomSettingsSource.settings, expected, uuid);
    }
});
