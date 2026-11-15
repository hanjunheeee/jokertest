'use strict';

// 밤 시험(판 규칙) — 밤 암살 뒤 승패: 산 광대가 나머지 수 이상이면 광대 승, 아니면 다음 낮(날짜 +1)
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-084~094, 돌리기: node --test tests/game-core/a05a-night-win.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 DB 주소를 닿지 않는 곳으로 막음 → 꼭 판 코드보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');

const core = gf.core;

// ── 판 차리기 도우미 (이 파일 안에서만 씀) ──
let seq = 0;

// 판 열기: 직업은 randomFn 0으로 늘 같게, 판 id는 시험마다 다르게
function open(t, n, opts = {}) {
    seq += 1;
    t.after(() => gf.resetCore());
    return gf.startGame({ id: `a05a-nw-${seq}`, n, ...opts });
}

const aliveUuids = (s) => [...s.players.values()].filter((p) => p.alive).map((p) => p.uuid);
const aliveOf = (s, role) => gf.byRole(s, role).filter((u) => s.players.get(u).alive);

// 낮을 모두 기권으로 넘김 → 재판 없이 밤
function passDay(s) {
    if (s.phase === 'ROLE_REVEAL') gf.toDay(s);
    gf.toVote(s);
    const voters = aliveUuids(s);
    for (const uuid of voters) core.submitDayVote(uuid, s.id, null);
    const prepared = core.prepareDayVoteResolution(voters[0], s.id, s.dayIndex);
    core.commitDayVoteResolution(prepared.session, prepared.resolution);
    assert.equal(s.phase, 'NIGHT', '기권 낮 뒤 밤이 아님 (준비 잘못)');
}

// 낮에 한 사람 재판 → 모두 유죄 → 처형 뒤 밤
function executeDay(s, uuid) {
    gf.toTribunal(s, uuid);
    const voters = aliveUuids(s).filter((u) => u !== uuid);
    for (const voter of voters) core.submitTribunalVote(voter, s.id, s.dayIndex, 'GUILTY');
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
    assert.equal(s.players.get(uuid).alive, false, '처형 안 됨 (준비 잘못)');
    assert.equal(s.phase, 'NIGHT', '처형 뒤 밤이 아님 (준비 잘못)');
}

// 밤 한 번: 준 행동을 내고 나머지 산 사람은 건너뛰기 → 판정·확정
// 돌려줌: 방송 값(단계·날짜·희생자) + 확정 답(승패)
function runNight(s, actions = []) {
    for (const [actor, target] of actions) {
        const reply = core.submitNightAction(actor, s.id, target);
        assert.equal(reply.ok, true, `밤 행동 거절(${reply.code}) (준비 잘못)`);
    }
    gf.skipAllNight(s);
    const prepared = core.prepareNightResolution(aliveUuids(s)[0], s.id);
    assert.equal(prepared.ok, true, `밤 판정 준비 거절(${prepared.code})`);
    const committed = core.commitNightResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true, `밤 확정 거절(${committed.code})`);
    const view = core.buildNightResultAppliedPayload(s, committed.victimUuid, prepared.resolution.publicDeathReveals, {
        doctorSaved: prepared.resolution.doctorSaved,
    });
    return { view, terminal: committed.terminal };
}

// 밤 전 산 사람 수가 값대로인지 (준비 확인)
function assertBeforeNight(s, jokers, others) {
    const alive = [...s.players.values()].filter((p) => p.alive);
    assert.equal(alive.filter((p) => p.role === 'JOKER').length, jokers, '밤 전 산 광대 수가 다름 (준비 잘못)');
    assert.equal(alive.filter((p) => p.role !== 'JOKER').length, others, '밤 전 산 나머지 수가 다름 (준비 잘못)');
}

