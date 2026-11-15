'use strict';

// 판 중·판 끝 뒤 코드 입장 시험 — 판 중엔 단계 상관없이 "이미 게임이 시작된 방", 공개 목록·옛 방 id·옛 초대로도 못 들어옴, 판 끝 바로 뒤엔 새 사람·죽고 나간 사람·로비로 풀린 사람 들어옴(준비 안 됨), 판 중 그 코드는 다른 방에 안 뽑힘
// 목록 A08-B-162~173·183·184 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-code-entry.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { makeWorld, MM, G } = require('./a08-world');
const { BOOT_EPOCH } = require('../../socket/matchmaking/core/constants');

const STARTED_MESSAGE = '이미 게임이 시작된 방입니다.';
// 방 코드 뽑기에 쓰는 글자 (코드 뽑기를 그 코드로 정해 둘 때만 씀)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const bytesFor = (code) => Buffer.from([...code].map((ch) => CODE_CHARS.indexOf(ch)));

// 낮 표로 한 사람을 재판에 세우기만 함 (판정은 안 기다림)
async function openTribunal(w, g, target) {
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    const alive = w.alivePlayers(g);
    for (const uuid of alive) await w.ask(G.handleAcknowledgeDayVoteReady, uuid, { gameId: g.gameId });
    for (const uuid of alive) {
        const r = await w.ask(G.handleSubmitDayVote, uuid, { gameId: g.gameId, targetId: uuid === target ? null : target });
        assert.equal(r.ok, true, `${uuid} 낮 표 거절: ${r.code}`);
    }
    const s = w.advanceUntil(g, (x) => x.phase !== 'DAY');
    assert.equal(s.phase, 'TRIBUNAL', '재판으로 안 감 (준비 잘못)');
}

// 단계마다 판으로 몰고 가기
const PHASES = [
    ['역할 확인', async () => {}],
    ['낮 토론', async (w, g) => w.advanceUntil(g, (s) => s.phase === 'DAY' && s.dayPhase === 'DAY_DISCUSSION')],
    ['투표', async (w, g) => w.advanceUntil(g, (s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE')],
    ['재판', async (w, g) => openTribunal(w, g, g.uuids[1])],
    ['밤', async (w, g) => w.advanceUntil(g, (s) => s.phase === 'NIGHT')],
];
const PHASE_NAMES = { '역할 확인': 'ROLE_REVEAL', '낮 토론': 'DAY', 투표: 'DAY', 재판: 'TRIBUNAL', 밤: 'NIGHT' };
PHASES.forEach(([label, drive], i) => {
    test(`A08-B-${String(162 + i).padStart(3, '0')} 6명 판 ${label} 동안 판 밖 사람 코드 입장 → ROOM_ALREADY_STARTED "${STARTED_MESSAGE}"`, async (t) => {
        const w = makeWorld(t);
        const g = await w.openAndStart({ prefix: `b${162 + i}`, n: 6 });
        await drive(w, g);
        assert.equal(w.session(g).phase, PHASE_NAMES[label], '원하는 단계가 아님 (준비 잘못)');
        const outsider = `b${162 + i}-out`;
        w.connect(outsider);
        const joined = await w.joinCode(outsider, g.roomCode);
        assert.equal(joined.ok, false);
        assert.equal(joined.code, 'ROOM_ALREADY_STARTED');
        assert.equal(joined.message, STARTED_MESSAGE);
    });
});

test('A08-B-167 공개·5명 판 중 get_public_rooms → 그 방 없음', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b167', n: 5, accessType: 'open' });
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    const rooms = await w.publicRooms();
    assert.equal(rooms.some((r) => r.id === g.roomBefore.id), false);
    assert.equal(rooms.length, 0);
});

test('A08-B-168 공개·6명 판 시작 전 받은 방 id로 join_public_room → 거절, 판 안 깨짐', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b168', n: 6, accessType: 'open' });
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    const outsider = 'b168-out';
    w.connect(outsider);
    const joined = await w.joinPublic(outsider, g.roomBefore.id);
    assert.equal(joined.ok, false);
    assert.equal(w.session(g).players.size, 6);
    assert.equal(w.session(g).phase, 'DAY');
});

test('A08-B-169 7명 판 대기방에서 받은 초대를 판 시작 뒤 수락 → 거절, 판 사람 수 그대로', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b169', n: 7 });
    // 시작 전 방으로 보낸 초대
    w.invites.set('inv-b169', { known: true, roomId: g.roomBefore.id, roomInstanceId: g.roomBefore.instanceId, bootEpoch: BOOT_EPOCH });
    const friend = 'b169-friend';
    w.connect(friend);
    const reply = await w.ask(MM.handleAcceptGameInvite, friend, { inviteId: 'inv-b169' });
    assert.equal(reply.ok, false);
    assert.equal(w.session(g).players.size, 7);
});

