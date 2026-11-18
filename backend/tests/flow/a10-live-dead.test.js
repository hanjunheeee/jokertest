'use strict';

// 로비 입장 정리 시험 — 진행 중 판의 죽은 사람: 로비에 오면 판에서 풀림 (남은 사람에게 참여 바뀜 알림), 판은 그대로, 풀린 뒤 만들기·입장, 옛 판 알림 안 받음
// 목록 A10-B-181~196 (docs/게임_의도_2026-11-15/시험목록/A10-로비-입장-방어.md), 돌리기: node --env-file=.env.test --test tests/flow/a10-live-dead.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a10-world');

// 광대 아닌 사람
const citizens = (g) => g.uuids.filter((u) => !g.jokers.includes(u));

// 죽이는 길 둘: 1일 밤 광대가 죽임 / 첫 낮 재판 처형
async function kill(w, g, victim, how) {
    if (how === 'night') await w.killFirstNight(g, victim);
    else await w.voteOut(g, victim);
    assert.equal(w.session(g.gameId)?.players.get(victim)?.alive, false, '준비: 안 죽음');
    assert.notEqual(w.phaseOf(g.gameId), 'ENDED', '준비: 판이 끝남');
}

// 그 소켓이 표시 뒤 받은 그 판 알림 (판 id 실린 것 전부)
const gameNoticesSince = (w, who, at, gameId) => w.since(who, at).filter((p) => p?.gameId === gameId);

const CASES = [
    ['A10-B-181', 5, 'night', '밤 암살'],
    ['A10-B-182', 6, 'exec', '처형'],
    ['A10-B-183', 7, 'night', '밤 암살'],
    ['A10-B-184', 8, 'exec', '처형'],
    ['A10-B-185', 9, 'night', '밤 암살'],
    ['A10-B-186', 10, 'exec', '처형'],
];
for (const [id, n, how, label] of CASES) {
    test(`${id} ${n}명 판 ${label}된 사람 로비 → liveGame:true, 남은 사람 전원 session_participation_changed, player_eliminated 0개`, async (t) => {
        const w = makeWorld(t);
        const g = await w.openGame({ prefix: id, n });
        const a = citizens(g)[1];
        await kill(w, g, a, how);
        const others = g.uuids.filter((u) => u !== a).map((u) => [u, w.mark(u)]);
        const reply = await w.lobby(a);
        assert.equal(reply.ok, true);
        assert.equal(reply.redirect, null);
        assert.equal(reply.cleared.liveGame, true);
        for (const [u, at] of others) {
            const changed = w.since(u, at, 'session_participation_changed');
            assert.equal(changed.length, 1, `${u} 참여 바뀜 알림 수`);
            assert.equal(changed[0].players.find((p) => p.uuid === a).isParticipating, false, `${u} 알림에 그 사람이 안 빠짐`);
            assert.equal(w.since(u, at, 'player_eliminated').length, 0, `${u} 탈락 알림 받음`);
        }
    });
}

test('A10-B-187 7명 판 죽은 사람 풀림 → 단계·날짜·마감 그대로, 판 끝 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b187', n: 7 });
    const [a, watcher] = citizens(g).slice(1, 3);
    await kill(w, g, a, 'night');
    const pick = (s) => ({ phase: s.phase, dayIndex: s.dayIndex, dayPhase: s.dayPhase, dayPhaseDeadline: s.dayPhaseDeadline });
    const before = await w.snapshot(watcher, g.gameId);
    const at = w.mark(watcher);
    await w.lobby(a);
    const after = await w.snapshot(watcher, g.gameId);
    assert.deepEqual(pick(after), pick(before));
    assert.equal(w.since(watcher, at, 'game_ended').length, 0);
});

test('A10-B-188 6명 판 처형된 사람 로비 → create_room ok', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b188', n: 6 });
    const a = citizens(g)[1];
    await kill(w, g, a, 'exec');
    await w.lobby(a);
    const created = await w.createRoom(a);
    assert.equal(created.ok, true, `방 만들기 거절: ${created.code} ${created.message}`);
});

test('A10-B-189 8명 판 암살된 사람 로비 → 다른 방(5명) 코드 입장 → room_joined', async (t) => {
    const w = makeWorld(t);
    const other = await w.openRoom({ prefix: 'b189o', n: 5 });
    const g = await w.openGame({ prefix: 'b189', n: 8 });
    const a = citizens(g)[1];
    await kill(w, g, a, 'night');
    await w.lobby(a);
    const joined = await w.joinByCode(a, other.roomCode);
    assert.equal(joined.event, 'room_joined', `입장 실패: ${joined.code}`);
});

