'use strict';

// 낮 표 받기 시험 (판 규칙 순수) — 표 바꾸면 마지막 표만 세는지, 안 되는 표는 거절 코드와 함께 막는지 봄
// 목록 docs/게임_의도_2026-11-15/시험목록/A03-낮투표.md A03-B-072~095, 돌리기: node --test tests/game-core/a03-day-vote-submit.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 닿지 않는 곳으로 막음 (모델이 DB에 안 붙게)
const gf = require('../audit-2026-11-09/gameFixtures');

const { core, T } = gf;

// 판 차리기: 광대 1·나머지 시민으로 직업 고정 (밤에 광대만 움직여 날 넘기기 쉬움)
function newGame(t, id, n) {
    gf.resetCore();
    t.after(() => gf.resetCore());
    return gf.startGame({ id, n, roleCounts: { JOKER: 1 } });
}

const aliveUuids = (s) => [...s.players.values()].filter((p) => p.alive).map((p) => p.uuid);
const vote = (s, uuid, target) => core.submitDayVote(uuid, s.id, target);

// 표 모양 → 사람마다 낼 표 (자기 자신은 못 찍어서 짝을 맞춰 나눔), plan 예: { X: 3, Y: 2, ab: 1 }
function assignBallots(voters, cands, plan) {
    const pool = [];
    for (const [key, uuid] of Object.entries(cands)) {
        for (let i = 0; i < (plan[key] ?? 0); i += 1) pool.push(uuid);
    }
    for (let i = 0; i < (plan.ab ?? 0); i += 1) pool.push(null);
    if (pool.length !== voters.length) throw new Error(`표 수(${pool.length})와 투표자 수(${voters.length})가 다름`);
    const out = [];
    const used = pool.map(() => false);
    const place = (i) => {
        if (i === voters.length) return true;
        for (let j = 0; j < pool.length; j += 1) {
            if (used[j] || pool[j] === voters[i]) continue;
            used[j] = true;
            out[i] = [voters[i], pool[j]];
            if (place(i + 1)) return true;
            used[j] = false;
        }
        return false;
    };
    if (!place(0)) throw new Error('자기 자신을 안 찍게 나눌 수 없음');
    return out;
}

// 정해 둔 사람들(voters)이 표 모양대로 냄
function castBase(s, voters, cands, plan) {
    for (const [voter, target] of assignBallots(voters, cands, plan)) {
        const r = vote(s, voter, target);
        assert.equal(r.ok, true, `표 거절됨: ${r.code}`);
    }
}

// 낮 한 번 넘김: 투표로 가서 산 사람 전원 기권 → 판정 → 밤
function passDay(s) {
    gf.toVote(s);
    for (const uuid of aliveUuids(s)) assert.equal(vote(s, uuid, null).ok, true);
    const prepared = core.prepareDayVoteResolution(aliveUuids(s)[0], s.id, s.dayIndex);
    assert.equal(prepared.ok, true, `낮 판정 준비 실패: ${prepared.code}`);
    assert.equal(core.commitDayVoteResolution(prepared.session, prepared.resolution).ok, true);
}

// 밤 한 번: 광대가 victim을 죽임 → 다음 날 낮
function passNight(s, victim) {
    const joker = gf.firstOf(s, 'JOKER');
    const { committed } = gf.resolveNightDirect(s, { [joker]: victim });
    assert.equal(committed?.ok, true, '밤 판정 실패');
}

// 6명 판 첫 낮 투표 단계
function sixAtVote(t, id) {
    const s = newGame(t, id, 6);
    gf.toDay(s);
    gf.toVote(s);
    return s;
}

// 6명 판, 첫 밤에 시민 하나 죽고 둘째 날 투표 단계 → { s, dead }
function sixWithDeadAtVote(t, id) {
    const s = newGame(t, id, 6);
    gf.toDay(s);
    const dead = gf.nonJokers(s).at(-1);
    passDay(s);
    passNight(s, dead);
    gf.toVote(s);
    return { s, dead };
}

// ── B-072~077: 표 바꾸기는 마지막 표만 셈 (7명 판) ──
// A가 바꾸는 사람, 나머지 6명(X·Y·Z 포함)은 바탕 표를 한 번 냄. 앞 표가 같이 세지면 결과가 달라지게 바탕을 고름
function sevenChange(t, id) {
    const s = newGame(t, id, 7);
    gf.toDay(s);
    gf.toVote(s);
    const [X, Y, Z, A, ...rest] = aliveUuids(s);
    return { s, X, Y, Z, A, others: [X, Y, Z, ...rest] };
}

