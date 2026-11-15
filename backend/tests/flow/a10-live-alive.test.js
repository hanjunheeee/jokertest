'use strict';

// 로비 입장 정리 시험 — 진행 중 판의 산 사람: 아무것도 안 지우고 판 화면으로 되돌림 (단계마다), 만들기·입장은 여전히 막힘, 남은 사람에게 알림 없음
// 목록 A10-B-161~180 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --env-file=.env.test --test tests/flow/a10-live-alive.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, NOTHING } = require('./a10-world');

// 광대 아닌 사람
const citizens = (g) => g.uuids.filter((u) => !g.jokers.includes(u));

// 되돌림 답
const backToGame = (gameId) => ({ ok: true, redirect: 'INGAME', gameId });

// 로비 입장 전후 스냅샷이 같은지 (단계·날짜·마감·생존 전부), 되돌림 답인지
async function expectBackUnchanged(w, g, uuid) {
    const before = await w.snapshot(uuid, g.gameId);
    assert.equal(before.ok, true, `준비: 스냅샷 실패 ${before.code}`);
    const reply = await w.lobby(uuid);
    assert.deepEqual(reply, backToGame(g.gameId));
    const after = await w.snapshot(uuid, g.gameId);
    assert.deepEqual(after, before, '로비 입장 뒤 판이 바뀜');
    assert.equal(after.players.find((p) => p.uuid === uuid).isAlive, true);
}

// 그 직업 밤 차례가 열릴 때까지 1초씩
async function untilNightTurn(w, g, role, watcher) {
    await w.advanceUntil(g.gameId, (s) => s.phase === 'NIGHT');
    for (let i = 0; i < 200; i += 1) {
        if (w.received(watcher, 'night_turn_started').some((p) => p.gameId === g.gameId && p.role === role)) return;
        await w.tick(1_000);
    }
    throw new Error(`${role} 차례가 안 열림`);
}

const STAGES = [
    ['A10-B-161', 5, '역할 확인', async () => null],
    ['A10-B-162', 6, '토론', async (w, g) => { await w.toDay(g); return null; }],
    ['A10-B-163', 7, '투표', async (w, g) => {
        await w.toDay(g);
        await w.tickBy(30_000);
        assert.equal((await w.snapshot(g.uuids[0], g.gameId)).dayPhase, 'DAY_VOTE', '준비: 투표 단계 아님');
        return null;
    }],
    ['A10-B-164', 8, '재판 투표자', async (w, g) => { await w.openTribunal(g, citizens(g)[0]); return citizens(g)[1]; }],
    ['A10-B-165', 9, '재판 피고', async (w, g) => { await w.openTribunal(g, citizens(g)[0]); return citizens(g)[0]; }],
    ['A10-B-166', 10, '밤 내 차례', async (w, g) => { await w.skipDay(g); await untilNightTurn(w, g, 'JOKER', g.joker); return g.joker; }],
];
for (const [id, n, label, prepare] of STAGES) {
    test(`${id} ${n}명 판 ${label} 중 산 사람 로비 → INGAME 되돌림, 산 채 그대로, 판 단계·마감 안 바뀜`, async (t) => {
        const w = makeWorld(t);
        const g = await w.openGame({ prefix: id, n });
        const who = (await prepare(w, g)) ?? citizens(g)[1];
        await expectBackUnchanged(w, g, who);
    });
}

test('A10-B-167 7명 판 밤 광대 차례 중 시민 로비 → INGAME, 산 채', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b167', n: 7 });
    await w.skipDay(g);
    await untilNightTurn(w, g, 'JOKER', g.joker);
    await expectBackUnchanged(w, g, citizens(g)[2]);
});

test('A10-B-168 6명 판 밤 → 낮 바뀐 직후(낮 시작 연출 중) 로비 → INGAME', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b168', n: 6 });
    const [victim, who] = citizens(g).slice(1, 3);
    await w.killFirstNight(g, victim);
    assert.equal(w.phaseOf(g.gameId), 'DAY', '준비: 낮이 아님');
    assert.deepEqual(await w.lobby(who), backToGame(g.gameId));
});

test('A10-B-169 8명 판 토론 중 로비 두 번 → 둘 다 INGAME 같은 gameId', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b169', n: 8 });
    await w.toDay(g);
    const who = citizens(g)[3];
    assert.deepEqual(await w.lobby(who), backToGame(g.gameId));
    assert.deepEqual(await w.lobby(who), backToGame(g.gameId));
});

test('A10-B-170 5명 판 산 사람 로비 → create_room → ALREADY_IN_GAME + 안내 글', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b170', n: 5 });
    const who = citizens(g)[1];
    await w.lobby(who);
    const created = await w.createRoom(who);
    assert.equal(created.ok, false);
    assert.equal(created.code, 'ALREADY_IN_GAME');
    assert.equal(created.message, '진행 중인 게임이 있습니다. 게임을 끝내거나 나간 뒤에 다시 시도해주세요.');
});

test('A10-B-171 6명 판 산 사람 로비 → join_room_by_code → ALREADY_IN_GAME', async (t) => {
    const w = makeWorld(t);
    const other = await w.openRoom({ prefix: 'b171o', n: 5 });
    const g = await w.openGame({ prefix: 'b171', n: 6 });
    const who = citizens(g)[1];
    await w.lobby(who);
    const joined = await w.joinByCode(who, other.roomCode);
    assert.equal(joined.event, 'room_join_failed');
    assert.equal(joined.code, 'ALREADY_IN_GAME');
});

