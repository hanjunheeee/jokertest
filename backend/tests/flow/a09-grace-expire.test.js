'use strict';

// 끊김 60초 탈락 흐름 시험 — 탈락 방송 차례·직업 비공개·다시 못 들어옴·남은 사람 다 냄 5초·표·밤 행동 정리·승패·방장·여러 명·인원별·직업별 밤 차례
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-B-178~209, A09-B-317~328, 돌리기: node --env-file=.env.test --test tests/flow/a09-grace-expire.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a09-grace-harness');
const { assertNoForbiddenPrivateData } = require('../helpers/gameSession.testUtils');

const { desertion } = H;

// 단계 시간을 길게 (60초 탈락이 단계 마감과 겹치지 않게)
const LONG = { dayDiscussionTime: 120, dayVoteTime: 120, tribunalTime: 120, nightActionTime: 120 };

// 그 사람이 지금까지 받은 알림 수 (이 뒤에 온 것만 보려고)
const mark = (w, uuid) => (w.world.history.get(uuid) ?? []).flatMap((s) => s.received).length;
const since = (w, uuid, from) => (w.world.history.get(uuid) ?? []).flatMap((s) => s.received).slice(from);

// 그 사람이 탈락했다는 알림을 받은 사람 수
const eliminatedOf = (w, watcher, x) => w.got(watcher, 'player_eliminated').filter((p) => p.victimUuid === x).length;

// 끊고 60초 넘겨 탈락시킴 (끊긴 시각 돌려줌)
async function disconnectAndExpire(w, x) {
    const at = w.now();
    await w.disconnect(x);
    w.advanceTo(at + 60_000);
    return at;
}

test('A09-B-178 7명 판 60초 탈락 → 판 사람마다 player_eliminated → session_participation_changed → session_self_progress 차례', async (t) => {
    const w = H.setup(t, { id: 'a09ge178', n: 7, settings: LONG });
    w.toDay();
    const x = w.nonJokers()[0];
    const at = w.now();
    await w.disconnect(x);
    w.advanceTo(at + 59_999);
    const marks = Object.fromEntries(w.others(x).map((u) => [u, mark(w, u)]));
    w.advance(1);
    const ORDER = ['player_eliminated', 'session_participation_changed', 'session_self_progress'];
    for (const u of w.others(x)) {
        const names = since(w, u, marks[u]).map((e) => e.event).filter((n) => ORDER.includes(n));
        assert.deepEqual(names, ORDER, u);
    }
});

// A09-B-179~183 탈락한 사람 직업은 아무에게도 안 감 (승부 안 남) (값 5)
const ROLE_CASES = [
    ['A09-B-179', '광대', 8, { JOKER: 2 }, 'JOKER'],
    ['A09-B-180', '의사', 6, { JOKER: 1, DOCTOR: 1 }, 'DOCTOR'],
    ['A09-B-181', '경비원', 8, { JOKER: 1, GUARD: 1 }, 'GUARD'],
    ['A09-B-182', '마녀사냥꾼', 10, { JOKER: 2, WITCH_HUNTER: 1 }, 'WITCH_HUNTER'],
    ['A09-B-183', '시민', 5, { JOKER: 1 }, 'CITIZEN'],
];
for (const [no, label, n, roleCounts, role] of ROLE_CASES) {
    test(`${no} ${n}명 판 ${label} 60초 탈락(승부 안 남) → 판 전원이 그때 받은 값에 그 직업 없음`, async (t) => {
        const w = H.setup(t, { id: `a09ge${no.slice(-3)}`, n, roleCounts, settings: LONG });
        w.toDay();
        const x = w.byRole(role)[0];
        const at = w.now();
        await w.disconnect(x);
        w.advanceTo(at + 59_999);
        const marks = Object.fromEntries(w.others(x).map((u) => [u, mark(w, u)]));
        w.advance(1);
        assert.notEqual(w.session.phase, 'ENDED');
        for (const u of w.others(x)) {
            const got = since(w, u, marks[u]);
            assert.ok(got.some((e) => e.event === 'player_eliminated'), `${u} 탈락 알림 없음`);
            for (const e of got) {
                // 값이 null인 role 칸(마감 당김 알림)은 직업이 아니라 빼고 봄
                const payload = e.payload?.role === null ? { ...e.payload, role: undefined } : e.payload;
                if (payload?.role === undefined) delete payload?.role;
                // 내 칸(self)의 내 직업은 괜찮음, 남(탈락한 사람) 직업만 막음
                const secrets = w.roleOf(u) === role ? [] : [{ value: role, label: `role(${x})` }];
                assertNoForbiddenPrivateData(payload, secrets);
            }
        }
    });
}

