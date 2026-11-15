'use strict';

// 판 끝 뒤 다시 연 방 정원 셈·다음 방장 시험 — 방장 자리 남김 동안 1칸 덜 들어옴, 남긴 칸은 원래 방장만, 남김 끝이면 보통 자리, 방장 빠진 뒤 다음 방장
// 목록 A08-B-001~017 (docs/게임_의도_2026-11-15/시험목록/A08-판끝-같은방.md), 돌리기: node --env-file=.env.test --test tests/unit/a08-reserved-seat.test.js
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:1/blocked_test_db'; // 맨 위, 모델이 DB에 안 붙게
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld, matchmaking } = require('../flow/a08-world');
const { nextHostAfterLeave } = require('../../socket/matchmaking/room/returnRoom');

// 판 끝 뒤 다시 연 방을 장부에 바로 넣음 (판을 안 돌리고 자리 셈만 보려고)
// reserved: 원래 방장 자리 남겨 두는 중이면 true, 남김 끝이면 false (180초 지나 returnHold 비움)
let seq = 0;
function seedReturnRoom(w, { max, seatedCount, reserved }) {
    seq += 1;
    const id = `a08-seat-room-${seq}`;
    const code = `SEAT${String(seq).padStart(2, '0')}`;
    const seated = Array.from({ length: seatedCount }, (_, i) => `a08-seat-${seq}-in-${i}`);
    const players = new Map();
    for (const uuid of seated) {
        w.connect(uuid);
        players.set(uuid, { uuid, nickname: `닉-${uuid}`, isReady: false, membershipId: `m-${uuid}` });
        matchmaking.__seedPlayerRoomForTests(uuid, id);
    }
    const origHost = `a08-seat-${seq}-orig-host`;
    matchmaking.__seedRoomForTests({
        id,
        instanceId: `${id}-inst`,
        code,
        hostUuid: reserved ? null : (seated[0] ?? null),
        title: '시험 방',
        accessType: 'code',
        players,
        settings: { maxPlayers: max, jokerCount: 1, dayDiscussionTime: 30, dayVoteTime: 30, nightActionTime: 30 },
        settingsVersion: 1,
        returnHold: reserved ? { gameId: `g-${id}`, closesAt: Date.now() + 180_000, reservedHostUuid: origHost } : null,
    });
    return { code, origHost, outsider: `a08-seat-${seq}-new` };
}

// ── 방장 자리를 남겨 둔 동안 다른 사람은 1칸 덜 들어옴 (앉은 사람 = 정원−2 → 들어감) ──
const SIZES = [5, 6, 7, 8, 9, 10];
SIZES.forEach((max, i) => {
    test(`A08-B-${String(1 + i).padStart(3, '0')} 정원 ${max}·방장 자리 남김·앉은 ${max - 2}명 → 다른 사람 들어감`, async (t) => {
        const w = makeWorld(t);
        const r = seedReturnRoom(w, { max, seatedCount: max - 2, reserved: true });
        w.connect(r.outsider);
        const joined = await w.joinCode(r.outsider, r.code);
        assert.equal(joined.ok, true, `막힘: ${joined.code}`);
        assert.equal(joined.room.players.length, max - 1);
    });
});

// ── 남겨 둔 칸은 원래 방장만 씀 (앉은 사람 = 정원−1 → 다른 사람 막힘, 원래 방장은 들어감) ──
SIZES.forEach((max, i) => {
    test(`A08-B-${String(7 + i).padStart(3, '0')} 정원 ${max}·방장 자리 남김·앉은 ${max - 1}명 → 다른 사람 ROOM_FULL, 원래 방장은 들어감`, async (t) => {
        const w = makeWorld(t);
        const r = seedReturnRoom(w, { max, seatedCount: max - 1, reserved: true });
        w.connect(r.outsider);
        const blocked = await w.joinCode(r.outsider, r.code);
        assert.equal(blocked.ok, false);
        assert.equal(blocked.code, 'ROOM_FULL');
        w.connect(r.origHost);
        const host = await w.joinCode(r.origHost, r.code);
        assert.equal(host.ok, true, `원래 방장 막힘: ${host.code}`);
        assert.equal(host.room.players.length, max);
    });
});

// ── 남김이 끝나면 그 칸도 보통 자리 (앉은 사람 = 정원−1 → 다른 사람 들어감) ──
[5, 10].forEach((max, i) => {
    test(`A08-B-${String(13 + i).padStart(3, '0')} 정원 ${max}·남김 끝·앉은 ${max - 1}명 → 다른 사람 들어감`, async (t) => {
        const w = makeWorld(t);
        const r = seedReturnRoom(w, { max, seatedCount: max - 1, reserved: false });
        w.connect(r.outsider);
        const joined = await w.joinCode(r.outsider, r.code);
        assert.equal(joined.ok, true, `막힘: ${joined.code}`);
        assert.equal(joined.room.players.length, max);
    });
});

// ── 방장이 빠진 뒤 다음 방장 (방 모양만 주고 고르는 값을 봄) ──
// 방 명단 Map은 들어온 차례 그대로 → 첫 키 = 먼저 들어온 사람
const roomShape = (players, reservedHostUuid) => ({
    hostUuid: null,
    players: new Map(players.map((uuid) => [uuid, { uuid }])),
    returnHold: reservedHostUuid === undefined ? null : { reservedHostUuid },
});

test('A08-B-015 방장 자리 남김 중 방장이 빠짐 → 방장 칸 비워 둠(null)', () => {
    assert.equal(nextHostAfterLeave(roomShape(['c', 'b'], 'orig-a')), null);
});

test('A08-B-016 남김 끝 + 2명(C 먼저, B 나중) → 먼저 들어온 C가 방장', () => {
    assert.equal(nextHostAfterLeave(roomShape(['c', 'b'])), 'c');
    assert.equal(nextHostAfterLeave(roomShape(['c', 'b'], null)), 'c');
});

test('A08-B-017 남김 끝 + 0명 → 방장 칸 비움(null)', () => {
    assert.equal(nextHostAfterLeave(roomShape([])), null);
});
