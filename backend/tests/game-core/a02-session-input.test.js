'use strict';

// 판 만들기 입력 시험 — 인원 경계·틀린 사람 정보·같은 방/다른 판 사람 거절·첫 단계·방 시간 설정·나뉜 직업 수
// 목록 A02-B-056~082 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md "판 만들기 입력·기본값")
const test = require('node:test');
const assert = require('node:assert/strict');

// 판 차리기 도우미 (맨 위에서 DB 주소를 닿지 않는 곳으로 막음)
const gf = require('../audit-2026-11-09/gameFixtures');
const gameSession = require('../../game-core/gameSession');

const { buildSessionCandidate } = gameSession.__testables;

// 사람 n명 (uuid는 앞글자로 시험마다 다르게)
const makePlayers = (prefix, n) => Array.from({ length: n }, (_, i) => ({
    uuid: `${prefix}-${i}`,
    nickname: `닉${prefix}${i}`,
    isReady: true,
}));

// 방 하나 (기본 자동·광대 1)
function makeRoom(id, players, settings = { jokerCount: 1 }) {
    return { id, players: new Map(players.map((p) => [p.uuid, p])), settings };
}

// 판 후보 만들기 (직업은 randomFn 0으로 늘 같게)
const candidateOf = (room, gameId = `g-${room.id}`) =>
    buildSessionCandidate(room, { randomFn: () => 0, gameIdFn: () => gameId });

// 시험마다 판 장부 비움 (같은 방·같은 사람 검사가 앞 시험에 안 걸리게)
test.beforeEach(() => gf.resetCore());
test.after(() => gf.resetCore());

// A02-B-056~060 판 인원 경계: 0·4·11명 거절, 5·10명 후보 생김
const PLAYER_COUNT_EDGES = [
    ['A02-B-056', 0, false],
    ['A02-B-057', 4, false],
    ['A02-B-058', 11, false],
    ['A02-B-059', 5, true],
    ['A02-B-060', 10, true],
];
for (const [no, n, ok] of PLAYER_COUNT_EDGES) {
    test(`${no} 사람 ${n}명 → ${ok ? '판 후보 생김' : '거절'}`, () => {
        assert.equal(candidateOf(makeRoom(no, makePlayers(no, n))).ok, ok);
    });
}

// A02-B-061~063 [지금 동작] 사람 정보가 틀림 → 거절
test('A02-B-061 [지금 동작] 5명 중 uuid 빈 값 → 거절', () => {
    const players = makePlayers('b061', 5);
    const room = { id: 'b061', players: new Map(players.map((p, i) => [`k${i}`, i === 2 ? { ...p, uuid: '' } : p])), settings: { jokerCount: 1 } };
    assert.equal(candidateOf(room).ok, false);
});

test('A02-B-062 [지금 동작] 5명 중 닉네임 빈 값 → 거절', () => {
    const players = makePlayers('b062', 5).map((p, i) => (i === 3 ? { ...p, nickname: '' } : p));
    assert.equal(candidateOf(makeRoom('b062', players)).ok, false);
});

test('A02-B-063 [지금 동작] 5명 중 같은 uuid 두 번 → 거절', () => {
    const players = makePlayers('b063', 5);
    // 칸 이름은 달라도 안의 uuid가 같은 사람 둘
    const entries = players.map((p, i) => [`k${i}`, i === 4 ? { ...p, uuid: players[0].uuid } : p]);
    const room = { id: 'b063', players: new Map(entries), settings: { jokerCount: 1 } };
    assert.equal(candidateOf(room).ok, false);
});

test('A02-B-064 같은 방 id로 두 번째 판 만들기 (6명) → DUPLICATE_ROOM_SESSION', () => {
    const first = gameSession.prepareGameSession(makeRoom('b064-room', makePlayers('b064a', 6)), { randomFn: () => 0 });
    assert.equal(first.ok, true);
    gameSession.commitGameSession(first.session);
    const second = gameSession.prepareGameSession(makeRoom('b064-room', makePlayers('b064b', 6)), { randomFn: () => 0 });
    assert.equal(second.ok, false);
    assert.equal(second.code, 'DUPLICATE_ROOM_SESSION');
});

test('A02-B-065 7명 중 1명이 다른 판에서 살아 있음 → PLAYER_ALREADY_IN_SESSION', () => {
    const other = gf.startGame({ id: 'b065-old', n: 5 });
    const alive = [...other.players.keys()][1];
    const players = [...makePlayers('b065', 6), { uuid: alive, nickname: '산사람', isReady: true }];
    const r = gameSession.prepareGameSession(makeRoom('b065-new', players), { randomFn: () => 0 });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'PLAYER_ALREADY_IN_SESSION');
});