const CHANGES = [
    { no: 72, name: '① X→Y', base: { X: 3, Y: 2, Z: 1 }, seq: ['X', 'Y'], outcome: 'TIE', defendant: null, abstain: 0 },
    { no: 73, name: '② X→Y→X', base: { X: 2, Y: 3, Z: 1 }, seq: ['X', 'Y', 'X'], outcome: 'TIE', defendant: null, abstain: 0 },
    { no: 74, name: '③ X→기권', base: { X: 3, Y: 3 }, seq: ['X', null], outcome: 'TIE', defendant: null, abstain: 1 },
    { no: 75, name: '④ 기권→X', base: { X: 3, Y: 3 }, seq: [null, 'X'], outcome: 'TRIBUNAL', defendant: 'X', abstain: 0 },
    { no: 76, name: '⑤ X→Y→Z 세 번', base: { X: 3, Y: 3 }, seq: ['X', 'Y', 'Z'], outcome: 'TIE', defendant: null, abstain: 0 },
    { no: 77, name: '⑥ 같은 X 다시 냄', base: { X: 2, Y: 3, Z: 1 }, seq: ['X', 'X'], outcome: 'TIE', defendant: null, abstain: 0 },
];

for (const c of CHANGES) {
    const no = `A03-B-${String(c.no).padStart(3, '0')}`;
    test(`${no} 7명 판 표 바꾸기 ${c.name} → 마지막 표만 셈, 한 사람 한 표`, (t) => {
        const { s, X, Y, Z, A, others } = sevenChange(t, `vs${c.no}`);
        const cands = { X, Y, Z };
        castBase(s, others, cands, c.base);
        for (const key of c.seq) assert.equal(vote(s, A, key === null ? null : cands[key]).ok, true);
        const tally = T.tallyDayVoteOutcome(s);
        assert.equal(tally.outcome, c.outcome);
        assert.equal(tally.tribunalTargetUuid, c.defendant ? cands[c.defendant] : null);
        assert.equal(tally.publicVoteCount, 7);
        assert.equal(tally.publicAbstainCount, c.abstain);
    });
}

// ── B-078~095: 낮 표 거절 (6명 판) ──

test('A03-B-078 ① 나 자신을 찍음 → SELF_TARGET_NOT_ALLOWED', (t) => {
    const s = sixAtVote(t, 'vs78');
    const [me] = aliveUuids(s);
    assert.deepEqual(vote(s, me, me), { ok: false, code: 'SELF_TARGET_NOT_ALLOWED' });
});

test('A03-B-079 ② 죽은 사람을 찍음 → TARGET_NOT_ALIVE', (t) => {
    const { s, dead } = sixWithDeadAtVote(t, 'vs79');
    const [me] = aliveUuids(s);
    assert.deepEqual(vote(s, me, dead), { ok: false, code: 'TARGET_NOT_ALIVE' });
});

test('A03-B-080 ③ 판에 없는 uuid를 찍음 → INVALID_TARGET', (t) => {
    const s = sixAtVote(t, 'vs80');
    const [me] = aliveUuids(s);
    assert.deepEqual(vote(s, me, 'not-in-this-game-uuid'), { ok: false, code: 'INVALID_TARGET' });
});

// ④~⑦ 대상 모양이 이상한 값
const BAD_TARGETS = [
    [81, '④ 빈 글자', ''],
    [82, '⑤ 숫자 123', 123],
    [83, '⑥ 빈 객체', {}],
    [84, '⑦ 빈 배열', []],
];
for (const [n, name, target] of BAD_TARGETS) {
    test(`A03-B-0${n} ${name} 대상 → INVALID_TARGET`, (t) => {
        const s = sixAtVote(t, `vs${n}`);
        const [me] = aliveUuids(s);
        assert.deepEqual(vote(s, me, target), { ok: false, code: 'INVALID_TARGET' });
    });
}

test('A03-B-085 ⑧ 죽은 사람이 표를 냄 → ACTOR_NOT_ALIVE', (t) => {
    const { s, dead } = sixWithDeadAtVote(t, 'vs85');
    const [target] = aliveUuids(s);
    assert.deepEqual(vote(s, dead, target), { ok: false, code: 'ACTOR_NOT_ALIVE' });
});

test('A03-B-086 ⑨ 역할 공개 중 표 → INVALID_PHASE', (t) => {
    const s = newGame(t, 'vs86', 6);
    assert.equal(s.phase, 'ROLE_REVEAL');
    const [me, target] = aliveUuids(s);
    assert.deepEqual(vote(s, me, target), { ok: false, code: 'INVALID_PHASE' });
});

