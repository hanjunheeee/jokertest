'use strict';

// 판 끝 뒤 방장 자리 시험 — 방장을 안 기다림, 방장 없는 동안 방장 일 못 함, 원래 방장이 오면 방장, 로비로·끊김·로비 주소·180초면 먼저 들어온 사람이 방장, 판 중 넘겨받은 방장이 원래 방장, 방 내용에 남긴 방장, 새 사람은 방장 아님, 판 두 개는 따로
// 목록 A08-B-093~113·123·125~128·221~222 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/flow/a08-host-seat.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, MM, core } = require('./a08-world');
const { BOOT_EPOCH } = require('../../socket/matchmaking/core/constants');

const rosterOf = (room) => room.players.map((p) => p.uuid);

async function endedGame(t, prefix, n, opts = {}) {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix, n, ...opts });
    await w.endGame(g);
    return { w, g };
}

// 차례대로 "대기방으로", 마지막 답
async function returnInOrder(w, g, uuids) {
    let last = null;
    for (const uuid of uuids) {
        last = await w.ret(uuid, g.gameId);
        assert.equal(last.ok, true, `${uuid} 대기방으로 실패: ${last.code}`);
    }
    return last;
}

// 그 사람이 받은 마지막 방장 바뀜 알림
const lastHostChanged = (w, uuid) => w.received(uuid, 'host_changed').at(-1);

// ── 방장을 안 기다림 ──
[5, 6, 7, 8, 10].forEach((n, i) => {
    test(`A08-B-${String(93 + i).padStart(3, '0')} ${n}명 판 방장 아닌 사람이 먼저 누름 → 바로 들어감, hostUuid 없음, reservedHostUuid = 원래 방장`, async (t) => {
        const { w, g } = await endedGame(t, `b${93 + i}`, n);
        const r = await w.ret(g.uuids[1], g.gameId);
        assert.equal(r.ok, true, `실패: ${r.code}`);
        assert.equal(r.room.hostUuid, null);
        assert.equal(r.room.reservedHostUuid, g.host);
    });
});

// ── 방장이 없는 동안은 아무도 방장 일을 못 함 ──
test('A08-B-098 6명 판 들어온 사람이 시작 보냄 → 거절, 방 그대로', async (t) => {
    const { w, g } = await endedGame(t, 'b098', 6);
    await returnInOrder(w, g, g.uuids.slice(1));
    for (const uuid of g.uuids.slice(1)) await w.ready(uuid);
    const before = await w.currentRoom(g.uuids[1]);
    const reply = await w.start(g.uuids[1]);
    assert.equal(reply.ok, false, '방장 없이 시작됨');
    const after = await w.currentRoom(g.uuids[1]);
    assert.deepEqual(rosterOf(after), rosterOf(before));
    assert.equal(after.hostUuid, null);
});

test('A08-B-099 6명 판 들어온 사람이 설정 바꾸기 보냄 → 거절, 방 그대로', async (t) => {
    const { w, g } = await endedGame(t, 'b099', 6);
    await returnInOrder(w, g, [g.uuids[1], g.uuids[2]]);
    const before = await w.currentRoom(g.uuids[1]);
    const reply = await w.updateSettings(g.uuids[1], { dayDiscussionTime: 90 });
    assert.equal(reply.ok, false, '방장 없이 설정이 바뀜');
    const after = await w.currentRoom(g.uuids[1]);
    assert.deepEqual(after.settings, before.settings);
    assert.equal(after.settingsVersion, before.settingsVersion);
});

test('A08-B-100 6명 판 들어온 사람이 추방 보냄 → 거절, 방 그대로', async (t) => {
    const { w, g } = await endedGame(t, 'b100', 6);
    await returnInOrder(w, g, [g.uuids[1], g.uuids[2]]);
    const reply = await w.kick(g.uuids[1], g.uuids[2]);
    assert.equal(reply.ok, false, '방장 없이 추방됨');
    assert.deepEqual(rosterOf(await w.currentRoom(g.uuids[1])), [g.uuids[1], g.uuids[2]]);
});

test('A08-B-101 6명 판 B·C 들어간 뒤 원래 방장 A 누름 → hostUuid = A, B·C가 host_changed { hostUuid:A, reservedHostUuid:null } 받음', async (t) => {
    const { w, g } = await endedGame(t, 'b101', 6);
    const [b, c] = [g.uuids[1], g.uuids[2]];
    await returnInOrder(w, g, [b, c]);
    const r = await w.ret(g.host, g.gameId);
    assert.equal(r.ok, true);
    assert.equal(r.room.hostUuid, g.host);
    for (const uuid of [b, c]) {
        const notice = lastHostChanged(w, uuid);
        assert.ok(notice, `${uuid} 방장 바뀜 알림 없음`);
        assert.equal(notice.hostUuid, g.host);
        assert.equal(notice.reservedHostUuid, null);
    }
});