test('A08-B-170 5명 판 끝 0초에 판 밖 사람 코드 입장 → 들어감', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b170', n: 5 });
    await w.endGame(g);
    assert.equal(Date.now(), g.endedAt);
    const outsider = 'b170-out';
    w.connect(outsider);
    const joined = await w.joinCode(outsider, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
});

// 7명 판 첫 낮 처형된 사람이 나감
async function executedAndLeft(t, prefix) {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix, n: 7 });
    const x = g.uuids[2];
    await w.day(g, x);
    assert.equal(w.alivePlayers(g).includes(x), false, '처형 안 됨 (준비 잘못)');
    assert.equal((await w.lobby(x, g.gameId)).ok, true);
    return { w, g, x };
}

test('A08-B-171 7명 판 첫 낮 처형 → 그 사람 나감 → 판 끝 → 코드 입장 → 들어감', async (t) => {
    const { w, g, x } = await executedAndLeft(t, 'b171');
    await w.endGame(g);
    const joined = await w.joinCode(x, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
});

test('A08-B-172 7명 판 B-171의 사람이 판 끝 전에 코드 입장 → ROOM_ALREADY_STARTED', async (t) => {
    const { w, g, x } = await executedAndLeft(t, 'b172');
    const joined = await w.joinCode(x, g.roomCode);
    assert.equal(joined.ok, false);
    assert.equal(joined.code, 'ROOM_ALREADY_STARTED');
});

test('A08-B-173 6명 판 밤에 죽음 → enter_lobby로 판에서 풀림 → 판 끝 뒤 코드 입장 → 들어감', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b173', n: 6 });
    const y = g.uuids[2];
    await w.day(g, null);
    await w.night(g, y);
    assert.equal(w.alivePlayers(g).includes(y), false, '밤에 안 죽음 (준비 잘못)');
    const lobby = await w.enterLobby(y);
    assert.equal(lobby.ok, true);
    assert.equal(lobby.cleared?.liveGame, true, '판에서 안 풀림');
    await w.endGame(g);
    const joined = await w.joinCode(y, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
});

test('A08-B-183 5명 판 중 코드 뽑기를 그 코드로 정해 두고 새 방 만들기 → 다른 코드로 만들어짐', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b183', n: 5 });
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    const other = 'b183-other';
    w.connect(other);
    let calls = 0;
    const bytes = t.mock.method(crypto, 'randomBytes', () => {
        calls += 1;
        return calls === 1 ? bytesFor(g.roomCode) : bytesFor('ZZZZZZ');
    });
    const created = await w.createRoom(other, w.roomPayload({ maxPlayers: 5 }));
    bytes.mock.restore();
    assert.equal(created.ok, true, `방 만들기 실패: ${created.message}`);
    assert.notEqual(created.room.roomCode, g.roomCode);
});

test('A08-B-184 6명 판 끝 뒤 판 밖 사람 코드 입장 → isReady false', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b184', n: 6 });
    await w.endGame(g);
    const outsider = 'b184-out';
    w.connect(outsider);
    const joined = await w.joinCode(outsider, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
    assert.equal(joined.room.players.find((p) => p.uuid === outsider).isReady, false);
});
