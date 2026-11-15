'use strict';

// 승패 판정 순수 시험 — 산 사람만 세서 시민 승·광대 승·계속을 정하는지, 승리 이유 이름까지 봄
// 목록 A07-B-001~042 (docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md)
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 막음 → 판 코드를 불러도 DB에 안 붙음
const gf = require('../audit-2026-11-09/gameFixtures');

const { core, T } = gf;

// 인원별 광대 수: 5~7명 1, 8~10명 2 (목록 줄 그대로)
const jokersFor = (n) => (n >= 8 ? 2 : 1);

// 판 하나 열기: 판 id가 겹치면 "이미 다른 판"으로 터져서 시험마다 장부 비우고 새 id
let seq = 0;
function open(t, opts) {
    gf.resetCore();
    t.after(() => gf.resetCore());
    seq += 1;
    return gf.startGame({ ...opts, id: `a07w-${seq}` });
}

// 직업 이름으로 사람 찾기
const jokers = (s) => gf.byRole(s, 'JOKER');
const others = (s) => gf.nonJokers(s);

// 죽은 사람 만들기 (판정 함수에 넣을 상태만 맞춤)
function kill(s, uuid, reason = 'EXECUTION') {
    const p = s.players.get(uuid);
    p.alive = false;
    p.deathReason = reason;
}

// 산 광대 수·산 나머지 수를 맞춤 (앞에서부터 죽임)
function keepAlive(s, aliveJokers, aliveOthers) {
    jokers(s).slice(aliveJokers).forEach((u) => kill(s, u));
    others(s).slice(aliveOthers).forEach((u) => kill(s, u));
}

// 판정 결과의 승자 (계속이면 null)
const winnerOf = (s) => T.evaluateWinCondition(s)?.winner ?? null;

// 재판 유죄 처형 한 번 (낮 투표 → 재판 → 산 사람 전원 유죄 → 판정 확정)
function execute(s, uuid) {
    gf.toTribunal(s, uuid);
    const voters = [...s.players.values()].filter((p) => p.alive && p.uuid !== uuid).map((p) => p.uuid);
    for (const v of voters) assert.equal(core.submitTribunalVote(v, s.id, s.dayIndex, 'GUILTY').ok, true);
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    assert.equal(prepared.ok, true, `재판 판정 준비 실패: ${prepared.code}`);
    return core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
}

// A07-B-001~024: 인원 5~10 × 산 (광대, 나머지) 4가지
const STATES = [
    { name: '(0, 인원−k) 시민 승', alive: (n, k) => [0, n - k], winner: 'CITIZEN' },
    { name: '(k, k+1) 계속', alive: (n, k) => [k, k + 1], winner: null },
    { name: '(k, k) 광대 승', alive: (n, k) => [k, k], winner: 'JOKER' },
    { name: '(k, k−1) 광대 승', alive: (n, k) => [k, k - 1], winner: 'JOKER' },
];
let no = 1;
for (const n of [5, 6, 7, 8, 9, 10]) {
    for (const st of STATES) {
        const id = `A07-B-${String(no).padStart(3, '0')}`;
        no += 1;
        test(`${id} ${n}명 판 산 ${st.name}`, (t) => {
            const k = jokersFor(n);
            const s = open(t, { n, jokerCount: k });
            assert.equal(jokers(s).length, k);
            const [aj, ao] = st.alive(n, k);
            keepAlive(s, aj, ao);
            assert.equal(winnerOf(s), st.winner);
        });
    }
}

// A07-B-025~030: 죽은 광대는 안 셈 (광대 2명 판에서 1명 죽고 1명 산, 나머지 2명 산)
[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    test(`A07-B-0${25 + i} ${n}명 판 죽은 광대 1 + 산 광대 1 + 산 나머지 2 → 계속`, (t) => {
        const s = open(t, { n, jokerCount: 2 });
        const [deadJoker] = jokers(s);
        kill(s, deadJoker);
        others(s).slice(2).forEach((u) => kill(s, u));
        // 죽은 광대까지 셌다면 2 ≥ 2라 광대 승이 나옴 → 계속(null)이어야 함
        assert.equal(winnerOf(s), null);
    });
});

