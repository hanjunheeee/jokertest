'use strict';

// 게임 진행 시험: 게임 중 나가기·끊김 탈락·새로고침 스냅샷·전적 기록·끝난 판 찾기 (2차 묶음)
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./gameFixtures');

const { core } = F;

test.beforeEach(() => F.resetCore());
test.afterEach(() => F.resetCore());

let seq = 0;
const game = (n = 5, extra = {}) => {
    seq += 1;
    return F.startGame({ id: `dep${seq}`, n, ...extra });
};

// ── 게임 중 나가기 ──

test('산 사람이 나가면 끊김 사망·참여 끝·기권 명단·참여 번호 +1·내 판 기록 지움', () => {
    const session = F.toDay(game());
    const citizen = F.byRole(session, 'CITIZEN')[0];
    const r = core.commitParticipantDeparture(session, citizen);
    const p = session.players.get(citizen);
    assert.deepEqual([r.ok, r.eliminated, r.released], [true, true, true]);
    assert.deepEqual([p.alive, p.deathReason, p.isParticipating], [false, 'DISCONNECT', false]);
    assert.equal(session.participationRevision, 1);
    assert.equal(core.isForfeitedFromSession(session.id, citizen), true);
    assert.equal(core.getActiveSessionRoutingInfo(citizen), null);
});

test('두 번 나가면 두 번째는 ALREADY_LEFT, 참여 번호 안 오름', () => {
    const session = F.toDay(game());
    const citizen = F.byRole(session, 'CITIZEN')[0];
    core.commitParticipantDeparture(session, citizen);
    assert.equal(core.commitParticipantDeparture(session, citizen).code, 'ALREADY_LEFT');
    assert.equal(session.participationRevision, 1);
});

test('이미 죽은 사람이 나가면 탈락 처리 없이 기권 명단에만', () => {
    const session = F.toDay(game());
    const citizen = F.byRole(session, 'CITIZEN')[0];
    session.players.get(citizen).alive = false;
    session.players.get(citizen).deathReason = 'EXECUTION';
    const r = core.commitParticipantDeparture(session, citizen);
    assert.deepEqual([r.ok, r.eliminated, r.wasAlive], [true, false, false]);
    assert.equal(session.players.get(citizen).deathReason, 'EXECUTION');
});

test('판에 없는 사람·끝난 판·판 없음은 나가기 거절', () => {
    const session = F.toDay(game());
    assert.equal(core.commitParticipantDeparture(session, 'nobody').code, 'NOT_A_PARTICIPANT');
    assert.equal(core.commitParticipantDeparture(null, 'x').code, 'SESSION_NOT_FOUND');
    session.phase = 'ENDED';
    assert.equal(core.commitParticipantDeparture(session, F.byRole(session, 'CITIZEN')[0]).code, 'GAME_ALREADY_ENDED');
});

test('방장이 나가면 아직 참여 중인 다음 사람이 방장', () => {
    const session = F.toDay(game(5, { extra: { hostUuid: undefined } }));
    const [first, second] = [...session.players.keys()];
    session.hostUuid = first;
    const r = core.commitParticipantDeparture(session, first);
    assert.deepEqual([r.hostChanged, r.newHostUuid, session.hostUuid], [true, second, second]);
});

test('광대가 나가면 광대 0명 → 시민 승, 판 끝', () => {
    const session = F.toDay(game());
    const r = core.commitParticipantDeparture(session, F.firstOf(session, 'JOKER'));
    assert.deepEqual(r.terminal, { winner: 'CITIZEN' });
    assert.equal(session.phase, 'ENDED');
});

test('토론 중 준비 안 한 마지막 사람이 나가면 투표로 넘길 수 있음', () => {
    const session = F.toDay(game());
    const uuids = [...session.players.keys()];
    const leaver = F.byRole(session, 'CITIZEN')[0];
    for (const u of uuids) if (u !== leaver) core.acknowledgeDayVoteReady(u, session.id);
    core.commitParticipantDeparture(session, leaver);
    assert.deepEqual(core.advanceStalledPhase(session), { transitioned: 'DAY_VOTE' });
});

