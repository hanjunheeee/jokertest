'use strict';

// 판 중 나가기·끊김 탈락 판 규칙 순수 시험 — 죽음 처리·표 정리·승패 확인·재판 취소·방장 넘김·끊긴 산 사람 표·전적 승패
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-B-038~060, 돌리기: node --test tests/game-core/a09-departure.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DATABASE_URL을 닿지 않는 곳으로 막음 → 꼭 socket/gameSession보다 먼저
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');

const { core } = gf;

// 판 id 겹침 막기, 시험 끝에 판·소켓·타이머 비움
let seq = 0;
function open(t, n, roleCounts = { JOKER: 1 }, extra = {}) {
    gf.resetCore();
    t.after(() => {
        gs.__resetStateForTests();
        gf.resetCore();
    });
    seq += 1;
    const s = gf.startGame({ id: `a09dp${seq}`, n, roleCounts, extra });
    gf.toDay(s);
    return s;
}

// 산 사람 전원 기권 → 재판 없이 밤
function abstainToNight(s) {
    if (core.getDayPhase(s) !== 'DAY_VOTE') gf.toVote(s);
    for (const p of s.players.values()) if (p.alive && p.isParticipating !== false) core.submitDayVote(p.uuid, s.id, null);
    const anyone = [...s.players.values()].find((p) => p.alive && p.isParticipating !== false).uuid;
    const prepared = core.prepareDayVoteResolution(anyone, s.id, s.dayIndex);
    assert.equal(prepared.ok, true, `낮 판정 준비 실패: ${prepared.code}`);
    assert.equal(core.commitDayVoteResolution(prepared.session, prepared.resolution).ok, true);
    assert.equal(s.phase, 'NIGHT');
}

// 밤 판정 (안 고른 사람은 건너뛰기), 판정 결과 돌려줌
function resolveNight(s) {
    gf.skipAllNight(s);
    const anyone = [...s.players.values()].find((p) => p.alive && p.isParticipating !== false).uuid;
    const prepared = core.prepareNightResolution(anyone, s.id);
    assert.equal(prepared.ok, true, `밤 판정 준비 실패: ${prepared.code}`);
    const committed = core.commitNightResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true, `밤 확정 실패: ${committed.code}`);
    return committed;
}

// 밤마다 광대가 한 사람씩 죽임 (죽은 사람 섞인 판), 끝나면 다음 날 낮
function killByNight(s, victims) {
    for (const victim of victims) {
        abstainToNight(s);
        const joker = gf.byRole(s, 'JOKER').find((u) => s.players.get(u).alive);
        assert.equal(core.submitNightAction(joker, s.id, victim).ok, true);
        resolveNight(s);
        assert.equal(s.players.get(victim).alive, false);
        assert.equal(s.phase, 'DAY');
    }
}

// 재판 유죄로 처형
function execute(s, uuid) {
    gf.toTribunal(s, uuid);
    const voters = core.getTribunalVoterUuids(s, uuid);
    for (const v of voters) assert.equal(core.submitTribunalVote(v, s.id, s.dayIndex, 'GUILTY').ok, true);
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    assert.equal(prepared.ok, true, `재판 판정 준비 실패: ${prepared.code}`);
    assert.equal(core.commitTribunalVoteResolution(prepared.session, prepared.resolution).ok, true);
    assert.equal(s.players.get(uuid).alive, false);
}

// 산 채로 나가기 / 끊김 60초 탈락 (판 규칙은 같은 나가기 함수, 이유만 다름)
const leave = (s, uuid) => core.commitParticipantDeparture(s, uuid, { reason: 'PLAYER_LEFT' });
const graceExpire = (s, uuid) => core.commitParticipantDeparture(s, uuid, { reason: 'DISCONNECT_GRACE_EXPIRED' });

// 전적 줄 (죽은 이유·살았나·승패)
const recordRow = (s, uuid) => core.buildGameResultRecord(s, { completed: s.phase === 'ENDED' && !!s.winResult })
    .players.find((p) => p.user_id === uuid);

// 참여 변경 알림 값의 그 사람 칸 (빠진 사람 명단 = 참여 중 아님)
const participationOf = (s, uuid) => core.buildParticipationChangedPayload(s, uuid).players.find((p) => p.uuid === uuid);

// 진짜 소켓 끊김 (서버 끊김 처리 → 산 사람이면 60초 기다림 시작, 판 규칙은 그대로)
async function disconnectSocket(s, uuid) {
    const world = gf.socketWorld(gs, s);
    const socket = world.sock(uuid);
    socket.connected = false;
    await gs.onDisconnect(world.io, socket, uuid);
    return world;
}

