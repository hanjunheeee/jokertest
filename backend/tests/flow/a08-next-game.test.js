'use strict';

// 돌아온 대기방에서 다음 판 시험 — 시작 조건은 처음과 같음(5명·전원 준비·끊긴 사람 없음·들어오는 중 없음·구성 맞음), 자동 구성은 지금 인원, 둘째 판도 같은 코드·같은 설정, 대기방에서 바꾼 설정 이어짐, 세 판 연속, 둘째 판 중 넘겨받은 방장, 결과 화면에 머문 사람은 안 끌려감
// 목록 A08-B-185~199 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-next-game.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, MM } = require('./a08-world');
const { BOOT_EPOCH } = require('../../socket/matchmaking/core/constants');

// 판 끝 → people 대기방으로(방장 먼저) → 준비 (ready에 없는 사람은 준비 안 함)
async function backAndReady(w, g, people, readyPeople = people) {
    const order = people.includes(g.host) ? [g.host, ...people.filter((u) => u !== g.host)] : people;
    for (const uuid of order) assert.equal((await w.ret(uuid, g.gameId)).ok, true, `${uuid} 대기방으로 실패`);
    for (const uuid of readyPeople) assert.equal((await w.ready(uuid)).ok, true, `${uuid} 준비 실패`);
}

// 전원 돌아와 다음 판 시작 → 다음 판 내용
async function nextGame(w, g) {
    await backAndReady(w, g, g.uuids);
    return w.startGame(g.uuids, g.host, w.jokerPresets(g.uuids, w.jokersOf(g).length));
}

async function endedGame(t, prefix, n, opts = {}) {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix, n, ...opts });
    await w.endGame(g);
    return { w, g };
}

test('A08-B-185 5명 판 4명만 대기방으로·준비 → 방장 시작 → 거절 "인원 조건을 아직 충족하지 못했습니다."', async (t) => {
    const { w, g } = await endedGame(t, 'b185', 5);
    await backAndReady(w, g, g.uuids.slice(0, 4));
    const reply = await w.start(g.host);
    assert.equal(reply.ok, false);
    assert.match(reply.message, /인원 조건을 아직 충족하지 못했습니다\./);
});