test('A10-B-172 7명 판 투표 중 산 사람 로비 → 낮 투표 냄 → 받음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b172', n: 7 });
    await w.toDay(g);
    await w.tickBy(30_000);
    assert.equal((await w.snapshot(g.uuids[0], g.gameId)).dayPhase, 'DAY_VOTE', '준비: 투표 단계 아님');
    const who = citizens(g)[2];
    await w.lobby(who);
    const vote = await w.ask(who, 'cast_day_vote', { gameId: g.gameId, targetId: citizens(g)[3] });
    assert.equal(vote.ok, true, `표 거절: ${vote.code}`);
});

test('A10-B-173 8명 판 산 사람 로비 → 나머지 7명이 받은 player_eliminated·session_participation_changed 0개', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b173', n: 8 });
    await w.toDay(g);
    const who = citizens(g)[4];
    const others = g.uuids.filter((u) => u !== who).map((u) => [u, w.mark(u)]);
    await w.lobby(who);
    await w.tick(1_000);
    for (const [u, at] of others) {
        assert.equal(w.since(u, at, 'player_eliminated').length, 0, `${u} 탈락 알림`);
        assert.equal(w.since(u, at, 'session_participation_changed').length, 0, `${u} 참여 바뀜 알림`);
    }
});

test('A10-B-174 6명 판 산 A 끊김 → 30초 뒤 새 소켓 + 로비 → INGAME, 61초까지 탈락 방송 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b174', n: 6 });
    await w.toDay(g);
    const a = citizens(g)[1];
    const watcher = citizens(g)[2];
    const at = w.mark(watcher);
    w.closeSocket(w.sock(a));
    await w.tickBy(30_000);
    await w.connect(a);
    assert.deepEqual(await w.lobby(a), backToGame(g.gameId));
    await w.tickBy(31_000);
    assert.equal(w.since(watcher, at, 'player_eliminated').length, 0);
});

test('A10-B-175 5명 판(광대 1) 산 광대 로비 → INGAME, 판 끝 알림 없음, 단계 그대로', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b175', n: 5 });
    await w.toDay(g);
    const at = g.uuids.map((u) => [u, w.mark(u)]);
    await expectBackUnchanged(w, g, g.joker);
    for (const [u, m] of at) assert.equal(w.since(u, m, 'game_ended').length, 0, `${u} 판 끝 알림`);
});

test('A10-B-176 7명 판 방장(산) 로비 → INGAME, 판 끝 뒤 다시 연 방의 원래 방장 = 그 사람', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b176', n: 7 });
    assert.deepEqual(await w.lobby(g.host), backToGame(g.gameId));
    await w.playToCitizenWin(g);
    const back = await w.returnToRoom(citizens(g)[1], g.gameId);
    assert.equal(back.ok, true);
    assert.equal(back.room.reservedHostUuid, g.host);
});

test('A10-B-177 5명 판 X·6명 판 Y 동시, X의 A·Y의 B 로비 → A 답 gameId = X, B 답 = Y', async (t) => {
    const w = makeWorld(t);
    const x = await w.openGame({ prefix: 'b177x', n: 5 });
    const y = await w.openGame({ prefix: 'b177y', n: 6 });
    assert.deepEqual(await w.lobby(citizens(x)[1]), backToGame(x.gameId));
    assert.deepEqual(await w.lobby(citizens(y)[1]), backToGame(y.gameId));
});

test('A10-B-178 8명 판 A 산 채로 "게임 나가기" → A 로비 → cleared 전부 false, 판은 7명으로 계속', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b178', n: 8 });
    await w.toDay(g);
    const [a, watcher] = citizens(g).slice(1, 3);
    const left = await w.ask(a, 'leave_game_session', { gameId: g.gameId });
    assert.equal(left.ok, true, `나가기 실패: ${left.code}`);
    const reply = await w.lobby(a);
    assert.deepEqual(reply.cleared, { ...NOTHING });
    const snap = await w.snapshot(watcher, g.gameId);
    assert.equal(snap.ok, true);
    assert.notEqual(snap.phase, 'ENDED');
    assert.equal(snap.players.filter((p) => p.isAlive && p.isParticipating).length, 7);
});

test('A10-B-179 10명 방 시작 → 역할 확인 0초에 손님 로비 → INGAME, 판 10명 그대로', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b179', n: 10 });
    const who = g.guests[3];
    assert.deepEqual(await w.lobby(who), backToGame(g.gameId));
    const snap = await w.snapshot(who, g.gameId);
    assert.equal(snap.phase, 'ROLE_REVEAL');
    assert.equal(snap.players.filter((p) => p.isAlive && p.isParticipating).length, 10);
});

test('A10-B-180 9명 판 산 A, 다른 로그인 새 소켓 → 옛 소켓 REPLACED_BY_OTHER_LOGIN → 새 소켓 로비 → INGAME 같은 판, 산 채', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b180', n: 9 });
    await w.toDay(g);
    const a = citizens(g)[2];
    const oldSocket = w.sock(a);
    const fresh = await w.connect(a, { sessionId: 'sess-b180-other' });
    assert.equal(w.received(oldSocket, 'force_disconnect').at(-1)?.code, 'REPLACED_BY_OTHER_LOGIN');
    assert.deepEqual(await w.lobby(fresh), backToGame(g.gameId));
    const snap = await w.snapshot(a, g.gameId);
    assert.equal(snap.players.find((p) => p.uuid === a).isAlive, true);
});