test('A09-B-038 6명 판 낮 토론 중 산 사람 나감 → 죽음·죽은 이유 DISCONNECT·빠진 사람 명단에 있음', (t) => {
    const s = open(t, 6);
    const x = gf.nonJokers(s)[0];
    assert.equal(leave(s, x).ok, true);
    const row = recordRow(s, x);
    assert.equal(row.is_alive, false);
    assert.equal(row.death_reason, 'DISCONNECT');
    assert.deepEqual(participationOf(s, x), { ...participationOf(s, x), alive: false, isParticipating: false });
    assert.equal(core.isParticipatingInSession(s, x), false);
});

test('A09-B-039 7명 판 처형된 사람이 나감 → 죽은 이유 EXECUTION 그대로, 빠진 사람 명단만 더해짐', (t) => {
    const s = open(t, 7);
    const x = gf.nonJokers(s)[0];
    execute(s, x);
    assert.equal(core.isParticipatingInSession(s, x), true);
    assert.equal(leave(s, x).ok, true);
    assert.equal(recordRow(s, x).death_reason, 'EXECUTION');
    assert.equal(participationOf(s, x).isParticipating, false);
});

test('A09-B-040 8명 판 산 사람 나감 → 탈락 알림 값은 사람 id·생존만, 직업·편 칸 없음', (t) => {
    const s = open(t, 8);
    const x = gf.nonJokers(s)[0];
    assert.equal(leave(s, x).ok, true);
    const payload = core.buildDisconnectPayload(s, x);
    assert.equal(payload.victimUuid, x);
    for (const p of payload.players) assert.deepEqual(Object.keys(p).sort(), ['alive', 'uuid']);
    const text = JSON.stringify(payload);
    for (const word of ['role', 'team', 'JOKER', 'CITIZEN', 'deathReason']) assert.equal(text.includes(word), false, `${word}가 실림`);
});

test('A09-B-041 7명 판 낮 투표 중 A가 B, C·D가 A를 찍은 뒤 A 나감 → A 표 없음, C·D 표 기권', (t) => {
    const s = open(t, 7);
    gf.toVote(s);
    const [a, b, c, d, ...rest] = gf.nonJokers(s);
    assert.equal(core.submitDayVote(a, s.id, b).ok, true);
    assert.equal(core.submitDayVote(c, s.id, a).ok, true);
    assert.equal(core.submitDayVote(d, s.id, a).ok, true);
    assert.equal(leave(s, a).ok, true);
    for (const voter of [c, d]) {
        const self = core.getSessionSnapshotForPlayer(voter, s.id).snapshot.self;
        assert.equal(self.hasSubmittedDayVote, true);
        assert.equal(self.dayVoteTargetUuid, null, `${voter} 표가 기권이 아님`);
    }
    // 나머지가 다 기권하면 표 6개 = 기권 6개 (A가 B를 찍은 표가 남았으면 기권이 5개)
    for (const u of [gf.firstOf(s, 'JOKER'), b, ...rest]) assert.equal(core.submitDayVote(u, s.id, null).ok, true);
    const prepared = core.prepareDayVoteResolution(b, s.id, s.dayIndex);
    assert.equal(prepared.ok, true);
    const result = core.buildDayVoteResolvedPayload(s, prepared.resolution);
    assert.equal(result.publicVoteCount, 6);
    assert.equal(result.publicAbstainCount, 6);
});

test('A09-B-042 8명 판 밤 광대가 A를 고른 뒤 A 나감 → 광대 대상 없음 (그 밤 죽은 사람 없음)', (t) => {
    const s = open(t, 8);
    abstainToNight(s);
    const [a, watcher] = gf.nonJokers(s);
    assert.equal(core.submitNightAction(gf.firstOf(s, 'JOKER'), s.id, a).ok, true);
    assert.equal(leave(s, a).ok, true);
    resolveNight(s);
    assert.equal(s.phase, 'DAY');
    const snap = core.getSessionSnapshotForPlayer(watcher, s.id).snapshot;
    assert.equal(snap.nightResult.victimUuid, null);
    assert.equal(snap.players.filter((p) => !p.isAlive).length, 1, '나간 A 말고 죽은 사람이 있음');
});