test('나간 사람을 찍은 낮 표는 기권으로 바뀌고, 나간 사람 표는 지워짐', () => {
    const session = F.toVote(F.toDay(game()));
    const [c0, c1, c2] = F.byRole(session, 'CITIZEN');
    core.submitDayVote(c0, session.id, c1);
    core.submitDayVote(c1, session.id, c2);
    const r = core.commitParticipantDeparture(session, c1);
    assert.equal(session.dayVotes.get(c0), null);
    assert.equal(session.dayVotes.has(c1), false);
    assert.deepEqual(r.cleanup.normalizedVoterUuids, [c0]);
});

test('나간 사람을 고른 밤 행동은 건너뛰기(null)로 바뀜', () => {
    const session = F.toNight(F.toDay(game(6)));
    const joker = F.firstOf(session, 'JOKER');
    const [c0] = F.byRole(session, 'CITIZEN');
    core.submitNightAction(joker, session.id, c0);
    core.commitParticipantDeparture(session, c0);
    assert.equal(session.nightActions.get(joker), null);
});

test('끊긴 사람 탈락: 이미 죽은 사람은 ALREADY_ELIMINATED', () => {
    const session = F.toDay(game());
    const c0 = F.byRole(session, 'CITIZEN')[0];
    session.players.get(c0).alive = false;
    assert.equal(core.commitDisconnectElimination(session, c0).code, 'ALREADY_ELIMINATED');
});

test('탈락 방송·참여 변경 방송엔 역할·죽은 이유가 없음', () => {
    const session = F.toDay(game());
    const c0 = F.byRole(session, 'CITIZEN')[0];
    core.commitParticipantDeparture(session, c0);
    const text = JSON.stringify([core.buildDisconnectPayload(session, c0), core.buildParticipationChangedPayload(session, c0)]);
    for (const secret of ['JOKER', 'CITIZEN', 'DISCONNECT']) assert.equal(text.includes(`"${secret}"`), false);
    const changed = core.buildParticipationChangedPayload(session, c0).players.find((p) => p.uuid === c0);
    assert.deepEqual([changed.alive, changed.isParticipating], [false, false]);
});

// ── 끊김 유예 대상 ──

test('끊김 유예 대상: 진행 중 판의 산 사람만', () => {
    const session = F.toDay(game());
    const [c0, c1] = F.byRole(session, 'CITIZEN');
    assert.equal(core.getDisconnectGraceTarget(c0, session.id).session, session);
    session.players.get(c1).alive = false;
    assert.equal(core.getDisconnectGraceTarget(c1, session.id), null);
});

test('끊김 유예 대상: 기권한 사람·끝난 판·다른 판 id는 null', () => {
    const session = F.toDay(game());
    const [c0, c1] = F.byRole(session, 'CITIZEN');
    session.forfeitedUuids = new Set([c0]);
    assert.equal(core.getDisconnectGraceTarget(c0, session.id), null);
    assert.equal(core.getDisconnectGraceTarget(c1, 'other-game'), null);
    session.phase = 'ENDED';
    assert.equal(core.getDisconnectGraceTarget(c1, session.id), null);
});

test('나가기 처리할 판 찾기: 옛 판 id로 온 나가기는 새 판을 못 건드림', () => {
    const session = F.toDay(game());
    assert.equal(core.getActiveSessionForDeparture('dep' + seq + '-0', 'old-id'), null);
    assert.equal(core.getActiveSessionForDeparture(`dep${seq}-0`, session.id), session);
});

// ── 새로고침 스냅샷 ──

test('스냅샷: 사람 목록엔 역할이 없고 내 역할만 self에', () => {
    const session = F.toDay(game(6));
    const viewer = F.byRole(session, 'CITIZEN')[0];
    const r = core.getSessionSnapshotForPlayer(viewer, session.id);
    assert.equal(r.ok, true);
    assert.ok(r.snapshot.players.every((p) => !('role' in p)));
    assert.equal(r.snapshot.self.role, 'CITIZEN');
    assert.equal(JSON.stringify(r.snapshot.players).includes('JOKER'), false);
});

