'use strict';

// 밤 시험(판 규칙) — 같은 사람 연달아 고르기: 의사·경비원·마녀사냥꾼 막는 규칙 없음, 광대도 어제 산 사람 다시 노림
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-076~080, 돌리기: node --test tests/game-core/a05a-repeat-pick.test.js
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
    return gf.startGame({ id: `a05a-rp-${seq}`, n, ...opts });
}

const aliveUuids = (s) => [...s.players.values()].filter((p) => p.alive).map((p) => p.uuid);

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
}

// 밤 한 번: 준 행동을 내고(받음 확인) 나머지 산 사람은 건너뛰기 → 판정·확정
// 돌려줌: 방송 값(누가 살았나) + 개인 결과(받는 사람 uuid → 결과)
function runNight(s, actions = []) {
    for (const [actor, target] of actions) {
        const reply = core.submitNightAction(actor, s.id, target);
        assert.equal(reply.ok, true, `${s.dayIndex}번째 밤 행동 거절(${reply.code})`);
    }
    gf.skipAllNight(s);
    const prepared = core.prepareNightResolution(aliveUuids(s)[0], s.id);
    assert.equal(prepared.ok, true, `밤 판정 준비 거절(${prepared.code})`);
    const committed = core.commitNightResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true, `밤 확정 거절(${committed.code})`);
    const view = core.buildNightResultAppliedPayload(s, committed.victimUuid, prepared.resolution.publicDeathReveals);
    return { view, results: prepared.resolution.privateResults };
}

const isAlive = (view, uuid) => view.players.find((p) => p.uuid === uuid).alive;

test('A05-B-076 7명: 의사가 같은 사람 A를 두 밤 연달아 지킴, 둘째 밤 광대 → A → A 삶', (t) => {
    const s = open(t, 7);
    const joker = gf.firstOf(s, 'JOKER');
    const doctor = gf.firstOf(s, 'DOCTOR');
    const [a] = gf.byRole(s, 'CITIZEN');
    passDay(s);
    runNight(s, [[doctor, a]]);
    passDay(s);
    const { view } = runNight(s, [[joker, a], [doctor, a]]);
    assert.equal(isAlive(view, a), true);
});

test('A05-B-077 8명: 의사 자기 보호 세 밤 연달아 받음, 셋째 밤 광대 → 의사 → 삶', (t) => {
    const s = open(t, 8);
    const joker = gf.firstOf(s, 'JOKER');
    const doctor = gf.firstOf(s, 'DOCTOR');
    passDay(s);
    runNight(s, [[doctor, doctor]]);
    passDay(s);
    runNight(s, [[doctor, doctor]]);
    passDay(s);
    const { view } = runNight(s, [[joker, doctor], [doctor, doctor]]);
    assert.equal(isAlive(view, doctor), true);
});

test('A05-B-078 8명: 경비원이 같은 사람 A를 두 밤 연달아 조사 → 두 밤 다 결과', (t) => {
    const s = open(t, 8);
    const guard = gf.firstOf(s, 'GUARD');
    const [a] = gf.byRole(s, 'CITIZEN');
    passDay(s);
    const first = runNight(s, [[guard, a]]);
    passDay(s);
    const second = runNight(s, [[guard, a]]);
    for (const night of [first, second]) {
        assert.deepEqual(night.results.get(guard), { actionType: 'INVESTIGATE', targetId: a, role: 'CITIZEN' });
    }
});

test('A05-B-079 10명: 마녀사냥꾼이 같은 죽은 사람을 둘째·셋째 밤 연달아 확인 → 두 밤 다 결과', (t) => {
    const s = open(t, 10);
    const hunter = gf.firstOf(s, 'WITCH_HUNTER');
    const [dead] = gf.byRole(s, 'CITIZEN');
    executeDay(s, dead);
    runNight(s);
    passDay(s);
    const second = runNight(s, [[hunter, dead]]);
    passDay(s);
    const third = runNight(s, [[hunter, dead]]);
    for (const night of [second, third]) {
        assert.deepEqual(night.results.get(hunter), { actionType: 'CONFIRM', targetId: dead, role: 'CITIZEN' });
    }
});

test('A05-B-080 7명: 광대가 어젯밤 살아난 A를 다시 노림, 둘째 밤 의사는 B → A 죽음', (t) => {
    const s = open(t, 7);
    const joker = gf.firstOf(s, 'JOKER');
    const doctor = gf.firstOf(s, 'DOCTOR');
    const [a, b] = gf.byRole(s, 'CITIZEN');
    passDay(s);
    const first = runNight(s, [[joker, a], [doctor, a]]);
    assert.equal(isAlive(first.view, a), true, '첫 밤에 A가 안 살아남 (준비 잘못)');
    passDay(s);
    const { view } = runNight(s, [[joker, a], [doctor, b]]);
    assert.equal(view.victimUuid, a);
    assert.equal(isAlive(view, a), false);
});