test('A09-B-184 5명 판 61초에 스냅샷 → FORFEITED_FROM_SESSION, 글 "연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다."', async (t) => {
    const w = H.setup(t, { id: 'a09ge184', n: 5 });
    w.toDay();
    const x = w.nonJokers()[0];
    const at = w.now();
    await w.disconnect(x);
    w.advanceTo(at + 61_000);
    const snap = await w.reconnect(x);
    assert.equal(snap.code, 'FORFEITED_FROM_SESSION');
    assert.equal(snap.message, '연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다.');
});

test('A09-B-185 6명 판 탈락 뒤 새 소켓 붙음 → 그 뒤 판 방송 0개', async (t) => {
    const w = H.setup(t, { id: 'a09ge185', n: 6, settings: LONG });
    w.toDay();
    const x = w.nonJokers()[0];
    await disconnectAndExpire(w, x);
    const fresh = w.attachSocket(x);
    await H.gs.resyncSessionRouting(fresh, x, w.io);
    const watcher = w.firstOf('JOKER');
    const before = w.got(watcher, 'day_phase_changed').length;
    w.advanceUntil(() => w.got(watcher, 'day_phase_changed').length > before);
    assert.deepEqual(fresh.received.map((e) => e.event), []);
});

test('A09-B-186 8명 판 탈락한 사람의 낮 투표 → 거절, 표에 안 셈', async (t) => {
    const w = H.setup(t, { id: 'a09ge186', n: 8, settings: { dayVoteTime: 120 } });
    w.toVote();
    const x = w.nonJokers()[0];
    await disconnectAndExpire(w, x);
    w.attachSocket(x);
    const reply = await w.vote(x, null);
    assert.equal(reply.ok, false);
    await w.voteAll(() => null, { skip: [x] });
    const watcher = w.firstOf('JOKER');
    w.advanceUntil(() => w.got(watcher, 'day_vote_resolved').length > 0);
    assert.equal(w.got(watcher, 'day_vote_resolved').at(-1).publicVoteCount, 7);
});

test('A09-B-187 7명 판 6명 냄·끊긴 1명 안 냄 → 60초 탈락 → 마감 = 탈락 때 + 5초', async (t) => {
    const w = H.setup(t, { id: 'a09ge187', n: 7, settings: { dayVoteTime: 120 } });
    w.toVote();
    const x = w.nonJokers()[0];
    const at = w.now();
    await w.disconnect(x);
    await w.voteAll(() => null, { skip: [x] });
    const watcher = w.firstOf('JOKER');
    w.advanceTo(at + 60_000);
    assert.equal(w.got(watcher, 'phase_settle_started').filter((p) => p.phase === 'DAY').at(-1)?.deadline, at + 65_000);
    w.advanceTo(at + 64_999);
    assert.equal(w.got(watcher, 'day_vote_resolved').length, 0);
    w.advance(1);
    assert.equal(w.got(watcher, 'day_vote_resolved').length, 1);
});

test('A09-B-188 6명 판 토론 중 5명 준비·끊긴 1명 → 탈락 → day_phase_changed 투표', async (t) => {
    const w = H.setup(t, { id: 'a09ge188', n: 6, settings: LONG });
    w.toDay();
    const x = w.nonJokers()[0];
    const at = w.now();
    await w.disconnect(x);
    for (const u of w.others(x)) assert.equal((await w.ready(u)).ok, true);
    assert.equal(w.phase(), 'DAY_DISCUSSION');
    w.advanceTo(at + 60_000);
    const watcher = w.firstOf('JOKER');
    assert.equal(w.got(watcher, 'day_phase_changed').at(-1)?.dayPhase, 'DAY_VOTE');
});

