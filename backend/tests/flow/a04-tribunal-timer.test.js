'use strict';

// 재판 마감 경계·직업별 투표 흐름 시험: 15초·120초 마감 경계, 광대·의사·경비원·마녀사냥꾼 표도 셈 (가짜 소켓·가짜 시계)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-194~200
const test = require('node:test');
const assert = require('node:assert/strict');

const W = require('./a04-world');

const { gf } = W;

// 첫 낮까지 차린 판 + 재판 진입 (피고 고르는 함수 받음, 없으면 첫 시민)
async function openWorld(t, spec, pickDefendant = (s) => gf.nonJokers(s)[0]) {
    const w = W.toFirstDay(W.setupWorld(t, spec));
    const defendant = pickDefendant(w.session);
    await W.openTribunal(w, defendant);
    return { w, defendant };
}

// 마감 경계: 직전엔 판정 없음 / 그 시각에 판정
[
    { no: 194, n: 5, seconds: 15, before: 14_900, label: '14.9초 → 판정 없음' },
    { no: 195, n: 5, seconds: 15, before: null, label: '15초 → 판정' },
    { no: 196, n: 10, seconds: 120, before: 119_900, label: '119.9초 → 판정 없음' },
    { no: 197, n: 10, seconds: 120, before: null, label: '120초 → 판정' },
].forEach(({ no, n, seconds, before, label }) => {
    test(`A04-B-${no} ${n}명 판 재판 ${seconds}초 마감 경계: 가짜 시계 ${label}`, async (t) => {
        const { w } = await openWorld(t, { id: `a04m${no}`, n, settings: { tribunalTime: seconds } });
        const watcher = w.uuids[0];
        if (before !== null) {
            w.tick(before);
            assert.equal(W.countFor(w, watcher, 'tribunal_vote_resolved'), 0);
            return;
        }
        w.tick(seconds * 1000);
        assert.equal(W.countFor(w, watcher, 'tribunal_vote_resolved'), 1);
    });
});

test('A04-B-198 8명 판 광대 2명 표가 결과 counts에 들어감', async (t) => {
    const { w } = await openWorld(t, { id: 'a04m198', n: 8, roleCounts: { JOKER: 2 }, settings: { tribunalTime: 30 } });
    for (const joker of gf.byRole(w.session, 'JOKER')) assert.equal((await W.cast(w, joker, 'GUILTY')).ok, true);
    w.tick(30_000);
    assert.deepEqual(W.lastResolved(w, w.uuids[0]).counts, { guilty: 2, notGuilty: 0 });
});

test('A04-B-199 10명 판 의사·경비원·마녀사냥꾼 표가 다 들어가 다 찬 셈에 포함', async (t) => {
    const { w } = await openWorld(t, {
        id: 'a04m199', n: 10, roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, settings: { tribunalTime: 120 },
    }, (s) => gf.byRole(s, 'CITIZEN')[0]);
    const special = ['DOCTOR', 'GUARD', 'WITCH_HUNTER'].map((role) => gf.firstOf(w.session, role));
    const others = W.tribunalVoters(w).filter((u) => !special.includes(u));
    for (const uuid of others) assert.equal((await W.cast(w, uuid, 'NOT_GUILTY')).ok, true);
    // 세 직업이 안 냈으면 다 찬 것 아님
    assert.equal(W.tribunalSettles(w, w.uuids[0]).length, 0);
    for (const uuid of special) assert.equal((await W.cast(w, uuid, 'NOT_GUILTY')).ok, true);
    assert.equal(W.tribunalSettles(w, w.uuids[0]).length, 1);
    w.tick(5_000);
    assert.deepEqual(W.lastResolved(w, w.uuids[0]).counts, { guilty: 0, notGuilty: 9 });
});

test('A04-B-200 8명 판 광대가 피고일 때 동료 광대가 무죄 → 무죄 1로 셈', async (t) => {
    const { w, defendant } = await openWorld(t, {
        id: 'a04m200', n: 8, roleCounts: { JOKER: 2 }, settings: { tribunalTime: 30 },
    }, (s) => gf.firstOf(s, 'JOKER'));
    const mate = gf.byRole(w.session, 'JOKER').find((u) => u !== defendant);
    assert.equal((await W.cast(w, mate, 'NOT_GUILTY')).ok, true);
    w.tick(30_000);
    assert.deepEqual(W.lastResolved(w, w.uuids[0]).counts, { guilty: 0, notGuilty: 1 });
});
