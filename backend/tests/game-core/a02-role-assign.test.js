'use strict';

// 역할 나누기 시험 — 자리 순서대로 광대→의사→경비원→마녀사냥꾼→시민, 누구나 광대가 될 수 있고 고르게, 지난 판 직업은 안 봄
// 목록 A02-B-083~093 (docs/게임_의도_2026-11-15/시험목록/A02-판시작-역할.md "역할 나누기")
const test = require('node:test');
const assert = require('node:assert/strict');

const gameSession = require('../../game-core/gameSession');
const { sequenceRandom } = require('../helpers/gameSession.testUtils');

const { buildSessionCandidate } = gameSession.__testables;

// 씨앗 고정 무작위 함수 (같은 씨앗이면 늘 같은 수 줄 → 결과가 안 흔들림)
function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 사람 n명 방 (자동 구성)
function makeRoom(id, n, jokerCount, extra = () => ({})) {
    const players = Array.from({ length: n }, (_, i) => ({
        uuid: `${id}-${i}`,
        nickname: `닉${id}${i}`,
        isReady: true,
        ...extra(i),
    }));
    return { id, players: new Map(players.map((p) => [p.uuid, p])), settings: { jokerCount } };
}

// 판 후보의 자리 순서대로 직업 목록 → ['JOKER', 'DOCTOR', 'CITIZEN', …]
function rolesInSeatOrder(room, randomFn) {
    const c = buildSessionCandidate(room, { randomFn, gameIdFn: () => `g-${room.id}` });
    assert.equal(c.ok, true, `판 후보 거절(${c.reason})`);
    return [...c.session.players.values()].map((p) => ({ uuid: p.uuid, role: p.role }));
}

// 직업 차례 번호 (앞 차례 직업이 늘 앞자리)
const ROLE_ORDER = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'];

// A02-B-083~088 자리 순서대로 직업이 J…D…G…W…C 차례 (10명은 광대 2)
for (let n = 5; n <= 10; n += 1) {
    const no = `A02-B-${String(83 + n - 5).padStart(3, '0')}`;
    const jokers = n === 10 ? 2 : 1;
    test(`${no} ${n}명(광대 ${jokers}) → 자리 순서대로 광대→의사→경비원→마녀사냥꾼→시민 차례`, () => {
        const seated = rolesInSeatOrder(makeRoom(no, n, jokers), seededRandom(n * 7 + 1));
        const order = seated.map((s) => ROLE_ORDER.indexOf(s.role)); // 예 → [0, 1, 4, 4, 4]
        assert.ok(order.every((v) => v >= 0), '모르는 직업이 섞임');
        assert.deepEqual(order, [...order].sort((a, b) => a - b), `차례가 어긋남: ${seated.map((s) => s.role).join(',')}`);
    });
}

// 정해 둔 무작위 수 여러 벌로 돌려 광대가 된 사람 모으기
function jokersOverRuns(id, n, jokerCount, runs) {
    const ever = new Set();
    for (let r = 0; r < runs; r += 1) {
        // 벌마다 정해 둔 수 줄 (씨앗 r로 만든 n개 수)
        const rand = seededRandom(1000 + r);
        const seq = Array.from({ length: n }, () => rand());
        for (const s of rolesInSeatOrder(makeRoom(id, n, jokerCount), sequenceRandom(seq))) {
            if (s.role === 'JOKER') ever.add(s.uuid);
        }
    }
    return ever;
}

test('A02-B-089 5명·광대 1, 정해 둔 수 여러 벌 → 5명 모두 한 번 이상 광대', () => {
    const ever = jokersOverRuns('b089', 5, 1, 60);
    assert.equal(ever.size, 5, `광대가 된 적 없는 사람 있음: ${[...ever].join(',')}`);
});

test('A02-B-090 10명·광대 2, 정해 둔 수 여러 벌 → 10명 모두 한 번 이상 광대', () => {
    const ever = jokersOverRuns('b090', 10, 2, 60);
    assert.equal(ever.size, 10, `광대가 된 적 없는 사람 있음: ${[...ever].join(',')}`);
});

// 씨앗 고정 10,000번 돌려 사람마다 광대 비율 (0~1)
function jokerRates(id, n, jokerCount, runs = 10_000) {
    const rand = seededRandom(20261116);
    const hits = new Map();
    const room = makeRoom(id, n, jokerCount);
    for (let r = 0; r < runs; r += 1) {
        for (const s of rolesInSeatOrder(room, rand)) {
            if (s.role === 'JOKER') hits.set(s.uuid, (hits.get(s.uuid) ?? 0) + 1);
        }
    }
    return [...room.players.keys()].map((uuid) => [uuid, (hits.get(uuid) ?? 0) / runs]);
}

test('A02-B-091 5명·광대 1, 씨앗 고정 10,000번 → 사람마다 광대 비율 18~22%', () => {
    for (const [uuid, rate] of jokerRates('b091', 5, 1)) {
        assert.ok(rate >= 0.18 && rate <= 0.22, `${uuid} 광대 비율 ${(rate * 100).toFixed(2)}%`);
    }
});

test('A02-B-092 10명·광대 2, 씨앗 고정 10,000번 → 사람마다 광대 비율 18~22%', () => {
    for (const [uuid, rate] of jokerRates('b092', 10, 2)) {
        assert.ok(rate >= 0.18 && rate <= 0.22, `${uuid} 광대 비율 ${(rate * 100).toFixed(2)}%`);
    }
});

test('A02-B-093 7명, 같은 무작위 수 + 지난 판 직업 칸 있음/없음 → 결과 같음', () => {
    const plain = makeRoom('b093', 7, 1);
    // 지난 판 직업 칸을 붙인 같은 사람들 (앞사람은 지난 판 광대, 나머지 시민)
    const withPast = makeRoom('b093', 7, 1, (i) => ({
        role: i === 0 ? 'JOKER' : 'CITIZEN',
        lastRole: i === 0 ? 'JOKER' : 'CITIZEN',
    }));
    const a = rolesInSeatOrder(plain, seededRandom(93));
    const b = rolesInSeatOrder(withPast, seededRandom(93));
    assert.deepEqual(b, a);
});
