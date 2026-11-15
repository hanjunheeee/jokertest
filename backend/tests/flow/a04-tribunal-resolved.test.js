'use strict';

// 재판 결과 알림 흐름 시험: 결과 칸·직업 안 샘·밤 차례보다 먼저·판 끝·한 번만·취소 뒤 밤·결과 화면 180초 (가짜 소켓·가짜 시계)
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-B-154~165, 225~228, 230
const test = require('node:test');
const assert = require('node:assert/strict');

const W = require('./a04-world');
const { assertNoForbiddenPrivateData, collectOtherPlayerRoleSecrets } = require('../helpers/gameSession.testUtils');

const { gf } = W;

// 첫 낮까지 차린 판 + 재판 진입 (피고 고르는 함수 받음, 없으면 첫 시민)
async function openWorld(t, spec, pickDefendant = (s) => gf.nonJokers(s)[0]) {
    const w = W.toFirstDay(W.setupWorld(t, spec));
    const defendant = pickDefendant(w.session);
    await W.openTribunal(w, defendant);
    return { w, defendant };
}

// 투표할 사람 전원 같은 표 → 5초 뒤 판정
async function castAllAndSettle(w, vote) {
    for (const uuid of W.tribunalVoters(w)) assert.equal((await W.cast(w, uuid, vote)).ok, true);
    w.tick(5_000);
}

// 154~157: 결과 알림 칸 (7명 판)
test('A04-B-154 7명 판 유죄 → executedUuid = 피고, phase NIGHT', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04o154', n: 7, settings: { tribunalTime: 60 } });
    await castAllAndSettle(w, 'GUILTY');
    const resolved = W.lastResolved(w, gf.firstOf(w.session, 'JOKER'));
    assert.equal(resolved.executedUuid, defendant);
    assert.equal(resolved.phase, 'NIGHT');
});

test('A04-B-155 7명 판 무죄 → executedUuid null', async (t) => {
    const { w } = await openWorld(t, { id: 'a04o155', n: 7, settings: { tribunalTime: 60 } });
    await castAllAndSettle(w, 'NOT_GUILTY');
    const resolved = W.lastResolved(w, gf.firstOf(w.session, 'JOKER'));
    assert.equal(resolved.outcome, 'NOT_GUILTY');
    assert.equal(resolved.executedUuid, null);
});

test('A04-B-156 7명 판 피고 나감 → outcome CANCELLED·reason DEFENDANT_LEFT', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04o156', n: 7, settings: { tribunalTime: 60 } });
    assert.equal((await W.leave(w, defendant)).ok, true);
    const resolved = W.lastResolved(w, gf.firstOf(w.session, 'JOKER'));
    assert.equal(resolved.outcome, 'CANCELLED');
    assert.equal(resolved.reason, 'DEFENDANT_LEFT');
});

test('A04-B-157 7명 판 승부 남(광대 처형) → 판 끝 칸·phase ENDED', async (t) => {
    const { w } = await openWorld(t, { id: 'a04o157', n: 7, settings: { tribunalTime: 60 } }, (s) => gf.firstOf(s, 'JOKER'));
    await castAllAndSettle(w, 'GUILTY');
    const resolved = W.lastResolved(w, gf.nonJokers(w.session)[0]);
    assert.equal(resolved.phase, 'ENDED');
    assert.equal(resolved.winResult?.winner, 'CITIZEN');
});

// 마감 당김 알림의 role 칸은 낮·재판이면 늘 null (밤 차례 이름 자리) → 빈 칸은 샘이 아님
// 공용 검사(assertNoForbiddenPrivateData)는 값과 상관없이 role 이름만 봐서, 값이 null일 때만 빼고 넘김
function withoutEmptyRole(payload) {
    if (!payload || typeof payload !== 'object' || !Object.hasOwn(payload, 'role')) return payload;
    assert.equal(payload.role, null, '재판 알림에 직업 값이 실림');
    const rest = { ...payload };
    delete rest.role;
    return rest;
}

// 158~161: 재판 동안 받은 알림·답에 남의 직업이 안 샘 (재판 결과 알림의 executedRole은 결정 대기라 뺌)
[5, 7, 8, 10].forEach((n, i) => {
    test(`A04-B-${158 + i} ${n}명 판 재판 진입·표 답·내 진행·마감 당김 알림에 남의 직업 없음`, async (t) => {
        const { w } = await openWorld(t, { id: `a04k${n}`, n, settings: { tribunalTime: 60 } });
        const replies = new Map();
        for (const uuid of W.tribunalVoters(w)) {
            const reply = await W.cast(w, uuid, 'GUILTY');
            assert.equal(reply.ok, true);
            replies.set(uuid, reply);
        }
        for (const uuid of w.uuids) {
            const seen = w.sock(uuid).received.filter((e) =>
                (e.event === 'day_vote_resolved' && e.payload.outcome === 'TRIBUNAL')
                || (e.event === 'session_self_progress' && e.payload.phase === 'TRIBUNAL')
                || (e.event === 'phase_settle_started' && e.payload.phase === 'TRIBUNAL'));
            assert.ok(seen.length >= 2, `${uuid}가 받은 재판 알림이 너무 적음`);
            const secrets = collectOtherPlayerRoleSecrets(w.session, uuid);
            for (const e of seen) assertNoForbiddenPrivateData(withoutEmptyRole(e.payload), secrets);
            if (replies.has(uuid)) assertNoForbiddenPrivateData(replies.get(uuid), secrets);
        }
    });
});