// A07-B-031~034: 무승부 없음 (6명 판, 아주 적은 수까지)
[
    { id: 'A07-B-031', aj: 0, ao: 0, winner: 'CITIZEN' },
    { id: 'A07-B-032', aj: 1, ao: 0, winner: 'JOKER' },
    { id: 'A07-B-033', aj: 0, ao: 1, winner: 'CITIZEN' },
    { id: 'A07-B-034', aj: 1, ao: 1, winner: 'JOKER' },
].forEach(({ id, aj, ao, winner }) => {
    test(`${id} 6명 판 산 (광대 ${aj}, 나머지 ${ao}) → ${winner} 승, 승자는 시민·광대 둘뿐`, (t) => {
        const s = open(t, { n: 6, jokerCount: 1 });
        keepAlive(s, aj, ao);
        const result = T.evaluateWinCondition(s);
        assert.ok(['CITIZEN', 'JOKER'].includes(result?.winner), `승자 값이 ${result?.winner}`);
        assert.equal(result.winner, winner);
    });
});

// A07-B-035~038: 의사·경비원·마녀사냥꾼·시민 모두 "나머지"로 셈 (7명 판, 그 직업 2명 판)
[
    { id: 'A07-B-035', role: 'DOCTOR', roleCounts: { JOKER: 1, DOCTOR: 2 } },
    { id: 'A07-B-036', role: 'GUARD', roleCounts: { JOKER: 1, GUARD: 2 } },
    { id: 'A07-B-037', role: 'WITCH_HUNTER', roleCounts: { JOKER: 1, WITCH_HUNTER: 2 } },
    { id: 'A07-B-038', role: 'CITIZEN', roleCounts: { JOKER: 1 } },
].forEach(({ id, role, roleCounts }) => {
    test(`${id} 7명 판 산 광대 1 + 산 ${role} 1 → 광대 승, ${role} 1명 더 살면 계속`, (t) => {
        const s = open(t, { n: 7, roleCounts });
        const [a, b] = gf.byRole(s, role);
        assert.ok(a && b, `${role} 2명이 판에 없음`);
        // 그 직업 둘(a·b)과 광대만 남기고 나머지 죽임
        for (const u of others(s)) if (u !== a && u !== b) kill(s, u);
        assert.equal(winnerOf(s), null, '광대 1 · 나머지 2면 계속');
        kill(s, b);
        assert.equal(winnerOf(s), 'JOKER', '광대 1 · 나머지 1이면 광대 승');
    });
});

// A07-B-039~040: 승리 이유 이름 (전적 기록 win_reason)
test('A07-B-039 시민 승 → 전적 win_reason ALL_JOKERS_ELIMINATED', (t) => {
    const s = open(t, { n: 6 });
    gf.toDay(s);
    const committed = execute(s, jokers(s)[0]);
    assert.equal(committed.terminal?.winner, 'CITIZEN');
    assert.equal(core.buildGameResultRecord(s).result.win_reason, 'ALL_JOKERS_ELIMINATED');
});

test('A07-B-040 광대 승 → 전적 win_reason JOKER_PARITY_REACHED', (t) => {
    const s = open(t, { n: 5 });
    gf.toDay(s);
    // 시민 셋을 미리 죽여 (광대 1, 나머지 2) → 처형 한 번이면 (1, 1)
    others(s).slice(0, 2).forEach((u) => kill(s, u, 'ASSASSINATION'));
    const committed = execute(s, others(s)[2]);
    assert.equal(committed.terminal?.winner, 'JOKER');
    assert.equal(core.buildGameResultRecord(s).result.win_reason, 'JOKER_PARITY_REACHED');
});

test('A07-B-041 5명 판 광대 2명으로 시작하면 바로 안 끝남 (산 2·3 → 계속)', (t) => {
    const s = open(t, { n: 5, roleCounts: { JOKER: 2 } });
    assert.equal(jokers(s).length, 2);
    assert.equal(others(s).length, 3);
    assert.equal(winnerOf(s), null);
});

test('A07-B-042 시민 0명 판(광대1·의사2·경비원1·마녀사냥꾼1)도 광대 처형이면 시민 승', (t) => {
    const s = open(t, { n: 5, roleCounts: { JOKER: 1, DOCTOR: 2, GUARD: 1, WITCH_HUNTER: 1 } });
    assert.equal(gf.byRole(s, 'CITIZEN').length, 0);
    gf.toDay(s);
    const committed = execute(s, jokers(s)[0]);
    assert.equal(committed.terminal?.winner, 'CITIZEN');
    assert.equal(s.winResult?.winner, 'CITIZEN');
});