test('스냅샷: 광대 둘이면 서로를 allies로 봄', () => {
    const session = F.toDay(game(6, { jokerCount: 2 }));
    const [j1, j2] = F.byRole(session, 'JOKER');
    assert.deepEqual(core.getSessionSnapshotForPlayer(j1, session.id).snapshot.self.allies, [j2]);
});

test('스냅샷: 나가서 기권한 사람은 FORFEITED_FROM_SESSION', () => {
    const session = F.toDay(game());
    const c0 = F.byRole(session, 'CITIZEN')[0];
    core.commitParticipantDeparture(session, c0);
    assert.equal(core.getSessionSnapshotForPlayer(c0, session.id).code, 'FORFEITED_FROM_SESSION');
});

test('스냅샷: 화면이 보낸 판 id가 지금 판과 다르면 GAME_ID_MISMATCH, 판 없는 사람은 NOT_A_PARTICIPANT', () => {
    const session = F.toDay(game());
    assert.equal(core.getSessionSnapshotForPlayer([...session.players.keys()][0], 'old').code, 'GAME_ID_MISMATCH');
    assert.equal(core.getSessionSnapshotForPlayer('stranger').code, 'NOT_A_PARTICIPANT');
});

test('스냅샷: 경비원 조사 결과는 경비원 스냅샷에만 다시 실림 (BE-036)', () => {
    const session = F.toNight(F.toDay(game(8)));
    const joker = F.firstOf(session, 'JOKER');
    const doctor = F.firstOf(session, 'DOCTOR');
    const guard = F.firstOf(session, 'GUARD');
    F.resolveNightDirect(session, { [joker]: null, [doctor]: null, [guard]: joker });
    assert.equal(core.getSessionSnapshotForPlayer(guard, session.id).snapshot.self.nightActionResult.role, 'JOKER');
    assert.equal('nightActionResult' in core.getSessionSnapshotForPlayer(doctor, session.id).snapshot.self, false);
});

test('스냅샷: 낮 투표 중엔 내 표만 보이고 남의 표는 안 보임', () => {
    const session = F.toVote(F.toDay(game()));
    const [c0, c1, c2] = F.byRole(session, 'CITIZEN');
    core.submitDayVote(c0, session.id, c2);
    const snap = core.getSessionSnapshotForPlayer(c1, session.id).snapshot;
    assert.equal(snap.self.hasSubmittedDayVote, false);
    assert.equal(JSON.stringify(snap).includes(`"dayVoteTargetUuid":"${c2}"`), false);
    assert.deepEqual(snap.progress, { kind: 'DAY_VOTE', doneCount: 1, requiredCount: 5 });
});

test('스냅샷: 재판 중엔 피고만 실리고 표 내용은 안 실림', () => {
    const session = F.toDay(game());
    const c0 = F.byRole(session, 'CITIZEN')[0];
    F.toTribunal(session, c0);
    const voter = F.byRole(session, 'CITIZEN')[1];
    core.submitTribunalVote(voter, session.id, session.dayIndex, 'GUILTY');
    const snap = core.getSessionSnapshotForPlayer(F.byRole(session, 'CITIZEN')[2], session.id).snapshot;
    assert.deepEqual(snap.tribunal, { defendantUuid: c0, resolved: false });
    assert.equal(JSON.stringify(snap).includes('GUILTY'), false);
});

test('스냅샷: 진행 중엔 승패 결과가 없고, 끝나면 전원 역할 공개', () => {
    const session = F.toDay(game());
    const viewer = F.byRole(session, 'CITIZEN')[0];
    assert.equal('winResult' in core.getSessionSnapshotForPlayer(viewer, session.id).snapshot, false);
    core.commitParticipantDeparture(session, F.firstOf(session, 'JOKER'));
    const snap = core.getSessionSnapshotForPlayer(viewer, session.id).snapshot;
    assert.equal(snap.winResult.winner, 'CITIZEN');
    assert.equal(snap.winResult.reveals.length, 5);
    assert.ok(snap.winResult.reveals.some((r) => r.role === 'JOKER'));
});

