'use strict';

// 남의 것에 손대기 거절 시험 (소켓) — 남의 방 설정 바꾸기·남의 설정 결과·남의 추방 결과 묻기·남의 판에 표 내기·판에 없는 사람의 스냅샷
// 목록 A15-B-163~165·167~168 (docs/게임_의도_2026-11-15/시험목록/A15-보안.md), 가짜 소켓·가짜 io(a01b 대기방 세상), 돌리기: node --env-file=.env.test --test tests/flow/a15-ownership-socket.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// a01b 세상이 맨 위에서 gameFixtures를 먼저 불러 DB 주소를 막음
const { makeWorld } = require('./a01b-world');

// 판 쪽 사건 처리기도 붙임 (서버는 접속마다 대기방·판 처리기를 둘 다 붙임, socket/socket.js)
const withGameHandlers = (w, uuid) => {
    if (!w.sock(uuid)) w.connect(uuid);
    w.gs.registerGameHandlers(w.io, w.sock(uuid), uuid);
    return w.sock(uuid);
};

// 답 받는 사건 하나 보내고 답 기다림 (답이 안 오면 2초 뒤 'NO_REPLY' — 가짜 시계와 상관없는 진짜 기다림)
const ask = (w, uuid, event, payload) => new Promise((resolve) => {
    const timer = require('node:timers').setTimeout(() => resolve('NO_REPLY'), 2_000);
    w.sock(uuid).trigger(event, payload, (reply) => { require('node:timers').clearTimeout(timer); resolve(reply); });
});

// 방 X(방장 A)·방 Y(방장 B) 5명씩
async function twoRooms(w, tag) {
    const x = await w.openRoom({ host: `${tag}-a`, guests: w.names(`${tag}-x`, 4) });
    const y = await w.openRoom({ host: `${tag}-b`, guests: w.names(`${tag}-y`, 4) });
    return { x, y, A: x.host, B: y.host };
}

// 방 설정 바꾸기 요청 값 (그 방 지금 값 + 바꿀 칸)
const settingsPayload = (room, requestId, changes) => ({
    roomId: room.roomId,
    requestId,
    expectedSettingsVersion: room.settingsVersion,
    accessType: room.accessType,
    maxPlayers: room.settings.maxPlayers,
    jokerCount: room.settings.jokerCount,
    dayDiscussionTime: room.settings.dayDiscussionTime,
    dayVoteTime: room.settings.dayVoteTime,
    nightActionTime: room.settings.nightActionTime,
    ...changes,
});

test('A15-B-163 방 X 방장 A가 방 Y(남의 방, 5명) roomId로 update_room_settings → ok:false, Y 설정·버전 그대로, Y 사람에게 방송 없음', async (t) => {
    const w = makeWorld(t);
    const { y, A, B } = await twoRooms(w, 'b163');
    const before = await w.currentRoom(B);
    const heard = y.uuids.map((u) => w.count(u, 'room_settings_updated'));
    const reply = await w.send(A, 'update_room_settings', settingsPayload(before, 'a15-b163-req', { maxPlayers: 8 }));
    assert.equal(reply.ok, false);
    const after = await w.currentRoom(B);
    assert.deepEqual(after.settings, before.settings);
    assert.equal(after.settingsVersion, before.settingsVersion);
    assert.deepEqual(y.uuids.map((u) => w.count(u, 'room_settings_updated')), heard, 'Y 사람이 설정 바뀜 방송을 받음');
});

test('A15-B-164 B가 낸 설정 요청의 roomId·requestId로 A가 get_room_settings_update_result → 결과 없음, B 결과·방 값 없음', async (t) => {
    const w = makeWorld(t);
    const { A, B } = await twoRooms(w, 'b164');
    const room = await w.currentRoom(B);
    const applied = await w.send(B, 'update_room_settings', settingsPayload(room, 'a15-b164-req', { maxPlayers: 8 }));
    assert.equal(applied.ok, true, `B 설정 바꾸기 실패: ${applied.message}`);
    // B 자신은 결과를 다시 받음 (영수증이 있는지 확인)
    const own = await ask(w, B, 'get_room_settings_update_result', { roomId: room.roomId, requestId: 'a15-b164-req' });
    assert.equal(own.status, 'APPLIED');
    const reply = await ask(w, A, 'get_room_settings_update_result', { roomId: room.roomId, requestId: 'a15-b164-req' });
    assert.notEqual(reply, 'NO_REPLY');
    assert.ok(reply.ok === false || reply.status === 'UNKNOWN', `결과가 나옴: ${JSON.stringify(reply)}`);
    assert.equal(reply.changed, undefined);
    assert.equal(reply.settingsVersion, undefined);
    assert.ok(reply.room === null || reply.room === undefined, 'B 방 값이 실림');
});