test('A08-B-186 5명 판 전원 대기방으로·준비 → 시작 성공', async (t) => {
    const { w, g } = await endedGame(t, 'b186', 5);
    await backAndReady(w, g, g.uuids);
    const reply = await w.start(g.host);
    assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`);
});

test('A08-B-187 6명 판 6명 들어감, 5명만 준비 → 거절', async (t) => {
    const { w, g } = await endedGame(t, 'b187', 6);
    await backAndReady(w, g, g.uuids, g.uuids.slice(0, 5));
    const reply = await w.start(g.host);
    assert.equal(reply.ok, false, '준비 안 한 사람이 있는데 시작됨');
});

test('A08-B-188 6명 판 6명 준비, 1명 끊김 → 시작 거절', async (t) => {
    const { w, g } = await endedGame(t, 'b188', 6);
    await backAndReady(w, g, g.uuids);
    await w.disconnect(g.uuids[4]);
    const reply = await w.start(g.host);
    assert.equal(reply.ok, false, '끊긴 사람이 있는데 시작됨');
});

test('A08-B-189 5명 판(정원 6) 5명 준비, 판 밖 사람 입장 처리 중 → 시작 거절', async (t) => {
    const { w, g } = await endedGame(t, 'b189', 5, { maxPlayers: 6 });
    await backAndReady(w, g, g.uuids);
    const room = await w.currentRoom(g.host);
    const friend = 'b189-friend';
    w.connect(friend);
    w.invites.set('inv-b189', { known: true, roomId: room.roomId, roomInstanceId: room.roomInstanceId, bootEpoch: BOOT_EPOCH });
    // 초대 수락이 수락 기록에서 멈춰 있음 (자리는 잡힘)
    void w.ask(MM.handleAcceptGameInvite, friend, { inviteId: 'inv-b189' });
    await w.flush();
    assert.equal(w.inviteGates.length, 1, '입장 처리가 시작 안 됨 (준비 잘못)');
    const reply = await w.start(g.host);
    assert.equal(reply.ok, false, '들어오는 중인 사람이 있는데 시작됨');
});

test('A08-B-190 8명 판(광대2·의사2·경비원2·마녀사냥꾼2) 5명만 대기방으로·준비 → 거절', async (t) => {
    const { w, g } = await endedGame(t, 'b190', 8, { jokerCount: 2, roleCounts: { DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
    await backAndReady(w, g, g.uuids.slice(0, 5));
    const reply = await w.start(g.host);
    assert.equal(reply.ok, false, '구성이 인원과 안 맞는데 시작됨');
});

test('A08-B-191 8명 판(자동) 6명 대기방으로·준비 → 시작, 둘째 판에 의사 있음·경비원 없음', async (t) => {
    const { w, g } = await endedGame(t, 'b191', 8);
    const people = g.uuids.slice(0, 6);
    await backAndReady(w, g, people);
    const g2 = await w.startGame(people, g.host, w.jokerPresets(people, 1));
    const roles = [...g2.roles.values()];
    assert.equal(roles.length, 6);
    assert.ok(roles.includes('DOCTOR'), `의사 없음: ${roles.join(',')}`);
    assert.equal(roles.includes('GUARD'), false, `경비원 있음: ${roles.join(',')}`);
});

test('A08-B-192 6명 판 4명 대기방으로 → 시작 거절 → 판 밖 사람 코드 입장·준비 → 시작 성공', async (t) => {
    const { w, g } = await endedGame(t, 'b192', 6);
    const people = g.uuids.slice(0, 4);
    await backAndReady(w, g, people);
    assert.equal((await w.start(g.host)).ok, false, '4명인데 시작됨');
    const newcomer = 'b192-new';
    w.connect(newcomer);
    assert.equal((await w.joinCode(newcomer, g.roomCode)).ok, true);
    assert.equal((await w.ready(newcomer)).ok, true);
    const reply = await w.start(g.host);
    assert.equal(reply.ok, true, `시작 실패: ${reply.code} ${reply.message}`);
});

test('A08-B-193 5명 판 둘째 판 중 판 밖 사람 코드 입장 → ROOM_ALREADY_STARTED', async (t) => {
    const { w, g } = await endedGame(t, 'b193', 5);
    const g2 = await nextGame(w, g);
    w.advanceUntil(g2, (s) => s.phase === 'DAY');
    const outsider = 'b193-out';
    w.connect(outsider);
    const joined = await w.joinCode(outsider, g.roomCode);
    assert.equal(joined.ok, false);
    assert.equal(joined.code, 'ROOM_ALREADY_STARTED');
});

test('A08-B-194 6명 판 둘째 판 끝 → 같은 코드 대기방 다시 열림', async (t) => {
    const { w, g } = await endedGame(t, 'b194', 6);
    const g2 = await nextGame(w, g);
    await w.endGame(g2);
    const room = w.roomByCode(g.roomCode);
    assert.ok(room, '둘째 판 끝에 방이 안 열림');
    assert.equal(room.returnHold?.gameId, g2.gameId);
});

test('A08-B-195 7명 판(코드 방·광대 2·직접 구성·시간 바꿈) 설정 안 바꾸고 둘째 판 → 둘째 판 시작 값의 설정이 첫 판과 같음', async (t) => {
    const { w, g } = await endedGame(t, 'b195', 7, {
        jokerCount: 2, roleCounts: { DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0 },
        times: { dayDiscussionTime: 90, dayVoteTime: 60, tribunalTime: 45, nightActionTime: 60 },
    });
    const g2 = await nextGame(w, g);
    const first = g.started.get(g.host).state.roomSettingsSource;
    const second = g2.started.get(g.host).state.roomSettingsSource;
    assert.equal(second.accessType, first.accessType);
    assert.deepEqual(second.settings, first.settings);
    assert.equal(second.settings.dayDiscussionTime, 90);
    assert.equal(second.settings.jokerCount, 2);
});

test('A08-B-196 6명 판 돌아온 대기방에서 토론 60초로 바꾸고 둘째 판 → 둘째 판 끝 뒤 다시 연 방 토론 60초', async (t) => {
    const { w, g } = await endedGame(t, 'b196', 6);
    for (const uuid of [g.host, ...g.uuids.slice(1)]) assert.equal((await w.ret(uuid, g.gameId)).ok, true);
    const changed = await w.updateSettings(g.host, { dayDiscussionTime: 60 });
    assert.equal(changed.ok, true, `설정 바꾸기 실패: ${changed.code}`);
    for (const uuid of g.uuids) assert.equal((await w.ready(uuid)).ok, true, `${uuid} 준비 실패`);
    const g2 = await w.startGame(g.uuids, g.host, w.jokerPresets(g.uuids, 1));
    await w.endGame(g2);
    assert.equal(w.roomByCode(g.roomCode).settings.dayDiscussionTime, 60);
});

test('A08-B-197 7명 판 → 대기방 → 판 → 대기방 → 판 → 세 판 다 같은 코드, 세 번째 판 끝에도 다시 열림', async (t) => {
    const { w, g } = await endedGame(t, 'b197', 7);
    const g2 = await nextGame(w, g);
    await w.endGame(g2);
    const g3 = await nextGame(w, g2);
    assert.equal(g2.roomCode, g.roomCode);
    assert.equal(g3.roomCode, g.roomCode);
    await w.endGame(g3);
    assert.equal(w.roomByCode(g.roomCode)?.returnHold?.gameId, g3.gameId);
});

test('A08-B-198 6명 판 둘째 판 중 방장 나감 → 둘째 판 끝 reservedHostUuid = 넘겨받은 사람', async (t) => {
    const { w, g } = await endedGame(t, 'b198', 6);
    const g2 = await nextGame(w, g);
    w.advanceUntil(g2, (s) => s.phase === 'DAY');
    assert.equal((await w.lobby(g2.host, g2.gameId)).ok, true);
    const heir = w.received(g.uuids[1], 'session_participation_changed').filter((p) => p.gameId === g2.gameId).at(-1)?.hostUuid;
    assert.equal(heir, g.uuids[1], '방장이 다음 사람에게 안 넘어감 (준비 잘못)');
    await w.endGame(g2);
    assert.equal(w.roomByCode(g.roomCode).returnHold?.reservedHostUuid, heir);
});

test('A08-B-199 6명 판 F 결과 화면 그대로, 나머지 둘째 판 시작 → F return_to_room → 거절, F는 둘째 판 사람 아님', async (t) => {
    const { w, g } = await endedGame(t, 'b199', 6);
    const f = g.uuids[5];
    const people = g.uuids.slice(0, 5);
    await backAndReady(w, g, people);
    const g2 = await w.startGame(people, g.host, w.jokerPresets(people, 1));
    const r = await w.ret(f, g.gameId);
    assert.equal(r.ok, false);
    assert.equal(w.session(g2).players.has(f), false);
});