// 162~163: 결과 알림이 밤 차례 알림보다 먼저
[
    { n: 6, vote: 'NOT_GUILTY', label: '무죄' },
    { n: 8, vote: 'GUILTY', label: '유죄·승부 없음' },
].forEach(({ n, vote, label }, i) => {
    test(`A04-B-${162 + i} ${n}명 판 ${label} → tribunal_vote_resolved 다음에 night_turn_started`, async (t) => {
        const { w } = await openWorld(t, { id: `a04n${n}`, n, settings: { tribunalTime: 60 } });
        await castAllAndSettle(w, vote);
        const names = W.eventNames(w, gf.firstOf(w.session, 'JOKER'));
        const resolvedAt = names.indexOf('tribunal_vote_resolved');
        const nightAt = names.indexOf('night_turn_started');
        assert.ok(resolvedAt >= 0, '재판 결과 알림 없음');
        assert.ok(nightAt > resolvedAt, `순서: ${names.join(',')}`);
    });
});

test('A04-B-164 5명 판 마지막 광대 처형 → 결과 알림에 판 끝 칸, night_turn_started 0번', async (t) => {
    const { w } = await openWorld(t, { id: 'a04o164', n: 5, settings: { tribunalTime: 60 } }, (s) => gf.firstOf(s, 'JOKER'));
    await castAllAndSettle(w, 'GUILTY');
    w.tick(60_000);
    for (const uuid of gf.nonJokers(w.session)) {
        assert.equal(W.lastResolved(w, uuid).winResult?.winner, 'CITIZEN');
        assert.equal(W.countFor(w, uuid, 'night_turn_started'), 0);
    }
});

test('A04-B-165 7명 판 5초 판정 뒤 원래 마감 시각이 와도 두 번째 tribunal_vote_resolved 없음', async (t) => {
    const { w } = await openWorld(t, { id: 'a04o165', n: 7, settings: { tribunalTime: 120 } });
    await castAllAndSettle(w, 'NOT_GUILTY');
    const watcher = gf.firstOf(w.session, 'JOKER');
    assert.equal(W.countFor(w, watcher, 'tribunal_vote_resolved'), 1);
    w.tick(120_000);
    assert.equal(W.countFor(w, watcher, 'tribunal_vote_resolved'), 1);
});

test('A04-B-225 7명 판 피고 나감 취소 → night_turn_started 옴', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04o225', n: 7, settings: { tribunalTime: 60 } });
    assert.equal((await W.leave(w, defendant)).ok, true);
    const names = W.eventNames(w, gf.firstOf(w.session, 'JOKER'));
    assert.ok(names.includes('night_turn_started'), `받은 알림: ${names.join(',')}`);
    assert.ok(names.indexOf('night_turn_started') > names.indexOf('tribunal_vote_resolved'));
});

test('A04-B-226 6명 판 피고 나감 → 판 전원 player_eliminated와 tribunal_vote_resolved CANCELLED 둘 다', async (t) => {
    const { w, defendant } = await openWorld(t, { id: 'a04o226', n: 6, settings: { tribunalTime: 60 } });
    assert.equal((await W.leave(w, defendant)).ok, true);
    for (const uuid of w.uuids.filter((u) => u !== defendant)) {
        const eliminated = w.received(uuid, 'player_eliminated');
        assert.equal(eliminated.length, 1, `${uuid} 탈락 알림 수`);
        assert.equal(W.lastResolved(w, uuid)?.outcome, 'CANCELLED', `${uuid} 취소 알림`);
    }
});

test('A04-B-227 5명 판 마지막 광대 처형 → 판 끝 알림의 결과 닫힘 시각 = 판 끝 + 180초', async (t) => {
    const { w } = await openWorld(t, { id: 'a04o227', n: 5, settings: { tribunalTime: 60 } }, (s) => gf.firstOf(s, 'JOKER'));
    await castAllAndSettle(w, 'GUILTY');
    // 5초 판정 순간 = 판 끝 시각 (시계를 판정 시각에 딱 맞춰 넘김)
    const endedAt = Date.now();
    const resolved = W.lastResolved(w, gf.nonJokers(w.session)[0]);
    assert.equal(resolved.phase, 'ENDED');
    assert.equal(resolved.resultClosesAt, endedAt + 180_000);
});

test('A04-B-228 5명 판 광대 2, 시민 처형 → 판 끝 칸 승자 광대', async (t) => {
    const { w } = await openWorld(t, { id: 'a04o228', n: 5, roleCounts: { JOKER: 2 }, settings: { tribunalTime: 60 } });
    await castAllAndSettle(w, 'GUILTY');
    const resolved = W.lastResolved(w, gf.firstOf(w.session, 'JOKER'));
    assert.equal(resolved.phase, 'ENDED');
    assert.equal(resolved.winResult?.winner, 'JOKER');
});

test('A04-B-230 8명 판 1일 무죄 → 밤 끝 → dayIndex 2 낮', async (t) => {
    const { w } = await openWorld(t, { id: 'a04o230', n: 8, settings: { tribunalTime: 60 } });
    await castAllAndSettle(w, 'NOT_GUILTY');
    assert.equal(W.lastResolved(w, w.uuids[0]).dayIndex, 1);
    W.nightToDay(w);
    const snap = await W.snapshot(w, w.uuids[0]);
    assert.equal(snap.phase, 'DAY');
    assert.equal(snap.dayIndex, 2);
});