test('A15-B-165 B 방장의 추방 requestId로 A가 get_kick_result → 결과 없음', async (t) => {
    const w = makeWorld(t);
    const { y, A, B } = await twoRooms(w, 'b165');
    const target = y.uuids[1];
    const payload = await w.kickPayload(B, target);
    const kicked = await w.kickRaw(B, payload);
    assert.equal(kicked.ok, true, `추방 실패: ${kicked.code}`);
    withGameHandlers(w, A);
    withGameHandlers(w, B);
    const query = { bootEpoch: payload.bootEpoch, requestId: payload.requestId };
    // B 자신은 영수증을 다시 받음 (영수증이 있는지 확인)
    const own = await ask(w, B, 'get_kick_result', query);
    assert.equal(own.replayed, true);
    const reply = await ask(w, A, 'get_kick_result', query);
    assert.notEqual(reply, 'NO_REPLY');
    assert.ok(reply.ok === false || reply.status === 'UNKNOWN', `결과가 나옴: ${JSON.stringify(reply)}`);
    assert.notEqual(reply.replayed, true);
    assert.ok(!JSON.stringify(reply).includes(target), '추방된 사람이 실림');
});

// 판 하나 열어 첫 낮 투표까지 (직업 고정, 판 사람 소켓에 판 처리기)
function gameAtVote(w, id, n) {
    const s = w.seedGame({ id, n });
    w.gf.toDay(s);
    w.gf.toVote(s);
    for (const uuid of s.players.keys()) withGameHandlers(w, uuid);
    stopTimersAfter(w, s);
    return s;
}
// 판 타이머가 걸렸으면 시험 끝에 끔
const stopTimersAfter = (w, s) => w.t.after(() => {
    w.G.stopDayPhaseTimer(s.id);
    w.G.stopTribunalTimer(s.id);
    w.G.stopNightTurnSequence(s.id);
});
const progressOf = async (w, uuid, gameId) => (await ask(w, uuid, 'get_session_snapshot', { gameId })).progress;

test('A15-B-167 6명 판 G1의 산 사람 A가 7명 판 G2 gameId로 cast_day_vote → ok:false, G2 표 현황 그대로, G1 표도 안 생김', async (t) => {
    const w = makeWorld(t);
    const g1 = gameAtVote(w, 'a15-b167-g1', 6);
    const g2 = gameAtVote(w, 'a15-b167-g2', 7);
    const A = [...g1.players.keys()][1];
    const g2Someone = [...g2.players.keys()][1];
    const g2Before = await progressOf(w, g2Someone, g2.id);
    const g1Before = await progressOf(w, A, g1.id);
    assert.equal(g2Before.kind, 'DAY_VOTE');
    const reply = await ask(w, A, 'cast_day_vote', { gameId: g2.id, targetId: [...g2.players.keys()][2] });
    assert.equal(reply.ok, false);
    assert.deepEqual(await progressOf(w, g2Someone, g2.id), g2Before);
    assert.deepEqual(await progressOf(w, A, g1.id), g1Before);
});

test('A15-B-168 로비에 있는 계정이 진행 중 6명 판 gameId로 get_session_snapshot → ok:false, 명단·단계·채팅 값 없음', async (t) => {
    const w = makeWorld(t);
    const g = gameAtVote(w, 'a15-b168-g', 6);
    const lobby = 'a15-b168-lobby';
    withGameHandlers(w, lobby);
    const reply = await ask(w, lobby, 'get_session_snapshot', { gameId: g.id });
    assert.notEqual(reply, 'NO_REPLY');
    assert.equal(reply.ok, false);
    assert.equal(reply.players, undefined);
    assert.equal(reply.phase, undefined);
    assert.equal(reply.chat ?? reply.chatMessages ?? reply.dayChat, undefined);
    for (const uuid of g.players.keys()) assert.ok(!JSON.stringify(reply).includes(uuid), `답에 판 사람 ${uuid}`);
});