// A09-B-043~048 나가거나 탈락한 직후 승패 확인
const WIN_CASES = [
    ['A09-B-043', '5명 판 광대 1 나감', 5, { JOKER: 1 }, 0, (s) => gf.firstOf(s, 'JOKER'), 'CITIZEN'],
    ['A09-B-044', '6명 판 광대 2·나머지 3에서 시민 나감 → 2:2', 6, { JOKER: 2 }, 1, (s) => aliveCitizens(s)[0], 'JOKER'],
    ['A09-B-045', '7명 판 시민 나감', 7, { JOKER: 1 }, 0, (s) => aliveCitizens(s)[0], null],
    ['A09-B-046', '8명 판 광대 2 중 1 나감', 8, { JOKER: 2 }, 0, (s) => gf.firstOf(s, 'JOKER'), null],
    ['A09-B-047', '10명 판 산 광대 2·나머지 3에서 시민 나감', 10, { JOKER: 2 }, 5, (s) => aliveCitizens(s)[0], 'JOKER'],
    ['A09-B-048', '5명 판 산 광대 1·시민 2에서 시민 나감 → 1:1', 5, { JOKER: 1 }, 2, (s) => aliveCitizens(s)[0], 'JOKER'],
];
function aliveCitizens(s) {
    return [...s.players.values()].filter((p) => p.alive && p.role !== 'JOKER').map((p) => p.uuid);
}
for (const [no, label, n, roleCounts, deaths, pick, winner] of WIN_CASES) {
    test(`${no} ${label} → ${winner ? `${winner} 승, 판 끝` : '판 계속'}`, (t) => {
        const s = open(t, n, roleCounts);
        killByNight(s, deaths > 0 ? aliveCitizens(s).slice(-deaths) : []);
        const result = leave(s, pick(s));
        assert.equal(result.ok, true);
        if (winner) {
            assert.equal(result.terminal?.winner, winner);
            assert.equal(s.phase, 'ENDED');
        } else {
            assert.equal(result.terminal, null);
            assert.notEqual(s.phase, 'ENDED');
        }
    });
}

// A09-B-049~050 피고가 빠지면 재판 취소·처형 없이 밤 (6명 판)
for (const [no, label, depart] of [['A09-B-049', '나감', leave], ['A09-B-050', '60초 탈락', graceExpire]]) {
    test(`${no} 6명 판 재판 중 피고 ${label} → 재판 취소, 단계 NIGHT, 날짜 그대로, 처형 없음`, (t) => {
        const s = open(t, 6);
        const defendant = gf.nonJokers(s)[0];
        gf.toTribunal(s, defendant);
        const day = s.dayIndex;
        const result = depart(s, defendant);
        assert.equal(result.ok, true);
        assert.equal(result.tribunalCancelled, true);
        const resolved = core.buildTribunalVoteResolvedPayload(s);
        assert.equal(resolved.outcome, 'CANCELLED');
        assert.equal(resolved.executedUuid, null);
        assert.equal(s.phase, 'NIGHT');
        assert.equal(s.dayIndex, day);
        const executed = core.buildGameResultRecord(s, { completed: false }).players.filter((p) => p.death_reason === 'EXECUTION');
        assert.equal(executed.length, 0);
    });
}

test('A09-B-051 7명 판 판 중 방장 나감 → 방장 = 자리 순서로 방장 다음 참여 중인 사람', (t) => {
    // 자리 가운데(4번째 자리) 시민을 방장으로 (앞자리부터 찾는 것과 바로 뒤 자리를 고르는 것이 갈리게)
    gf.resetCore();
    const probe = gf.startGame({ id: `a09dp-probe${seq}`, n: 7, roleCounts: { JOKER: 1 } });
    const seats = [...probe.players.keys()].map((u) => u.replace(`a09dp-probe${seq}`, ''));
    gf.resetCore();
    seq += 1;
    const id = `a09dp${seq}`;
    const hostSeat = 3;
    const s = gf.startGame({ id, n: 7, roleCounts: { JOKER: 1 }, extra: { hostUuid: `${id}${seats[hostSeat]}` } });
    t.after(() => gf.resetCore());
    gf.toDay(s);
    const order = [...s.players.keys()];
    const host = order[hostSeat];
    assert.equal(s.hostUuid, host);
    assert.notEqual(s.players.get(host).role, 'JOKER');
    const result = leave(s, host);
    assert.equal(result.ok, true);
    assert.equal(core.buildParticipationChangedPayload(s, host).hostUuid, order[hostSeat + 1]);
});

test('A09-B-052 [지금 동작] 6명 판 방장 나감, 다음 자리 사람은 처형됨(판 자리 남음) → 그 사람이 방장', (t) => {
    // 첫 자리 방장, 둘째 자리 사람을 처형
    gf.resetCore();
    const probe = gf.startGame({ id: `a09dp-probe${seq}`, n: 6, roleCounts: { JOKER: 1 } });
    const seats = [...probe.players.keys()].map((u) => u.replace(`a09dp-probe${seq}`, ''));
    gf.resetCore();
    seq += 1;
    const id = `a09dp${seq}`;
    const s = gf.startGame({ id, n: 6, roleCounts: { JOKER: 1 }, extra: { hostUuid: `${id}${seats[0]}` } });
    t.after(() => gf.resetCore());
    gf.toDay(s);
    const order = [...s.players.keys()];
    const [host, next] = order;
    assert.equal(s.hostUuid, host);
    // 처형할 다음 자리 사람이 광대면 판이 끝나므로 광대 아닌 자리여야 함
    assert.notEqual(s.players.get(next).role, 'JOKER');
    execute(s, next);
    assert.equal(leave(s, host).ok, true);
    assert.equal(core.buildParticipationChangedPayload(s, host).hostUuid, next);
});

