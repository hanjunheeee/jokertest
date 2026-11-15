'use strict';

// 밤 시험(판 규칙) — 의사가 광대 대상을 지켰을 때·딴 사람 지켰을 때·광대 동률, 자동 구성 첫 밤 암살 하나
// 목록 시험목록/A05a-밤-차례-능력.md A05-B-065~075, 돌리기: node --test tests/game-core/a05a-doctor-save.test.js
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
    return gf.startGame({ id: `a05a-ds-${seq}`, n, ...opts });
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

// 밤 한 번: 준 행동을 내고 나머지 산 사람은 건너뛰기 → 판정·확정
// 돌려줌: 방송 값(희생자·사망 공개·의사가 살렸나·생존) + 개인 결과(받는 사람 uuid → 결과)
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
    return { view, results: prepared.resolution.privateResults };
}

// 6명 자동(광대1·의사1·시민4) 첫 밤
function sixAtNight(t) {
    const s = open(t, 6);
    passDay(s);
    const [citizenA, citizenB] = gf.byRole(s, 'CITIZEN');
    return { s, joker: gf.firstOf(s, 'JOKER'), doctor: gf.firstOf(s, 'DOCTOR'), citizenA, citizenB };
}

test('A05-B-065 6명: 의사가 광대 대상을 지킴 → 희생자 없음, doctorSaved 참, 광대에게 암살 실패', (t) => {
    const g = sixAtNight(t);
    const { view, results } = runNight(g.s, [[g.joker, g.citizenA], [g.doctor, g.citizenA]]);
    assert.equal(view.victimUuid, null);
    assert.deepEqual(view.deathReveals, []);
    assert.equal(view.doctorSaved, true);
    assert.deepEqual(results.get(g.joker), { actionType: 'ASSASSINATE', success: false });
});

test('A05-B-066 6명: 의사가 딴 사람을 지킴 → A 죽음, doctorSaved 거짓, 광대 개인 결과 없음', (t) => {
    const g = sixAtNight(t);
    const { view, results } = runNight(g.s, [[g.joker, g.citizenA], [g.doctor, g.citizenB]]);
    assert.equal(view.victimUuid, g.citizenA);
    assert.equal(view.doctorSaved, false);
    assert.equal(results.has(g.joker), false);
});

test('A05-B-067 6명: 광대 건너뛰고 의사가 지킴 → 희생자 없음, doctorSaved 거짓, 개인 결과 0개', (t) => {
    const g = sixAtNight(t);
    const { view, results } = runNight(g.s, [[g.joker, null], [g.doctor, g.citizenA]]);
    assert.equal(view.victimUuid, null);
    assert.equal(view.doctorSaved, false);
    assert.equal(results.size, 0);
});

test('A05-B-068 7명 광대2: 광대 A→X·B→Y 동률, 의사가 X 지킴 → 희생자 없음, doctorSaved 거짓', (t) => {
    const s = open(t, 7, { jokerCount: 2 });
    passDay(s);
    const [jokerA, jokerB] = gf.byRole(s, 'JOKER');
    const [x, y] = gf.byRole(s, 'CITIZEN');
    const { view } = runNight(s, [[jokerA, x], [jokerB, y], [gf.firstOf(s, 'DOCTOR'), x]]);
    assert.equal(view.victimUuid, null);
    assert.equal(view.doctorSaved, false);
});

test('A05-B-069 6명: 의사는 살려도 개인 결과 없음', (t) => {
    const g = sixAtNight(t);
    const { results } = runNight(g.s, [[g.joker, g.citizenA], [g.doctor, g.citizenA]]);
    assert.equal(results.has(g.doctor), false);
});

// 자동 구성 첫 밤: 광대 → 시민 A, 다른 직업 건너뜀 → 희생자 A 하나, 죽은 이유 암살
const AUTO_SIZES = [
    ['A05-B-070', 5], ['A05-B-071', 6], ['A05-B-072', 7], ['A05-B-073', 8], ['A05-B-074', 9], ['A05-B-075', 10],
];
for (const [no, n] of AUTO_SIZES) {
    test(`${no} 자동 구성 ${n}명 첫 밤: 광대 → 시민 A, 나머지 건너뜀 → 희생자 A 하나·죽은 이유 암살`, (t) => {
        const s = open(t, n);
        passDay(s);
        const [citizen] = gf.byRole(s, 'CITIZEN');
        const { view } = runNight(s, [[gf.firstOf(s, 'JOKER'), citizen]]);
        assert.equal(view.victimUuid, citizen);
        assert.deepEqual(view.deathReveals, [{ victimUuid: citizen, source: 'JOKER' }]);
        assert.deepEqual(view.players.filter((p) => !p.alive).map((p) => p.uuid), [citizen]);
        // 판 기록에 남을 죽은 이유 (판 끝 저장에 쓰는 같은 기록 만들기)
        const row = core.buildGameResultRecord(s, { completed: false }).players.find((p) => p.user_id === citizen);
        assert.equal(row.death_reason, 'ASSASSINATION');
    });
}