test('A09-B-189 8명 판 A·B가 끊긴 C를 찍음 → C 탈락 → A·B 표 기권', async (t) => {
    const w = H.setup(t, { id: 'a09ge189', n: 8, settings: { dayVoteTime: 120 } });
    w.toVote();
    const [c, a, b] = w.nonJokers();
    const at = w.now();
    await w.disconnect(c);
    assert.equal((await w.vote(a, c)).ok, true);
    assert.equal((await w.vote(b, c)).ok, true);
    w.advanceTo(at + 60_000);
    for (const u of [a, b]) {
        const self = (await w.snapshot(u)).self;
        assert.equal(self.hasSubmittedDayVote, true);
        assert.equal(self.dayVoteTargetUuid, null, `${u} 표가 기권이 아님`);
    }
});

test('A09-B-190 7명 판 C 3표·기권 3·끊긴 C 안 냄 → C 탈락 → 기권 6 → 재판 없이 밤', async (t) => {
    const w = H.setup(t, { id: 'a09ge190', n: 7, settings: { dayVoteTime: 120 } });
    w.toVote();
    const [c, ...rest] = w.nonJokers();
    const others = [w.firstOf('JOKER'), ...rest];
    const at = w.now();
    await w.disconnect(c);
    for (const u of others.slice(0, 3)) assert.equal((await w.vote(u, c)).ok, true);
    for (const u of others.slice(3)) assert.equal((await w.vote(u, null)).ok, true);
    w.advanceTo(at + 60_000);
    const watcher = others[0];
    w.advanceUntil(() => w.got(watcher, 'day_vote_resolved').length > 0);
    const resolved = w.got(watcher, 'day_vote_resolved').at(-1);
    assert.equal(resolved.publicAbstainCount, 6);
    assert.equal(resolved.tribunalTargetUuid, null);
    assert.equal(w.session.phase, 'NIGHT');
});

test('A09-B-191 7명 판 의사가 A 보호 고르고 끊김 → 밤 안에 60초 탈락 → 광대 대상 A → 보호는 남아 A가 삶', async (t) => {
    const w = H.setup(t, { id: 'a09ge191', n: 7, roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1 }, settings: { nightActionTime: 120 } });
    w.toDay();
    await w.toNight();
    const a = w.byRole('CITIZEN')[0];
    assert.equal((await w.night(w.firstOf('JOKER'), a)).ok, true);
    await w.untilTurn('DOCTOR');
    const doctor = w.firstOf('DOCTOR');
    assert.equal((await w.night(doctor, a)).ok, true);
    const at = w.now();
    await w.disconnect(doctor);
    // 의사 차례가 닫히고 경비원 차례(120초) 안에서 의사 60초 탈락
    w.advanceTo(at + 60_000);
    assert.equal(w.session.phase, 'NIGHT');
    assert.equal(w.isAlive(doctor), false);
    await w.quickNight();
    // 탈락해도 이미 고른 보호는 적용 (사용자 결정 2026-11-16, "광대에게 지목된 의사의 선택은 적용"과 같은 생각)
    const applied = w.got(a, 'night_result_applied').at(-1);
    assert.ok(applied, '밤 결과 알림 없음');
    assert.equal(applied.victimUuid, null);
    assert.equal(w.isAlive(a), true);
});

// 암살을 고른 광대가 광대 차례가 열려 있는 동안 탈락해도 그 암살은 남음 (사용자 결정 2026-11-16 낮 6번, 전엔 [지금 동작] "지워짐"이던 줄)
test('A09-B-192 8명 판 광대 2, 끊긴 광대만 대상 고름 → 광대 차례 안에 60초 탈락 → 남은 광대는 안 고름 → 고른 대상이 죽음', async (t) => {
    const w = H.setup(t, { id: 'a09ge192', n: 8, roleCounts: { JOKER: 2 }, settings: { nightActionTime: 120 } });
    w.toDay();
    await w.toNight();
    const [j1, j2] = w.byRole('JOKER');
    const victim = w.byRole('CITIZEN')[0];
    assert.equal((await w.night(j1, victim)).ok, true);
    const at = w.now();
    await w.disconnect(j1);
    w.advanceTo(at + 60_000);
    assert.equal(w.isAlive(j1), false);
    assert.equal(H.core.getCurrentNightTurnRole(w.session), 'JOKER', '광대 차례가 벌써 닫힘 (준비 잘못)');
    // 남은 광대는 안 고른 채 차례 마감
    w.advanceUntil(() => w.session.phase !== 'NIGHT');
    assert.equal(w.got(j2, 'night_result_applied').at(-1)?.victimUuid, victim);
    assert.equal(w.isAlive(victim), false);
});