test('A03-B-087 ⑩ 밤에 표 → INVALID_PHASE', (t) => {
    const s = newGame(t, 'vs87', 6);
    gf.toDay(s);
    // 도우미의 밤 넘기기 (판정 길 안 거친 밤)
    gf.toNight(s);
    const [me, target] = aliveUuids(s);
    assert.deepEqual(vote(s, me, target), { ok: false, code: 'INVALID_PHASE' });
});

test('A03-B-088 ⑪ 재판 중 낮 표 → DAY_VOTE_ALREADY_RESOLVED (재판은 늘 낮 판정 뒤라 ⑬과 같은 코드)', (t) => {
    const s = newGame(t, 'vs88', 6);
    gf.toDay(s);
    const [defendant, me, target] = aliveUuids(s);
    // 재판은 낮 판정으로만 열림 → 도우미가 진짜 판정으로 재판에 세움
    gf.toTribunal(s, defendant);
    assert.equal(s.phase, 'TRIBUNAL');
    assert.deepEqual(vote(s, me, target), { ok: false, code: 'DAY_VOTE_ALREADY_RESOLVED' });
});

test('A03-B-089 ⑫ 토론 중 표 → INVALID_DAY_PHASE', (t) => {
    const s = newGame(t, 'vs89', 6);
    gf.toDay(s);
    const [me, target] = aliveUuids(s);
    assert.deepEqual(vote(s, me, target), { ok: false, code: 'INVALID_DAY_PHASE' });
});

test('A03-B-090 ⑬ 판정 끝난 뒤 표 → DAY_VOTE_ALREADY_RESOLVED', (t) => {
    const s = sixAtVote(t, 'vs90');
    const [X, Y, ...rest] = aliveUuids(s);
    // X 3·Y 3 동점 → 판정 → 밤
    castBase(s, [X, Y, ...rest], { X, Y }, { X: 3, Y: 3 });
    const prepared = core.prepareDayVoteResolution(X, s.id, s.dayIndex);
    assert.equal(prepared.ok, true);
    assert.equal(core.commitDayVoteResolution(prepared.session, prepared.resolution).ok, true);
    assert.deepEqual(vote(s, rest[0], X), { ok: false, code: 'DAY_VOTE_ALREADY_RESOLVED' });
});

test('A03-B-091 ⑭ 판에 없는 사람이 표를 냄 → 거절', (t) => {
    const s = sixAtVote(t, 'vs91');
    const [target] = aliveUuids(s);
    const r = vote(s, 'outsider-uuid', target);
    assert.equal(r.ok, false);
    assert.equal(typeof r.code, 'string');
});

test('A03-B-092 ⑮ 다른 판 id로 표 → 거절', (t) => {
    const s = sixAtVote(t, 'vs92');
    // 다른 판도 진짜로 하나 열어 둠
    const other = gf.startGame({ id: 'vs92o', n: 5, roleCounts: { JOKER: 1 } });
    const [me, target] = aliveUuids(s);
    const r = core.submitDayVote(me, other.id, target);
    assert.equal(r.ok, false);
    assert.equal(typeof r.code, 'string');
});

test('A03-B-093 ⑯ 판 id 빈 값 → INVALID_GAME_ID', (t) => {
    const s = sixAtVote(t, 'vs93');
    const [me, target] = aliveUuids(s);
    assert.deepEqual(core.submitDayVote(me, '', target), { ok: false, code: 'INVALID_GAME_ID' });
});

test('A03-B-094 ⑰ 거절된 표는 세기에 안 들어감', (t) => {
    const s = sixAtVote(t, 'vs94');
    const [X, Y, ...rest] = aliveUuids(s);
    // X가 자기를 찍으려다 거절됨 → X는 안 낸 사람(기권)으로 남음
    assert.equal(vote(s, X, X).ok, false);
    // 나머지 5명: X 2·Y 1·기권 2 → 거절된 표가 세지면 X 3 > 기권 2라 재판이 됨
    castBase(s, [Y, ...rest], { X, Y }, { X: 2, Y: 1, ab: 2 });
    const tally = T.tallyDayVoteOutcome(s);
    assert.equal(tally.outcome, 'ABSTAIN_MAJORITY');
    assert.equal(tally.tribunalTargetUuid, null);
    assert.equal(tally.publicAbstainCount, 3);
});

test('A03-B-095 ⑱ 기권(null)은 받음', (t) => {
    const s = sixAtVote(t, 'vs95');
    const [me] = aliveUuids(s);
    assert.deepEqual(vote(s, me, null), { ok: true });
});