test('스냅샷: 밤에 끝난 판은 지난 낮 투표·재판 칸을 안 실음', () => {
    const session = F.toNight(F.toDay(game(3)));
    const joker = F.firstOf(session, 'JOKER');
    session.dayVoteResolution = { dayIndex: session.dayIndex, outcome: 'ABSTAINED', round: 1 };
    F.resolveNightDirect(session, { [joker]: F.byRole(session, 'CITIZEN')[0] });
    assert.equal(session.phase, 'ENDED');
    const snap = core.getSessionSnapshotForPlayer(joker, session.id).snapshot;
    assert.equal('dayVoteResolution' in snap, false);
});

// ── 전적 기록 ──

test('전적 기록: 시민 승 판은 시민 편 won true·광대 false, 승리 이유 ALL_JOKERS_ELIMINATED', () => {
    const session = F.toDay(game());
    const joker = F.firstOf(session, 'JOKER');
    session.players.get(joker).alive = false;
    session.players.get(joker).deathReason = 'EXECUTION';
    session.phase = 'ENDED';
    session.winResult = { winner: 'CITIZEN' };
    const rec = core.buildGameResultRecord(session);
    assert.equal(rec.result.win_reason, 'ALL_JOKERS_ELIMINATED');
    assert.equal(rec.players.find((p) => p.user_id === joker).won, false);
    assert.ok(rec.players.filter((p) => p.role === 'CITIZEN').every((p) => p.won === true));
    assert.equal(rec.stats.find((s) => s.user_id === joker).execution_count, 1);
});

test('전적 기록: 산 채로 나간 사람은 편이 이겨도 패 (BE-007)', () => {
    const session = F.toDay(game());
    const leaver = F.byRole(session, 'CITIZEN')[0];
    core.commitParticipantDeparture(session, leaver);
    core.commitParticipantDeparture(session, F.firstOf(session, 'JOKER'));
    const rec = core.buildGameResultRecord(session);
    assert.equal(rec.result.winner, 'CITIZEN');
    assert.equal(rec.players.find((p) => p.user_id === leaver).won, false);
});

test('전적 기록: 처형당해 죽은 뒤 나간 시민은 편 결과대로 승', () => {
    const session = F.toDay(game());
    const c0 = F.byRole(session, 'CITIZEN')[0];
    session.players.get(c0).alive = false;
    session.players.get(c0).deathReason = 'EXECUTION';
    core.commitParticipantDeparture(session, c0);
    core.commitParticipantDeparture(session, F.firstOf(session, 'JOKER'));
    assert.equal(core.buildGameResultRecord(session).players.find((p) => p.user_id === c0).won, true);
});

test('전적 기록: 중간에 깨진 판은 승자 NONE·ABORTED, 나간 사람만 패, 나머지는 승패 없음', () => {
    const session = F.toDay(game());
    const leaver = F.byRole(session, 'CITIZEN')[0];
    const rec = core.buildGameResultRecord(session, { completed: false, disconnectedUuid: leaver });
    assert.deepEqual([rec.result.winner, rec.result.win_reason, rec.result.completed], ['NONE', 'ABORTED', false]);
    const lp = rec.players.find((p) => p.user_id === leaver);
    assert.deepEqual([lp.won, lp.is_alive, lp.death_reason], [false, false, 'DISCONNECT']);
    assert.ok(rec.players.filter((p) => p.user_id !== leaver).every((p) => p.won === null));
    assert.deepEqual(rec.stats.map((s) => s.user_id), [leaver]);
});

test('전적 기록: 광대 승 판 승리 이유는 JOKER_PARITY_REACHED', () => {
    const session = F.toDay(game(3));
    session.phase = 'ENDED';
    session.winResult = { winner: 'JOKER' };
    assert.equal(core.buildGameResultRecord(session).result.win_reason, 'JOKER_PARITY_REACHED');
});

test('전적 기록 설정은 복사본: 판 설정을 나중에 바꿔도 기록은 그대로', () => {
    const session = F.toDay(game(5, { settings: { roleNightActionTimes: { JOKER: 20 } } }));
    session.phase = 'ENDED';
    session.winResult = { winner: 'CITIZEN' };
    const rec = core.buildGameResultRecord(session);
    session.timerSettings.roleNightActionTimes.JOKER = 99;
    session.roleComposition.JOKER = 9;
    assert.equal(rec.result.settings.timerSettings.roleNightActionTimes.JOKER, 20);
    assert.equal(rec.result.settings.roleComposition.JOKER, 1);
});