// A09-B-193~198 탈락 직후 승패 (값 6)
const aliveCitizens = (w) => w.alive().filter((u) => w.roleOf(u) !== 'JOKER');
const WIN_CASES = [
    ['A09-B-193', '5명 판 광대 1 탈락', 5, { JOKER: 1 }, 0, (w) => w.firstOf('JOKER'), 'CITIZEN'],
    ['A09-B-194', '6명 판 광대 2·나머지 3에서 시민 탈락', 6, { JOKER: 2 }, 1, (w) => aliveCitizens(w)[0], 'JOKER'],
    ['A09-B-195', '7명 판 시민 탈락', 7, { JOKER: 1 }, 0, (w) => aliveCitizens(w)[0], null],
    ['A09-B-196', '8명 판 광대 2 중 1 탈락', 8, { JOKER: 2 }, 0, (w) => w.firstOf('JOKER'), null],
    ['A09-B-197', '10명 판 산 광대 2·나머지 3에서 시민 탈락', 10, { JOKER: 2 }, 5, (w) => aliveCitizens(w)[0], 'JOKER'],
    ['A09-B-198', '6명 판 광대 1·시민 2 남음에서 시민 탈락', 6, { JOKER: 1 }, 3, (w) => aliveCitizens(w)[0], 'JOKER'],
];
for (const [no, label, n, roleCounts, deaths, pick, winner] of WIN_CASES) {
    test(`${no} ${label} → ${winner ? `${winner} 승, 단계 ENDED` : '판 계속'}`, async (t) => {
        const w = H.setup(t, { id: `a09ge${no.slice(-3)}`, n, roleCounts, settings: LONG });
        w.toDay();
        // 밤마다 광대가 시민 하나씩 죽임 (뒤쪽 시민부터)
        for (let i = 0; i < deaths; i += 1) {
            const victim = aliveCitizens(w).at(-1);
            await w.quickDay(Object.fromEntries(w.aliveOf('JOKER').map((j) => [j, victim])));
            assert.equal(w.isAlive(victim), false);
        }
        const x = pick(w);
        await disconnectAndExpire(w, x);
        const watcher = w.alive().find((u) => u !== x);
        const eliminated = w.got(watcher, 'player_eliminated').filter((p) => p.victimUuid === x);
        assert.equal(eliminated.length, 1);
        if (winner) {
            assert.equal(eliminated[0].winResult?.winner, winner);
            assert.equal(w.session.phase, 'ENDED');
        } else {
            assert.equal(eliminated[0].winResult, undefined);
            assert.notEqual(w.session.phase, 'ENDED');
        }
    });
}

test('A09-B-199 5명 판 광대 탈락으로 승부 → player_eliminated에 승패 칸 + 전원 직업 (탈락한 광대 직업도)', async (t) => {
    const w = H.setup(t, { id: 'a09ge199', n: 5, settings: LONG });
    w.toDay();
    const joker = w.firstOf('JOKER');
    await disconnectAndExpire(w, joker);
    const watcher = w.nonJokers()[0];
    const payload = w.got(watcher, 'player_eliminated').at(-1);
    assert.equal(payload.winResult?.winner, 'CITIZEN');
    const reveals = Object.fromEntries(payload.winResult.reveals.map((r) => [r.uuid, r.role]));
    for (const u of w.ids) assert.equal(reveals[u], w.roleOf(u), `${u} 직업`);
});