test('A09-B-053 5명 판 광대 1·시민 4에서 시민 1 나감 → 4명, 승부 아님 → 판 계속 (최소 인원 규칙 없음)', (t) => {
    const s = open(t, 5);
    const result = leave(s, gf.nonJokers(s)[0]);
    assert.equal(result.terminal, null);
    assert.equal(s.phase, 'DAY');
    assert.equal([...s.players.values()].filter((p) => p.alive).length, 4);
});

test('A09-B-054 6명 판 낮 투표 중 1명 끊김(기다림 중) → 투표할 사람 명단에 그대로', async (t) => {
    const s = open(t, 6);
    gf.toVote(s);
    const x = gf.nonJokers(s)[0];
    await disconnectSocket(s, x);
    assert.ok(core.getDisconnectGraceTarget(x, s.id), '기다림 대상이 아님');
    assert.equal(core.getDayVoterUuids(s).includes(x), true);
    assert.equal(core.buildPublicProgress(s).requiredCount, 6);
});

test('A09-B-055 7명 판 표 낸 뒤 끊김 → 표 그대로', async (t) => {
    const s = open(t, 7);
    gf.toVote(s);
    const [x, target] = gf.nonJokers(s);
    assert.equal(core.submitDayVote(x, s.id, target).ok, true);
    await disconnectSocket(s, x);
    const self = core.getSessionSnapshotForPlayer(x, s.id).snapshot.self;
    assert.equal(self.hasSubmittedDayVote, true);
    assert.equal(self.dayVoteTargetUuid, target);
    assert.equal(core.buildPublicProgress(s).doneCount, 1);
});

test('A09-B-056 8명 판 표 낸 뒤 60초 탈락 반영 → 그 사람 표 없음, 투표할 사람 명단에서도 빠짐', (t) => {
    const s = open(t, 8);
    gf.toVote(s);
    const [x, target] = gf.nonJokers(s);
    assert.equal(core.submitDayVote(x, s.id, target).ok, true);
    assert.equal(graceExpire(s, x).ok, true);
    assert.equal(core.getDayVoterUuids(s).includes(x), false);
    assert.deepEqual(
        { doneCount: core.buildPublicProgress(s).doneCount, requiredCount: core.buildPublicProgress(s).requiredCount },
        { doneCount: 0, requiredCount: 7 },
    );
});

test('A09-B-057 5명 판 60초 탈락 반영 뒤 그 사람 스냅샷 → FORFEITED_FROM_SESSION', (t) => {
    const s = open(t, 5);
    const x = gf.nonJokers(s)[0];
    assert.equal(graceExpire(s, x).ok, true);
    assert.equal(core.getSessionSnapshotForPlayer(x, s.id).code, 'FORFEITED_FROM_SESSION');
});

test('A09-B-058 10명 판 처형된 사람 끊김 → 스냅샷 ok, 내 칸 alive false (판 자리 남음)', async (t) => {
    const s = open(t, 10);
    const x = gf.nonJokers(s)[0];
    execute(s, x);
    await disconnectSocket(s, x);
    const snap = core.getSessionSnapshotForPlayer(x, s.id);
    assert.equal(snap.ok, true, `스냅샷 거절: ${snap.code}`);
    assert.equal(snap.snapshot.players.find((p) => p.uuid === x).isAlive, false);
});

test('A09-B-059 6명 판 시민 1 산 채로 나감 → 시민 승 → 그 사람 전적 won false', (t) => {
    const s = open(t, 6);
    const x = gf.nonJokers(s)[0];
    assert.equal(leave(s, x).ok, true);
    const end = leave(s, gf.firstOf(s, 'JOKER'));
    assert.equal(end.terminal?.winner, 'CITIZEN');
    assert.equal(recordRow(s, x).won, false);
});

test('A09-B-060 7명 판 시민 1 끊김(기다림 중) → 그사이 시민 승 → 그 사람 won true (탈락 전 판 끝)', async (t) => {
    const s = open(t, 7);
    const x = gf.nonJokers(s)[0];
    await disconnectSocket(s, x);
    const end = leave(s, gf.firstOf(s, 'JOKER'));
    assert.equal(end.terminal?.winner, 'CITIZEN');
    const row = recordRow(s, x);
    assert.equal(row.is_alive, true);
    assert.equal(row.won, true);
});