test('A08-B-102 5명 판 원래 방장 A 먼저 → 바로 방장, 남김 없음', async (t) => {
    const { w, g } = await endedGame(t, 'b102', 5);
    const r = await w.ret(g.host, g.gameId);
    assert.equal(r.ok, true);
    assert.equal(r.room.hostUuid, g.host);
    assert.equal(r.room.reservedHostUuid, null);
});

test('A08-B-103 7명 판 B·C 뒤 A → A 방장, B·C 자리 그대로', async (t) => {
    const { w, g } = await endedGame(t, 'b103', 7);
    const [b, c] = [g.uuids[1], g.uuids[2]];
    const r = await returnInOrder(w, g, [b, c, g.host]);
    assert.equal(r.room.hostUuid, g.host);
    assert.deepEqual(rosterOf(r.room), [b, c, g.host]);
});

test('A08-B-104 6명 판 B·C 들어감 → A leave_game_session → B 방장, B·C가 host_changed 받음', async (t) => {
    const { w, g } = await endedGame(t, 'b104', 6);
    const [b, c] = [g.uuids[1], g.uuids[2]];
    await returnInOrder(w, g, [b, c]);
    assert.equal((await w.lobby(g.host, g.gameId)).ok, true);
    assert.equal((await w.currentRoom(b)).hostUuid, b);
    for (const uuid of [b, c]) assert.equal(lastHostChanged(w, uuid)?.hostUuid, b, `${uuid} 방장 바뀜 알림`);
});

test('A08-B-105 5명 판 아무도 안 들어간 채 A 로비로 → 다음에 들어오는 B가 방장', async (t) => {
    const { w, g } = await endedGame(t, 'b105', 5);
    assert.equal((await w.lobby(g.host, g.gameId)).ok, true);
    const r = await w.ret(g.uuids[1], g.gameId);
    assert.equal(r.ok, true);
    assert.equal(r.room.hostUuid, g.uuids[1]);
    assert.equal(r.room.reservedHostUuid, null);
});

test('A08-B-106 7명 판 B 들어감 → A 연결 끊김 → A 끝난 판에서 바로 빠짐, B 방장', async (t) => {
    const { w, g } = await endedGame(t, 'b106', 7);
    const b = g.uuids[1];
    await returnInOrder(w, g, [b]);
    await w.disconnect(g.host);
    assert.equal((await w.currentRoom(b)).hostUuid, b);
    assert.equal(lastHostChanged(w, b)?.hostUuid, b);
    // 시계를 안 넘기고 다시 붙어도 결과 화면 사람이 아님
    await w.reconnect(g.host);
    const r = await w.ret(g.host, g.gameId);
    assert.equal(r.code, 'SESSION_ENDED');
});

test('A08-B-107 6명 판 B 들어감 → A enter_lobby → B 방장', async (t) => {
    const { w, g } = await endedGame(t, 'b107', 6);
    const b = g.uuids[1];
    await returnInOrder(w, g, [b]);
    assert.equal((await w.enterLobby(g.host)).ok, true);
    assert.equal((await w.currentRoom(b)).hostUuid, b);
    assert.equal(lastHostChanged(w, b)?.hostUuid, b);
});

test('A08-B-108 5명 판 B 들어감, A 결과 화면 그대로 → 가짜 시계 180초 → B 방장, host_changed', async (t) => {
    const { w, g } = await endedGame(t, 'b108', 5);
    const b = g.uuids[1];
    await returnInOrder(w, g, [b]);
    w.tickToSinceEnd(g, 179_000);
    assert.equal((await w.currentRoom(b)).hostUuid, null, '179초에 벌써 방장');
    w.tickToSinceEnd(g, 180_000);
    assert.equal((await w.currentRoom(b)).hostUuid, b);
    assert.equal(lastHostChanged(w, b)?.hostUuid, b);
});

test('A08-B-109 8명 판 C → B → D 차례로 들어감 → A 로비로 → C 방장', async (t) => {
    const { w, g } = await endedGame(t, 'b109', 8);
    const [b, c, d] = [g.uuids[1], g.uuids[2], g.uuids[3]];
    await returnInOrder(w, g, [c, b, d]);
    assert.equal((await w.lobby(g.host, g.gameId)).ok, true);
    assert.equal((await w.currentRoom(b)).hostUuid, c);
});