test('A09-B-200 8명 판 끊긴 지 30초에 승부 → 60초 지나도 그 사람 탈락 없음, 탈주 막힘 없음', async (t) => {
    const w = H.setup(t, { id: 'a09ge200', n: 8, settings: LONG });
    w.toDay();
    const x = w.nonJokers()[0];
    const at = w.now();
    await w.disconnect(x);
    w.advanceTo(at + 30_000);
    assert.equal((await w.leave(w.firstOf('JOKER'))).ok, true);
    assert.equal(w.session.phase, 'ENDED');
    w.advanceTo(at + 61_000);
    for (const u of w.others(x)) assert.equal(eliminatedOf(w, u, x), 0, u);
    assert.equal(desertion.getDesertionBlock(x), null);
    w.attachSocket(x);
    const room = await w.createRoom(x);
    assert.notEqual(room.code, 'DESERTION_COOLDOWN');
});

test('A09-B-201 6명 판 60초 탈락 직후 방 만들기 → DESERTION_COOLDOWN (ALREADY_IN_GAME 아님)', async (t) => {
    const w = H.setup(t, { id: 'a09ge201', n: 6, settings: LONG });
    w.toDay();
    const x = w.nonJokers()[0];
    await disconnectAndExpire(w, x);
    w.attachSocket(x);
    const room = await w.createRoom(x);
    assert.equal(room.ok, false);
    assert.equal(room.code, 'DESERTION_COOLDOWN');
});

test('A09-B-202 10명 판 0·20·40초에 3명 끊김 → 60·80·100초에 하나씩 탈락', async (t) => {
    const w = H.setup(t, { id: 'a09ge202', n: 10, settings: LONG });
    w.toDay();
    const [a, b, c] = w.nonJokers();
    const watcher = w.firstOf('JOKER');
    const start = w.now();
    await w.disconnect(a);
    w.advanceTo(start + 20_000);
    await w.disconnect(b);
    w.advanceTo(start + 40_000);
    await w.disconnect(c);
    const victims = () => w.got(watcher, 'player_eliminated').map((p) => p.victimUuid);
    for (const [ms, list] of [[59_999, []], [60_000, [a]], [79_999, [a]], [80_000, [a, b]], [99_999, [a, b]], [100_000, [a, b, c]]]) {
        w.advanceTo(start + ms);
        assert.deepEqual(victims(), list, `${ms}ms`);
    }
});

test('A09-B-203 8명 판 광대 2명이 같은 순간 끊김 → 60초에 둘 다 탈락, 판 끝(시민 승) 한 번만', async (t) => {
    const w = H.setup(t, { id: 'a09ge203', n: 8, roleCounts: { JOKER: 2 }, settings: LONG });
    w.toDay();
    const [j1, j2] = w.byRole('JOKER');
    const at = w.now();
    await w.disconnect(j1);
    await w.disconnect(j2);
    w.advanceTo(at + 60_000);
    const watcher = w.byRole('CITIZEN')[0];
    const got = w.got(watcher, 'player_eliminated');
    assert.deepEqual(got.map((p) => p.victimUuid).sort(), [j1, j2].sort());
    assert.equal(got.filter((p) => p.winResult).length, 1);
    assert.equal(got.find((p) => p.winResult).winResult.winner, 'CITIZEN');
});

test('A09-B-204 [지금 동작] 5명 판 전원 끊김 → 60초에 탈락 차례로 → 승부 나는 때 판 끝', async (t) => {
    const w = H.setup(t, { id: 'a09ge204', n: 5, settings: LONG });
    w.toDay();
    const citizens = w.nonJokers();
    const at = w.now();
    // 시민부터 끊김 → 시민 셋이 빠지면 광대 1 : 시민 1 → 광대 승, 남은 둘은 탈락 안 함
    for (const u of [...citizens, w.firstOf('JOKER')]) await w.disconnect(u);
    w.advanceTo(at + 60_000);
    assert.equal(w.session.phase, 'ENDED');
    assert.equal(w.session.winResult?.winner, 'JOKER');
    assert.equal(w.isAlive(citizens[3]), true);
    assert.equal(w.isAlive(w.firstOf('JOKER')), true);
});