test('A02-B-066 다른 판에서 죽은 사람이 낌 (5명) → 판 후보 생김, 옛 판에서 풀림', () => {
    // 옛 판 5명(광대 1·시민 4): 첫 밤 광대가 시민 하나 죽임 → 1:3이라 판은 계속
    const old = gf.startGame({ id: 'b066-old', n: 5 });
    gf.toDay(old);
    gf.toNight(old);
    const joker = gf.firstOf(old, 'JOKER');
    const dead = gf.nonJokers(old)[0];
    gf.resolveNightDirect(old, { [joker]: dead });
    assert.equal(old.players.get(dead).alive, false);
    assert.notEqual(old.phase, 'ENDED');

    const players = [...makePlayers('b066', 4), { uuid: dead, nickname: '죽은사람', isReady: true }];
    const prepared = gameSession.prepareGameSession(makeRoom('b066-new', players), { randomFn: () => 0 });
    assert.equal(prepared.ok, true, `거절됨(${prepared.code ?? prepared.reason})`);
    const released = gameSession.commitGameSession(prepared.session);
    assert.deepEqual(released.map((r) => [r.uuid, r.gameId]), [[dead, old.id]]);
});

test('A02-B-067 5명 판 후보 → 단계 ROLE_REVEAL, 0일째', () => {
    const c = candidateOf(makeRoom('b067', makePlayers('b067', 5)));
    assert.equal(c.ok, true);
    assert.equal(c.session.phase, 'ROLE_REVEAL');
    assert.equal(c.session.dayIndex, 0);
});

test('A02-B-068 8명 판 후보 → 8명 모두 산 사람·참여 중', () => {
    const c = candidateOf(makeRoom('b068', makePlayers('b068', 8)));
    assert.equal(c.ok, true);
    const players = [...c.session.players.values()];
    assert.equal(players.length, 8);
    for (const p of players) {
        assert.equal(p.alive, true, `${p.uuid} 죽음`);
        assert.equal(p.isParticipating, true, `${p.uuid} 참여 아님`);
    }
});

// A02-B-069~076 방 시간 설정이 판에 그대로 (6명), 나머지 시간은 기본 값으로 둠
const BASE_TIMES = { dayDiscussionTime: 60, dayVoteTime: 60, tribunalTime: 45, nightActionTime: 60 };
const TIME_CASES = [
    ['A02-B-069', '토론', 'dayDiscussionTime', 30],
    ['A02-B-070', '토론', 'dayDiscussionTime', 150],
    ['A02-B-071', '투표', 'dayVoteTime', 30],
    ['A02-B-072', '투표', 'dayVoteTime', 90],
    ['A02-B-073', '재판', 'tribunalTime', 15],
    ['A02-B-074', '재판', 'tribunalTime', 120],
    ['A02-B-075', '밤', 'nightActionTime', 30],
    ['A02-B-076', '밤', 'nightActionTime', 120],
];
for (const [no, label, key, seconds] of TIME_CASES) {
    test(`${no} 방 ${label} ${seconds}초 (6명) → 판 ${label} 시간 ${seconds}초`, () => {
        const settings = { jokerCount: 1, ...BASE_TIMES, [key]: seconds };
        const c = candidateOf(makeRoom(no, makePlayers(no, 6), settings));
        assert.equal(c.ok, true);
        assert.equal(c.session.timerSettings[key], seconds);
    });
}

// A02-B-077~082 자동·광대 1, 나눈 뒤 사람마다 직업 하나, 직업별 수가 B-001~006 표와 같음
const AUTO_TABLE = {
    5: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 4 },
    6: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 4 },
    7: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 5 },
    8: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0, CITIZEN: 5 },
    9: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0, CITIZEN: 6 },
    10: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 6 },
};
for (let n = 5; n <= 10; n += 1) {
    const no = `A02-B-${String(77 + n - 5).padStart(3, '0')}`;
    test(`${no} 자동 광대 1, ${n}명 → 사람마다 직업 하나, 직업 수가 구성 표와 같음`, () => {
        const c = candidateOf(makeRoom(no, makePlayers(no, n)));
        assert.equal(c.ok, true);
        const counts = { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 0 };
        for (const p of c.session.players.values()) {
            assert.ok(Object.hasOwn(counts, p.role), `${p.uuid} 직업 없음(${p.role})`);
            counts[p.role] += 1;
        }
        assert.deepEqual(counts, AUTO_TABLE[n]);
    });
}