// 값마다 판 만들기: 밤 전 산 광대·나머지 수를 맞춘 뒤 그 밤 행동 목록을 돌려줌
const WIN_CASES = [
    {
        no: 'A05-B-084', label: '1·2·암살', win: true,
        build(t) {
            const s = open(t, 5);
            const [c1, c2, c3] = gf.byRole(s, 'CITIZEN');
            const joker = gf.firstOf(s, 'JOKER');
            executeDay(s, c1);
            runNight(s, [[joker, c2]]);
            passDay(s);
            assertBeforeNight(s, 1, 2);
            return { s, actions: [[joker, c3]] };
        },
    },
    {
        no: 'A05-B-085', label: '1·3·암살', win: false,
        build(t) {
            const s = open(t, 5);
            const [c1, c2] = gf.byRole(s, 'CITIZEN');
            executeDay(s, c1);
            assertBeforeNight(s, 1, 3);
            return { s, actions: [[gf.firstOf(s, 'JOKER'), c2]] };
        },
    },
    {
        no: 'A05-B-086', label: '2·3·암살(같아도 광대 승)', win: true,
        build(t) {
            const s = open(t, 5, { jokerCount: 2 });
            passDay(s);
            assertBeforeNight(s, 2, 3);
            const [jA, jB] = gf.byRole(s, 'JOKER');
            const [c1] = gf.byRole(s, 'CITIZEN');
            return { s, actions: [[jA, c1], [jB, c1]] };
        },
    },
    {
        no: 'A05-B-087', label: '2·4·암살', win: false,
        build(t) {
            const s = open(t, 6, { jokerCount: 2 });
            passDay(s);
            assertBeforeNight(s, 2, 4);
            const [jA, jB] = gf.byRole(s, 'JOKER');
            const [c1] = gf.byRole(s, 'CITIZEN');
            return { s, actions: [[jA, c1], [jB, c1]] };
        },
    },
    {
        no: 'A05-B-088', label: '1·2·의사가 막음', win: false,
        build(t) {
            const s = open(t, 6);
            const [c1, c2, c3, c4] = gf.byRole(s, 'CITIZEN');
            const joker = gf.firstOf(s, 'JOKER');
            executeDay(s, c1);
            runNight(s, [[joker, c2]]);
            executeDay(s, c3);
            assertBeforeNight(s, 1, 2);
            return { s, actions: [[joker, c4], [gf.firstOf(s, 'DOCTOR'), c4]] };
        },
    },
    {
        no: 'A05-B-089', label: '2·3·의사가 막음', win: false,
        build(t) {
            const s = open(t, 6, { jokerCount: 2 });
            const [c1, c2] = gf.byRole(s, 'CITIZEN');
            executeDay(s, c1);
            assertBeforeNight(s, 2, 3);
            const [jA, jB] = gf.byRole(s, 'JOKER');
            return { s, actions: [[jA, c2], [jB, c2], [gf.firstOf(s, 'DOCTOR'), c2]] };
        },
    },
    {
        no: 'A05-B-090', label: '1·2·광대 건너뜀', win: false,
        build(t) {
            const s = open(t, 5);
            const [c1, c2] = gf.byRole(s, 'CITIZEN');
            const joker = gf.firstOf(s, 'JOKER');
            executeDay(s, c1);
            runNight(s, [[joker, c2]]);
            passDay(s);
            assertBeforeNight(s, 1, 2);
            return { s, actions: [[joker, null]] };
        },
    },
    {
        no: 'A05-B-091', label: '2·5·암살', win: false,
        build(t) {
            const s = open(t, 7, { jokerCount: 2 });
            passDay(s);
            assertBeforeNight(s, 2, 5);
            const [jA, jB] = gf.byRole(s, 'JOKER');
            const [c1] = gf.byRole(s, 'CITIZEN');
            return { s, actions: [[jA, c1], [jB, c1]] };
        },
    },
];
for (const { no, label, win, build } of WIN_CASES) {
    test(`${no} 밤 암살 뒤 승패 (산 광대·밤 전 산 나머지·밤 일 = ${label}) → ${win ? '광대 승' : '계속'}`, (t) => {
        const { s, actions } = build(t);
        const { view, terminal } = runNight(s, actions);
        if (win) {
            assert.deepEqual(terminal, { winner: 'JOKER' });
            assert.equal(view.phase, 'ENDED');
        } else {
            assert.equal(terminal, null);
            assert.equal(view.phase, 'DAY');
        }
    });
}

test('A05-B-092 6명: 승패 안 나면 다음 낮, 날짜 1 → 2', (t) => {
    const s = open(t, 6);
    passDay(s);
    assert.equal(s.dayIndex, 1, '첫 밤 날짜가 1이 아님 (준비 잘못)');
    const [a] = gf.byRole(s, 'CITIZEN');
    const { view } = runNight(s, [[gf.firstOf(s, 'JOKER'), a]]);
    assert.equal(view.phase, 'DAY');
    assert.equal(view.dayIndex, 2);
});

test('A05-B-093 5명 광대2: 첫 밤 암살로 승패 남 → 단계 끝, 승자 광대 (낮으로 안 감)', (t) => {
    const s = open(t, 5, { jokerCount: 2 });
    passDay(s);
    const [jA, jB] = gf.byRole(s, 'JOKER');
    const [c1] = gf.byRole(s, 'CITIZEN');
    const { view, terminal } = runNight(s, [[jA, c1], [jB, c1]]);
    assert.equal(view.phase, 'ENDED');
    assert.deepEqual(terminal, { winner: 'JOKER' });
});

test('A05-B-094 6명 광대1: 의사 차례 중 광대가 나가 시민 승 → 밤 확정 거절, 노린 사람 삶', (t) => {
    const s = open(t, 6);
    passDay(s);
    const joker = gf.firstOf(s, 'JOKER');
    const [a] = gf.byRole(s, 'CITIZEN');
    assert.equal(core.submitNightAction(joker, s.id, a).ok, true);
    const departed = core.commitParticipantDeparture(s, joker, { reason: 'PLAYER_LEFT' });
    assert.deepEqual(departed.terminal, { winner: 'CITIZEN' }, '광대가 나가도 시민 승이 아님 (준비 잘못)');
    const doctor = aliveOf(s, 'DOCTOR')[0];
    assert.equal(core.prepareNightResolution(doctor, s.id).ok, false);
    assert.equal(s.players.get(a).alive, true);
});