// 방장 칸 정하기: 자리 순서의 그 자리 사람(광대 아닌 자리)을 방장으로 판 다시 차림
function setupWithHost(t, { id, n, seat }) {
    const probe = H.setup(t, { id, n, settings: LONG });
    const host = [...probe.session.players.keys()][seat];
    assert.notEqual(probe.roleOf(host), 'JOKER', '방장 자리가 광대');
    return H.setup(t, { id, n, settings: LONG, hostUuid: host });
}

test('A09-B-205 [지금 동작] 6명 판 방장 끊김 → 30초 → 방장 그대로', async (t) => {
    const w = setupWithHost(t, { id: 'a09ge205', n: 6, seat: 2 });
    w.toDay();
    const host = w.session.hostUuid;
    await w.disconnect(host);
    w.advance(30_000);
    const viewer = w.alive().find((u) => u !== host);
    assert.equal((await w.snapshot(viewer)).hostUuid, host);
    assert.equal(w.got(viewer, 'session_participation_changed').length, 0);
});

test('A09-B-206 7명 판 방장 60초 탈락 → session_participation_changed 방장 = 맨 앞자리부터 찾아 처음 나오는 참여 중인 사람', async (t) => {
    const w = setupWithHost(t, { id: 'a09ge206', n: 7, seat: 3 });
    w.toDay();
    const order = [...w.session.players.keys()];
    const host = w.session.hostUuid;
    assert.equal(host, order[3]);
    await disconnectAndExpire(w, host);
    const viewer = order[1];
    assert.equal(w.got(viewer, 'session_participation_changed').at(-1)?.hostUuid, order[0]);
});

test('A09-B-207 6명 판 토론 중 탈락 → 토론 마감 시각 안 바뀜', async (t) => {
    const w = H.setup(t, { id: 'a09ge207', n: 6, settings: LONG });
    w.toDay();
    const watcher = w.firstOf('JOKER');
    const before = (await w.snapshot(watcher)).dayPhaseDeadline;
    await disconnectAndExpire(w, w.nonJokers()[0]);
    const after = await w.snapshot(watcher);
    assert.equal(after.dayPhase, 'DAY_DISCUSSION');
    assert.equal(after.dayPhaseDeadline, before);
});

test('A09-B-208 [지금 동작] 6명 판 의사 1, 의사 차례 중 끊긴 의사 60초 탈락 → 차례 닫힘(5초 안)', async (t) => {
    const w = H.setup(t, { id: 'a09ge208', n: 6, roleCounts: { JOKER: 1, DOCTOR: 1 }, settings: { nightActionTime: 120 } });
    w.toDay();
    await w.toNight();
    await w.untilTurn('DOCTOR');
    const doctor = w.firstOf('DOCTOR');
    const watcher = w.firstOf('JOKER');
    const at = await disconnectAndExpire(w, doctor);
    assert.equal(w.isAlive(doctor), false);
    w.advanceTo(at + 65_000);
    assert.equal(w.got(watcher, 'night_turn_ended').filter((e) => e.role === 'DOCTOR').length, 1);
});

test('A09-B-209 8명 판 재판 투표자 1명 끊긴 채 나머지 다 냄 → 60초 탈락 → 마감 = 탈락 때 + 5초', async (t) => {
    const w = H.setup(t, { id: 'a09ge209', n: 8, settings: { tribunalTime: 120 } });
    const [x, d] = w.nonJokers();
    await w.toTribunal(d);
    const at = w.now();
    await w.disconnect(x);
    await w.castAll('NOT_GUILTY');
    w.advanceTo(at + 60_000);
    assert.equal(w.got(d, 'phase_settle_started').filter((p) => p.phase === 'TRIBUNAL').at(-1)?.deadline, at + 65_000);
    w.advanceTo(at + 64_999);
    assert.equal(w.got(d, 'tribunal_vote_resolved').length, 0);
    w.advance(1);
    assert.equal(w.got(d, 'tribunal_vote_resolved').length, 1);
});