test('A10-B-190 6명 판 죽은 사람 풀림 → 다음 단계 바뀜 → 그 소켓 받은 판 알림 0개', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b190', n: 6 });
    const [a, watcher] = citizens(g).slice(1, 3);
    await kill(w, g, a, 'night');
    await w.lobby(a);
    const at = w.mark(a);
    const watchAt = w.mark(watcher);
    await w.tickBy(31_000);
    assert.ok(w.since(watcher, watchAt, 'day_phase_changed').length > 0, '준비: 단계가 안 바뀜');
    assert.equal(gameNoticesSince(w, a, at, g.gameId).length, 0);
});

test('A10-B-191 7명 판 죽은 A 끊김(판 자리 남음) → 새 소켓 + 로비 → liveGame:true', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b191', n: 7 });
    const a = citizens(g)[1];
    await kill(w, g, a, 'exec');
    w.closeSocket(w.sock(a));
    await w.tick(1_000);
    await w.connect(a);
    const reply = await w.lobby(a);
    assert.equal(reply.cleared.liveGame, true);
});

test('A10-B-192 8명 판 방장 A 처형 → A 로비 → 판 끝 뒤 다시 연 방의 원래 방장 = 다음 사람 (A 아님)', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b192', n: 8 });
    const a = g.host;
    // 다음 사람 = A 빼고 맨 앞자리 사람 (판 중 방장 넘김 규칙, 자리는 판 시작 때 섞임)
    const next = [...w.session(g.gameId).players.keys()].find((u) => u !== a);
    await kill(w, g, a, 'exec');
    await w.lobby(a);
    await w.voteOut(g, g.joker);
    assert.equal(w.phaseOf(g.gameId), 'ENDED', '준비: 판이 안 끝남');
    const back = await w.returnToRoom(g.uuids.find((u) => u !== a && u !== next), g.gameId);
    assert.equal(back.ok, true);
    assert.equal(back.room.reservedHostUuid, next);
});

test('A10-B-193 9명 판 죽은 사람 로비 두 번 → 둘째 liveGame:false, 방송 1번', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b193', n: 9 });
    const [a, watcher] = citizens(g).slice(1, 3);
    await kill(w, g, a, 'night');
    const at = w.mark(watcher);
    assert.equal((await w.lobby(a)).cleared.liveGame, true);
    const second = await w.lobby(a);
    assert.equal(second.cleared.liveGame, false);
    assert.equal(w.since(watcher, at, 'session_participation_changed').length, 1);
});

test('A10-B-194 6명 판 죽은 A 풀림 → 판 끝 → A 소켓 판 끝 알림 0개, A create_room ok', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b194', n: 6 });
    const a = citizens(g)[1];
    await kill(w, g, a, 'night');
    await w.lobby(a);
    const at = w.mark(a);
    await w.voteOut(g, g.joker);
    assert.equal(w.phaseOf(g.gameId), 'ENDED', '준비: 판이 안 끝남');
    assert.equal(w.since(a, at, 'game_ended').length, 0);
    assert.equal(gameNoticesSince(w, a, at, g.gameId).length, 0, '판 알림 받음');
    assert.equal((await w.createRoom(a)).ok, true);
});

test('A10-B-195 7명 판 죽은 A 풀림 → get_session_snapshot → 참여 중 판 없음 답', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b195', n: 7 });
    const a = citizens(g)[1];
    await kill(w, g, a, 'exec');
    await w.lobby(a);
    const snap = await w.snapshot(a, g.gameId);
    assert.equal(snap.ok, false);
    assert.equal(snap.phase, undefined, '판 내용이 실림');
});

test('A10-B-196 8명 판 죽은 A 풀림 → A 새 방 5명 판 시작 → A 소켓에 옛 판 알림 0개', async (t) => {
    const w = makeWorld(t);
    const g = await w.openGame({ prefix: 'b196', n: 8 });
    const a = citizens(g)[1];
    await kill(w, g, a, 'night');
    await w.lobby(a);
    const at = w.mark(a);
    // A가 방장인 새 방 5명 (A + 새 사람 4명)
    const created = await w.createRoom(a, { maxPlayers: 5 });
    assert.equal(created.ok, true);
    const fresh = ['b196n-1', 'b196n-2', 'b196n-3', 'b196n-4'];
    for (const u of fresh) {
        await w.connect(u);
        assert.equal((await w.joinByCode(u, created.room.roomCode)).event, 'room_joined');
    }
    for (const u of [a, ...fresh]) {
        assert.equal((await w.ask(u, 'set_ready', { roomId: created.room.roomId, isReady: true, expectedSettingsVersion: created.room.settingsVersion })).ok, true);
    }
    const started = await w.start(created.room, a, { [fresh[3]]: 'JOKER' });
    assert.equal(started.ok, true, `새 판 시작 실패: ${started.code}`);
    // 옛 판은 계속 굴러감 (밤 → 낮)
    await w.tickBy(60_000);
    assert.equal(gameNoticesSince(w, a, at, g.gameId).length, 0);
});