test('A08-B-110 7명 판 C → B 차례 → C leave_room → A 로비로 → B 방장', async (t) => {
    const { w, g } = await endedGame(t, 'b110', 7);
    const [b, c] = [g.uuids[1], g.uuids[2]];
    await returnInOrder(w, g, [c, b]);
    await w.leaveRoom(c);
    assert.equal((await w.lobby(g.host, g.gameId)).ok, true);
    assert.equal((await w.currentRoom(b)).hostUuid, b);
});

test('A08-B-111 6명 판 B·C 들어감 → B 나감 → 방장 칸 없음, reservedHostUuid 그대로 A', async (t) => {
    const { w, g } = await endedGame(t, 'b111', 6);
    const [b, c] = [g.uuids[1], g.uuids[2]];
    await returnInOrder(w, g, [b, c]);
    await w.leaveRoom(b);
    const room = await w.currentRoom(c);
    assert.equal(room.hostUuid, null);
    assert.equal(room.reservedHostUuid, g.host);
});

test('A08-B-112 7명 판 중 방장 A 나감 → B 방장 → 판 끝 → reservedHostUuid = B', async (t) => {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix: 'b112', n: 7 });
    // B = 방장 빼고 맨 앞자리 사람 (판 중 방장 넘김 규칙, 자리는 판 시작 때 섞임)
    const b = [...w.session(g).players.keys()].find((u) => u !== g.host);
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    assert.equal((await w.lobby(g.host, g.gameId)).ok, true);
    const changed = w.received(b, 'session_participation_changed').at(-1);
    assert.equal(changed?.hostUuid, b, '판 중 방장이 B로 안 넘어감 (준비 잘못)');
    await w.endGame(g);
    assert.equal(w.roomByCode(g.roomCode).returnHold?.reservedHostUuid, b);
    const r = await w.ret(g.uuids.find((u) => u !== g.host && u !== b), g.gameId);
    assert.equal(r.room.reservedHostUuid, b);
});

test('A08-B-113 6명 판 B → A(방장) 들어감 → A leave_room → B 방장', async (t) => {
    const { w, g } = await endedGame(t, 'b113', 6);
    const b = g.uuids[1];
    await returnInOrder(w, g, [b, g.host]);
    await w.leaveRoom(g.host);
    assert.equal((await w.currentRoom(b)).hostUuid, b);
});

test('A08-B-123 6명 판 들어간 사람의 return_to_room 답·get_current_room 답 → 둘 다 reservedHostUuid = A', async (t) => {
    const { w, g } = await endedGame(t, 'b123', 6);
    const r = await w.ret(g.uuids[1], g.gameId);
    assert.equal(r.room.reservedHostUuid, g.host);
    assert.equal((await w.currentRoom(g.uuids[1])).reservedHostUuid, g.host);
});