// A09-B-317~322 판 인원별 60초 탈락 뒤 투표할 사람 수 = 인원 − 1 − 그날 앞서 죽은 수 (값 6)
for (const [i, n] of [5, 6, 7, 8, 9, 10].entries()) {
    const no = `A09-B-${317 + i}`;
    test(`${no} ${n}명 판 낮 투표 중 1명 60초 탈락 → 투표할 사람 수 ${n - 1}`, async (t) => {
        const w = H.setup(t, { id: `a09ge${317 + i}`, n, settings: { dayVoteTime: 120 } });
        w.toVote();
        const x = w.nonJokers()[0];
        await disconnectAndExpire(w, x);
        const watcher = w.firstOf('JOKER');
        const progress = w.got(watcher, 'session_participation_changed').at(-1)?.progress;
        assert.deepEqual({ kind: progress?.kind, requiredCount: progress?.requiredCount }, { kind: 'DAY_VOTE', requiredCount: n - 1 });
        assert.equal((await w.snapshot(watcher)).progress.requiredCount, n - 1);
    });
}

// A09-B-323~327 끊긴 사람 직업별 낮 60초 탈락 뒤 그 밤 차례 (값 5)
// 차례 시작·끝 알림 (붙어 있는 사람이 받은 것)
const turns = (w, uuid, event) => w.got(uuid, event).map((e) => e.role);

test('A09-B-323 8명 판 광대 2 중 1·의사 2 중 1 낮에 탈락 → 그 밤: 남은 같은 직업만 차례 (남은 한 명이 고르면 5초 당김)', async (t) => {
    const w = H.setup(t, { id: 'a09ge323', n: 8, roleCounts: { JOKER: 2, DOCTOR: 2 }, settings: LONG });
    w.toDay();
    const [j1, j2] = w.byRole('JOKER');
    const [d1, d2] = w.byRole('DOCTOR');
    const at = w.now();
    await w.disconnect(j1);
    await w.disconnect(d1);
    w.advanceTo(at + 60_000);
    assert.equal(w.isAlive(j1) || w.isAlive(d1), false);
    await w.toNight();
    const watcher = w.byRole('CITIZEN')[0];
    for (const [role, actor] of [['JOKER', j2], ['DOCTOR', d2]]) {
        await w.untilTurn(role);
        assert.equal((await w.night(actor, null)).ok, true);
        assert.equal(w.got(watcher, 'phase_settle_started').filter((p) => p.phase === 'NIGHT' && p.role === role).length, 1, `${role} 5초 당김 없음`);
    }
});

const EMPTY_TURN_CASES = [
    ['A09-B-324', '10명 판 경비원 1', 10, { JOKER: 2, DOCTOR: 1, GUARD: 1 }, 'GUARD', 1],
    ['A09-B-325', '10명 판 마녀사냥꾼 1(둘째 밤)', 10, { JOKER: 2, WITCH_HUNTER: 1 }, 'WITCH_HUNTER', 2],
    ['A09-B-326', '6명 판 의사 1', 6, { JOKER: 1, DOCTOR: 1 }, 'DOCTOR', 1],
];
for (const [no, label, n, roleCounts, role, day] of EMPTY_TURN_CASES) {
    test(`${no} ${label} 낮에 탈락 → 그 밤 ${role} 차례는 열리고 넘어감`, async (t) => {
        const w = H.setup(t, { id: `a09ge${no.slice(-3)}`, n, roleCounts, settings: LONG });
        w.toDay();
        // 마녀사냥꾼은 첫 밤 차례가 없어 둘째 날 낮에 탈락시킴
        for (let d = 1; d < day; d += 1) await w.quickDay();
        const x = w.firstOf(role);
        await disconnectAndExpire(w, x);
        assert.equal(w.isAlive(x), false);
        await w.toNight();
        await w.quickNight();
        const watcher = w.byRole('CITIZEN')[0];
        const nightDay = w.session.dayIndex - 1;
        const started = w.got(watcher, 'night_turn_started').filter((e) => e.dayIndex === nightDay).map((e) => e.role);
        const ended = w.got(watcher, 'night_turn_ended').filter((e) => e.dayIndex === nightDay).map((e) => e.role);
        assert.ok(started.includes(role), `${role} 차례가 안 열림`);
        assert.ok(ended.includes(role), `${role} 차례가 안 넘어감`);
    });
}