test('판 출처: NODE_ENV=test면 test, 덮어쓰기 값이 production이면 production', (t) => {
    const before = { env: process.env.NODE_ENV, ov: process.env.GAME_SOURCE_OVERRIDE };
    t.after(() => {
        if (before.env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before.env;
        if (before.ov === undefined) delete process.env.GAME_SOURCE_OVERRIDE; else process.env.GAME_SOURCE_OVERRIDE = before.ov;
    });
    process.env.NODE_ENV = 'test';
    delete process.env.GAME_SOURCE_OVERRIDE;
    assert.equal(F.T.resolveGameSource(), 'test');
    process.env.GAME_SOURCE_OVERRIDE = 'production';
    assert.equal(F.T.resolveGameSource(), 'production');
});

// ── 끝난 판 찾기 ──

test('끝난 판 파티: 방장만 받고, 받을 명단에서 방장·기권한 사람 빠짐', () => {
    const session = F.toDay(game());
    const uuids = [...session.players.keys()];
    session.hostUuid = uuids[0];
    session.forfeitedUuids = new Set([uuids[1]]);
    session.phase = 'ENDED';
    assert.equal(core.getEndedPartyContext(uuids[2]), null);
    assert.deepEqual(core.getEndedPartyContext(uuids[0]).participantUuids, uuids.slice(2));
});

test('끝난 판 파티: 진행 중 판이면 null', () => {
    const session = F.toDay(game());
    session.hostUuid = [...session.players.keys()][0];
    assert.equal(core.getEndedPartyContext(session.hostUuid), null);
});

test('다음 방 우편함: 끝난 판 참가자만, 기권한 사람·판 밖 사람·진행 중 판은 거절', () => {
    const session = F.toDay(game());
    const [a, b] = [...session.players.keys()];
    assert.equal(core.canLookupPartyRoom(a, session.id), false);
    session.phase = 'ENDED';
    session.forfeitedUuids = new Set([b]);
    assert.equal(core.canLookupPartyRoom(a, session.id), true);
    assert.equal(core.canLookupPartyRoom(b, session.id), false);
    assert.equal(core.canLookupPartyRoom('stranger', session.id), false);
    assert.equal(core.canLookupPartyRoom(a, ''), false);
});

test('끝난 판 남은 사람 목록: 뺄 사람·기권한 사람 빼고, 진행 중 판은 빈 목록', () => {
    const session = F.toDay(game());
    const uuids = [...session.players.keys()];
    assert.deepEqual(core.getEndedPlayerUuids(session.id), []);
    session.phase = 'ENDED';
    session.forfeitedUuids = new Set([uuids[4]]);
    assert.deepEqual(core.getEndedPlayerUuids(session.id, { excludeUuid: uuids[0] }), uuids.slice(1, 4));
    assert.equal(core.getEndedGameId(uuids[1]), session.id);
    assert.equal(core.getEndedGameId(uuids[4]), null);
});

test('종료 필드: 진행 중엔 승패 없이 생존만, 끝나면 전원 정체 공개', () => {
    const session = F.toDay(game());
    const running = core.buildTerminalFields(session);
    assert.equal('winResult' in running, false);
    assert.ok(running.players.every((p) => Object.keys(p).sort().join() === 'isAlive,uuid'));
    core.commitParticipantDeparture(session, F.firstOf(session, 'JOKER'));
    assert.equal(core.buildTerminalFields(session).winResult.reveals.find((r) => r.role === 'JOKER').deathReason, 'DISCONNECT');
});

test('접속 현황: 판 수와 판에 있는 사람 수 (끝난 판 남은 사람 포함)', () => {
    const a = F.toDay(game());
    game();
    a.phase = 'ENDED';
    const snap = core.getActiveGamePresenceSnapshot();
    assert.equal(snap.room_count, 2);
    assert.equal(snap.participantUuids.size, 10);
});