test('A08-B-125 6명 판 끝 직후 판 밖 사람 코드 입장 → 들어감, 방장 칸 없음, 남김 그대로', async (t) => {
    const { w, g } = await endedGame(t, 'b125', 6);
    const outsider = 'b125-out';
    w.connect(outsider);
    const joined = await w.joinCode(outsider, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
    assert.equal(joined.room.hostUuid, null);
    assert.equal(joined.room.reservedHostUuid, g.host);
});

test('A08-B-126 5명 판 아무도 안 옴, A 로비로 → 판 밖 사람 코드 입장 → 그 사람 방장', async (t) => {
    const { w, g } = await endedGame(t, 'b126', 5);
    assert.equal((await w.lobby(g.host, g.gameId)).ok, true);
    const outsider = 'b126-out';
    w.connect(outsider);
    const joined = await w.joinCode(outsider, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
    assert.equal(joined.room.hostUuid, outsider);
});

test('A08-B-127 6명 판 B 들어감 → A 로비로(B 방장) → A 코드 입장 → A 방장 아님, B 그대로', async (t) => {
    const { w, g } = await endedGame(t, 'b127', 6);
    const b = g.uuids[1];
    await returnInOrder(w, g, [b]);
    assert.equal((await w.lobby(g.host, g.gameId)).ok, true);
    assert.equal((await w.currentRoom(b)).hostUuid, b);
    const joined = await w.joinCode(g.host, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
    assert.equal(joined.room.hostUuid, b);
});

test('A08-B-128 5명 판 2개(서로 다른 코드) 같은 때 끝남 → 방 2개, 각 reservedHostUuid가 각 판 방장', async (t) => {
    const w = makeWorld(t);
    const g1 = await w.openAndStart({ prefix: 'b128x', n: 5 });
    const g2 = await w.openAndStart({ prefix: 'b128y', n: 5 });
    assert.notEqual(g1.roomCode, g2.roomCode);
    // 두 판 광대가 같은 때 산 채로 나감 → 두 판 같은 시각에 끝남
    await Promise.all([w.endGame(g1, 'jokerLeaves'), w.endGame(g2, 'jokerLeaves')]);
    assert.equal(g1.endedAt, g2.endedAt);
    assert.equal(w.roomByCode(g1.roomCode).returnHold?.reservedHostUuid, g1.host);
    assert.equal(w.roomByCode(g2.roomCode).returnHold?.reservedHostUuid, g2.host);
});

// ── 판 끝 때 끊겨 있던 방장에게는 자리를 안 남김 (반장이 정함 2026-11-16: 결과 화면 끊김은 바로 빠짐과 같은 생각) ──
// 방장이 낮에 끊김(60초 기다림 중) → 광대가 산 채로 나가 그 안에 판 끝
async function endedWhileHostAway(t, prefix, n) {
    const w = makeWorld(t);
    const g = await w.openAndStart({ prefix, n });
    w.advanceUntil(g, (s) => s.phase === 'DAY');
    await w.disconnect(g.host);
    await w.endGame(g, 'jokerLeaves');
    return { w, g };
}

test('A08-B-221 6명 판 방장 A가 끊긴 채(60초 안) 판 끝 → B "대기방으로" → B 방장, 남긴 방장 자리 없음', async (t) => {
    const { w, g } = await endedWhileHostAway(t, 'b221', 6);
    const b = g.uuids[1];
    const r = await w.ret(b, g.gameId);
    assert.equal(r.ok, true, `실패: ${r.code}`);
    assert.equal(r.room.hostUuid, b);
    assert.equal(r.room.reservedHostUuid, null);
    assert.equal((await w.currentRoom(b)).hostUuid, b);
});

test('A08-B-222 5명 판 방장 A가 끊긴 채 판 끝, 아무도 안 들어감 → 판 밖 사람 코드 입장 → 그 사람 방장', async (t) => {
    const { w, g } = await endedWhileHostAway(t, 'b222', 5);
    const outsider = 'b222-out';
    w.connect(outsider);
    const joined = await w.joinCode(outsider, g.roomCode);
    assert.equal(joined.ok, true, `막힘: ${joined.code}`);
    assert.equal(joined.room.hostUuid, outsider);
    assert.equal(joined.room.reservedHostUuid, null);
});

// ── 원래 방장이 끝난 판을 안 나간 채 코드·공개방·초대 수락으로 복귀 대기방에 들어올 때 ──
// 초대 수락 한 번 끝까지 밀기 (수락 기록 문 열어 줌)
async function acceptInviteToRoom(w, receiverUuid, inviteId, room) {
    w.invites.set(inviteId, { known: true, roomId: room.roomId, roomInstanceId: room.roomInstanceId, bootEpoch: BOOT_EPOCH });
    const pending = w.ask(MM.handleAcceptGameInvite, receiverUuid, { inviteId });
    for (let i = 0; i < 10 && w.inviteGates.length === 0; i += 1) await w.flush();
    assert.equal(w.inviteGates.length, 1, '초대 수락 기록 대기 문이 안 열림');
    w.inviteGates.shift()();
    return pending;
}

test('A08-B-224 6명 판 B·C 먼저 복귀 후 원래 방장 A가 끝난 판 안 나간 채 코드 입장 → A 방장·예약 해제·host_changed·끝난 판 정리', async (t) => {
    const { w, g } = await endedGame(t, 'b224', 6);
    const [b, c] = [g.uuids[1], g.uuids[2]];
    await returnInOrder(w, g, [b, c]);
    const joined = await w.joinCode(g.host, g.roomCode);
    assert.equal(joined.ok, true, `코드 입장 실패: ${joined.code}`);
    assert.equal(joined.room.hostUuid, g.host);
    assert.equal(joined.room.reservedHostUuid, null);
    assert.equal(core.getEndedGameId(g.host), null);
    for (const uuid of [b, c]) {
        const notice = lastHostChanged(w, uuid);
        assert.ok(notice, `${uuid} 방장 바뀜 알림 없음`);
        assert.equal(notice.hostUuid, g.host);
        assert.equal(notice.reservedHostUuid, null);
    }
    const updated = await w.updateSettings(g.host, { dayDiscussionTime: 90 });
    assert.equal(updated.ok, true, `방장 설정 변경 실패: ${updated.code}`);
});

test('A08-B-225 5명 판 빈 복귀 대기방에 원래 방장 A가 끝난 판 안 나간 채 코드 입장 → 바로 방장·예약 해제·끝난 판 정리', async (t) => {
    const { w, g } = await endedGame(t, 'b225', 5);
    const joined = await w.joinCode(g.host, g.roomCode);
    assert.equal(joined.ok, true, `코드 입장 실패: ${joined.code}`);
    assert.equal(joined.room.hostUuid, g.host);
    assert.equal(joined.room.reservedHostUuid, null);
    assert.equal(core.getEndedGameId(g.host), null);
});

test('A08-B-226 공개·6명 판 B 복귀 후 원래 방장 A가 끝난 판 안 나간 채 공개방 입장 → A 방장·예약 해제·host_changed·끝난 판 정리', async (t) => {
    const { w, g } = await endedGame(t, 'b226', 6, { accessType: 'open' });
    const b = g.uuids[1];
    const r = await w.ret(b, g.gameId);
    assert.equal(r.ok, true);
    const joined = await w.joinPublic(g.host, r.room.roomId);
    assert.equal(joined.ok, true, `공개방 입장 실패: ${joined.code}`);
    assert.equal(joined.room.hostUuid, g.host);
    assert.equal(joined.room.reservedHostUuid, null);
    assert.equal(core.getEndedGameId(g.host), null);
    const notice = lastHostChanged(w, b);
    assert.ok(notice, 'B 방장 바뀜 알림 없음');
    assert.equal(notice.hostUuid, g.host);
    assert.equal(notice.reservedHostUuid, null);
});

test('A08-B-227 6명 판 B 복귀 후 원래 방장 A가 끝난 판 안 나간 채 초대 수락 → A 방장·예약 해제·host_changed·끝난 판 정리', async (t) => {
    const { w, g } = await endedGame(t, 'b227', 6);
    const b = g.uuids[1];
    const r = await w.ret(b, g.gameId);
    assert.equal(r.ok, true);
    const reply = await acceptInviteToRoom(w, g.host, 'inv-b227', r.room);
    assert.equal(reply.ok, true, `초대 수락 실패: ${reply.code}`);
    assert.equal(reply.room.hostUuid, g.host);
    assert.equal(reply.room.reservedHostUuid, null);
    assert.equal(core.getEndedGameId(g.host), null);
    const notice = lastHostChanged(w, b);
    assert.ok(notice, 'B 방장 바뀜 알림 없음');
    assert.equal(notice.hostUuid, g.host);
    assert.equal(notice.reservedHostUuid, null);
});

test('A08-B-228 6명 판 B 복귀 후 원래 방장 A 초대 수락 영수증이 실패하면 예약 방장·끝난 판 묶임 그대로 유지', async (t) => {
    const { w, g } = await endedGame(t, 'b228', 6);
    const b = g.uuids[1];
    const r = await w.ret(b, g.gameId);
    assert.equal(r.ok, true);
    const matchmaking = require('../../socket/matchmaking');
    matchmaking.__setGameInviteServiceForTests({
        cancelPendingInvitesForRoom: async () => {},
        getAttemptOutcome: async ({ inviteId }) => w.invites.get(inviteId) ?? { known: false },
        recordAcceptDecision: async () => {},
        recordEntryInterrupted: async () => {},
        finalizeAcceptedEntry: async ({ publish, unpublish }) => {
            const pub = publish();
            if (!pub.ok) return pub;
            unpublish();
            return { ok: false, code: 'RECEIPT_FAILED' };
        },
    });
    w.invites.set('inv-b228', { known: true, roomId: r.room.roomId, roomInstanceId: r.room.roomInstanceId, bootEpoch: BOOT_EPOCH });
    const reply = await w.ask(MM.handleAcceptGameInvite, g.host, { inviteId: 'inv-b228' });
    assert.equal(reply.ok, false);
    const roomAfter = await w.currentRoom(b);
    assert.equal(roomAfter.hostUuid, null);
    assert.equal(roomAfter.reservedHostUuid, g.host);
    assert.equal(core.getEndedGameId(g.host), g.gameId);
    assert.equal(lastHostChanged(w, b), undefined);
});