test('A09-B-327 8명 판 시민 낮에 탈락 → 그 밤 차례 그대로 (광대·의사)', async (t) => {
    const w = H.setup(t, { id: 'a09ge327', n: 8, roleCounts: { JOKER: 1, DOCTOR: 1 }, settings: LONG });
    w.toDay();
    await disconnectAndExpire(w, w.byRole('CITIZEN')[0]);
    await w.toNight();
    await w.quickNight();
    const watcher = w.firstOf('JOKER');
    assert.deepEqual(turns(w, watcher, 'night_turn_started'), ['JOKER', 'DOCTOR']);
});

test('A09-B-328 7명 판 끊긴 지 30초에 판 끝 → 판 끝 칸 그 사람 편 결과 그대로 (탈주 아님)', async (t) => {
    const w = H.setup(t, { id: 'a09ge328', n: 7, settings: LONG });
    w.toDay();
    const x = w.nonJokers()[0];
    const at = w.now();
    await w.disconnect(x);
    w.advanceTo(at + 30_000);
    assert.equal((await w.leave(w.firstOf('JOKER'))).ok, true);
    const watcher = w.nonJokers()[1];
    const end = w.got(watcher, 'player_eliminated').at(-1).winResult;
    const mine = end.reveals.find((r) => r.uuid === x);
    assert.equal(end.winner, 'CITIZEN');
    assert.equal(mine.team, end.winner);
    assert.equal(mine.alive, true);
    w.advanceTo(at + 61_000);
    assert.equal(desertion.getDesertionBlock(x), null);
});

// ---------- A09-B-452~454 탈락한 사람이 판 번호 없이 스냅샷을 물음 (새로고침한 화면은 판 번호를 모름) ----------
// 판 번호를 주면 FORFEITED_FROM_SESSION인데 번호 없이 물으면 못 가려 INTERNAL_ERROR가 가던 것 → 화면이 까닭 글 없이 방 목록으로 감
test('A09-B-452 5명 판 61초 탈락 뒤 판 번호 없이 스냅샷 → FORFEITED_FROM_SESSION, 글 "연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다."', async (t) => {
    const w = H.setup(t, { id: 'a09ge452', n: 5, settings: LONG });
    w.toDay();
    const x = w.nonJokers()[0];
    await disconnectAndExpire(w, x);
    const fresh = w.attachSocket(x);
    await H.gs.resyncSessionRouting(fresh, x, w.io);
    const snap = await w.snapshot(x, {});
    assert.equal(snap.ok, false);
    assert.equal(snap.code, 'FORFEITED_FROM_SESSION');
    assert.equal(snap.message, '연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다.');
});

test('A09-B-453 6명 판: 판에 든 적 없는 사람이 판 번호 없이 스냅샷 → 탈락 글이 아님 (FORFEITED_FROM_SESSION 아님)', async (t) => {
    const w = H.setup(t, { id: 'a09ge453', n: 6, settings: LONG });
    w.toDay();
    await disconnectAndExpire(w, w.nonJokers()[0]);
    const stranger = 'a09ge453-stranger';
    const sock = H.gf.createFakeSocket(stranger, { id: `sock-${stranger}` });
    w.io.sockets.sockets.set(sock.id, sock);
    w.world.registry.set(stranger, sock.id);
    const snap = await H.gf.call(H.gs.__testables.handleGetSessionSnapshot, w.io, sock, stranger, {});
    assert.equal(snap.ok, false);
    assert.notEqual(snap.code, 'FORFEITED_FROM_SESSION');
});

test('A09-B-454 6명 판: 앞 판에서 탈락한 사람이 그 판이 지워진 뒤 판 번호 없이 스냅샷 → 탈락 글이 아님', async (t) => {
    const w = H.setup(t, { id: 'a09ge454', n: 6, settings: LONG });
    w.toDay();
    const x = w.nonJokers()[0];
    await disconnectAndExpire(w, x);
    // 판이 사라짐 (서버 다시 켜짐 흉내, A09-B-300과 같은 길)
    H.gf.resetCore();
    const fresh = w.attachSocket(x);
    const snap = await H.gf.call(H.gs.__testables.handleGetSessionSnapshot, w.io, fresh, x, {});
    assert.equal(snap.ok, false);
    assert.notEqual(snap.code, 'FORFEITED_FROM_SESSION');
});
