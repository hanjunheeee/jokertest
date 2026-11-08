'use strict';

// 게임 진행 시험: 판 만들기·역할 구성·판 열기 검사·장부·역할 공개 (2차 묶음)
// 운영 규칙은 NODE_ENV=production 흉내, 진짜 DB 안 붙음
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./gameFixtures');

const { core, T } = F;

test.beforeEach(() => F.resetCore());
test.afterEach(() => F.resetCore());

// 운영 규칙 흉내 (끝나면 원래 값)
const withProd = (t) => {
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    t.after(() => {
        if (before === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = before;
    });
};

const playersOf = (n, prefix = 'v') => F.makePlayers(n, prefix);

// ── 인원·광대 수 검사 ──

test('운영 규칙: 4명 판은 인원 범위 밖으로 거절', (t) => {
    withProd(t);
    const r = T.validateSessionInput(playersOf(4), 1);
    assert.deepEqual([r.ok, r.reason], [false, 'PLAYER_COUNT_OUT_OF_RANGE']);
});

test('운영 규칙: 5명 판은 통과', (t) => {
    withProd(t);
    assert.equal(T.validateSessionInput(playersOf(5), 1).ok, true);
});

test('운영 규칙: 10명 판은 통과', (t) => {
    withProd(t);
    assert.equal(T.validateSessionInput(playersOf(10), 2).ok, true);
});

test('운영 규칙: 11명 판은 거절', (t) => {
    withProd(t);
    const r = T.validateSessionInput(playersOf(11), 1);
    assert.equal(r.reason, 'PLAYER_COUNT_OUT_OF_RANGE');
});

test('운영 규칙: 광대 0명 판은 거절', (t) => {
    withProd(t);
    const r = T.validateSessionInput(playersOf(5), 0);
    assert.equal(r.reason, 'INVALID_JOKER_COUNT');
});

test('운영 규칙: 판 열기 검사도 4명 후보를 throw로 막음', (t) => {
    const session = T.buildSessionCandidate(F.makeRoom({ id: 'prod4', n: 4 }), { randomFn: () => 0 }).session;
    withProd(t);
    assert.throws(() => core.commitGameSession(session), /지원하지 않는 인원/);
});

test('개발 규칙: 2명 판은 통과', () => {
    assert.equal(T.validateSessionInput(playersOf(2), 1).ok, true);
});

test('개발 규칙: 1명 판은 거절', () => {
    assert.equal(T.validateSessionInput(playersOf(1), 0).reason, 'PLAYER_COUNT_OUT_OF_RANGE');
});

test('빈 사람 목록·배열 아닌 값은 EMPTY_PLAYERS', () => {
    assert.equal(T.validateSessionInput([], 1).reason, 'EMPTY_PLAYERS');
    assert.equal(T.validateSessionInput(null, 1).reason, 'EMPTY_PLAYERS');
});

test('광대 수가 인원과 같으면 JOKER_COUNT_TOO_HIGH', () => {
    assert.equal(T.validateSessionInput(playersOf(3), 3).reason, 'JOKER_COUNT_TOO_HIGH');
});

test('광대 수가 정수가 아니면 INVALID_JOKER_COUNT', () => {
    assert.equal(T.validateSessionInput(playersOf(5), 1.5).reason, 'INVALID_JOKER_COUNT');
    assert.equal(T.validateSessionInput(playersOf(5), '1').reason, 'INVALID_JOKER_COUNT');
});

test('같은 uuid 두 명이면 DUPLICATE_UUID', () => {
    const list = playersOf(5);
    list[4] = { ...list[4], uuid: list[0].uuid };
    assert.equal(T.validateSessionInput(list, 1).reason, 'DUPLICATE_UUID');
});

test('닉네임이 공백뿐이면 INVALID_NICKNAME', () => {
    const list = playersOf(5);
    list[2] = { ...list[2], nickname: '   ' };
    assert.equal(T.validateSessionInput(list, 1).reason, 'INVALID_NICKNAME');
});

test('uuid가 빈 문자열이면 INVALID_UUID', () => {
    const list = playersOf(5);
    list[1] = { ...list[1], uuid: '' };
    assert.equal(T.validateSessionInput(list, 1).reason, 'INVALID_UUID');
});

// ── 자동 역할 구성 (광대 1명 기준) ──

const AUTO_EXPECTED = {
    5: { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 4 },
    6: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 4 },
    7: { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 5 },
    8: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0, CITIZEN: 5 },
    9: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0, CITIZEN: 6 },
    10: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 6 },
};
for (const [n, expected] of Object.entries(AUTO_EXPECTED)) {
    test(`자동 구성 ${n}명: 실제로 나눠 준 역할 수가 규칙대로`, () => {
        const session = F.startGame({ id: `auto${n}`, n: Number(n) });
        const counts = { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 0 };
        for (const p of session.players.values()) counts[p.role] += 1;
        assert.deepEqual(counts, expected);
    });
}

test('자동 구성 10명 광대 2명: 특수 역할 셋 다 + 시민 5', () => {
    assert.deepEqual(T.computeRoleComposition(10, 2), { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 5 });
});

test('자동 구성에서 광대 3명이면 판 후보가 ROLE_COUNT_ABOVE_LIMIT로 거절', () => {
    const r = T.buildSessionCandidate(F.makeRoom({ id: 'j3', n: 8, jokerCount: 3 }), { randomFn: () => 0 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'INVALID_ROLE_COMPOSITION:ROLE_COUNT_ABOVE_LIMIT');
});

test('직접 구성: 의사 3명은 ROLE_COUNT_ABOVE_LIMIT', () => {
    const r = T.buildSessionCandidate(F.makeRoom({ id: 'c-d3', n: 8, roleCounts: { DOCTOR: 3 } }), { randomFn: () => 0 });
    assert.equal(r.reason, 'INVALID_ROLE_COMPOSITION:ROLE_COUNT_ABOVE_LIMIT');
});

test('직접 구성: 지정 역할 합이 인원을 넘으면 FIXED_ROLES_EXCEED_SLOTS', () => {
    const room = F.makeRoom({ id: 'c-over', n: 5, roleCounts: { JOKER: 2, DOCTOR: 2, GUARD: 2 } });
    const r = T.buildSessionCandidate(room, { randomFn: () => 0 });
    assert.equal(r.reason, 'INVALID_ROLE_COMPOSITION:FIXED_ROLES_EXCEED_SLOTS');
});

test('직접 구성: 모르는 역할 이름이 끼면 UNKNOWN_ROLE_KEY', () => {
    const room = F.makeRoom({ id: 'c-unk', n: 5, roleCounts: { MAFIA: 1 } });
    const r = T.buildSessionCandidate(room, { randomFn: () => 0 });
    assert.equal(r.reason, 'INVALID_ROLE_COMPOSITION:UNKNOWN_ROLE_KEY');
});

test('직접 구성: 따로 받은 광대 수와 어긋나면 JOKER_COUNT_MISMATCH', () => {
    const room = F.makeRoom({ id: 'c-mis', n: 6, roleCounts: { JOKER: 1 }, settings: { jokerCount: 2 } });
    const r = T.buildSessionCandidate(room, { randomFn: () => 0 });
    assert.equal(r.reason, 'INVALID_ROLE_COMPOSITION:JOKER_COUNT_MISMATCH');
});

test('직접 구성 5명(광대·의사·경비원·마녀사냥꾼 1씩): 남는 1자리는 시민', () => {
    const session = F.startGame({ id: 'c5', n: 5, roleCounts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } });
    assert.deepEqual(session.roleComposition, { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1, CITIZEN: 1 });
    assert.equal(F.byRole(session, 'CITIZEN').length, 1);
});

test('판 밤 차례는 판에 있는 역할만 순서대로 (광대→의사→경비원)', () => {
    const session = F.startGame({ id: 'order8', n: 8 });
    assert.deepEqual([...core.getNightTurnOrder(session)], ['JOKER', 'DOCTOR', 'GUARD']);
});

test('기본 밤 차례는 광대→의사→경비원→마녀사냥꾼, 한 차례 30초', () => {
    assert.deepEqual([...core.NIGHT_TURN_ORDER], ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']);
    assert.equal(core.NIGHT_TURN_DURATION_MS, 30_000);
});

// ── 판 열기·장부 ──

test('새 판은 역할 공개·0일째·전원 생존·전원 참여 중으로 시작', () => {
    const session = F.startGame({ id: 'fresh', n: 5 });
    assert.equal(session.phase, 'ROLE_REVEAL');
    assert.equal(session.dayIndex, 0);
    assert.ok([...session.players.values()].every((p) => p.alive === true && p.isParticipating === true));
});

test('같은 방에서 두 번째 판 준비는 DUPLICATE_ROOM_SESSION', () => {
    F.startGame({ id: 'dup-room', n: 5 });
    const r = core.prepareGameSession(F.makeRoom({ id: 'dup-room', n: 5, prefix: 'other' }));
    assert.equal(r.code, 'DUPLICATE_ROOM_SESSION');
});

test('진행 중인 판에 묶인 사람이 낀 방은 PLAYER_ALREADY_IN_SESSION', () => {
    F.startGame({ id: 'busy', n: 5, prefix: 'shared' });
    const r = core.prepareGameSession(F.makeRoom({ id: 'busy-2', n: 5, prefix: 'shared' }));
    assert.equal(r.code, 'PLAYER_ALREADY_IN_SESSION');
});

test('끝난 판에 남아 있던 사람은 새 판이 열리면서 옛 판에서 빠짐', () => {
    const old = F.startGame({ id: 'old', n: 5, prefix: 'again' });
    old.phase = 'ENDED';
    const next = F.startGame({ id: 'new', n: 5, prefix: 'again' });
    assert.equal(core.getActiveSessionRoutingInfo('again-0').gameId, next.id);
    const state = core.__getStateSnapshotForTests();
    assert.equal(state.gameSessions.some(([id]) => id === old.id), false);
});

test('판 id가 이미 장부에 있으면 판 열기가 throw', () => {
    F.startGame({ id: 'id-a', n: 5, gameId: 'same-id' });
    const candidate = T.buildSessionCandidate(F.makeRoom({ id: 'id-b', n: 5 }), { randomFn: () => 0, gameIdFn: () => 'same-id' });
    assert.throws(() => core.commitGameSession(candidate.session), /id 충돌/);
});

test('후보의 역할을 몰래 바꿔 광대 수가 어긋나면 판 열기가 throw', () => {
    const candidate = T.buildSessionCandidate(F.makeRoom({ id: 'tamper', n: 5 }), { randomFn: () => 0 });
    for (const p of candidate.session.players.values()) p.role = 'CITIZEN';
    assert.throws(() => core.commitGameSession(candidate.session), /JOKER/);
});

test('후보 단계가 ROLE_REVEAL이 아니면 판 열기가 throw', () => {
    const candidate = T.buildSessionCandidate(F.makeRoom({ id: 'phase', n: 5 }), { randomFn: () => 0 });
    candidate.session.phase = 'DAY';
    assert.throws(() => core.commitGameSession(candidate.session), /phase/);
});

test('죽은 사람이 낀 후보는 판 열기가 throw', () => {
    const candidate = T.buildSessionCandidate(F.makeRoom({ id: 'dead', n: 5 }), { randomFn: () => 0 });
    [...candidate.session.players.values()][1].alive = false;
    assert.throws(() => core.commitGameSession(candidate.session), /alive/);
});

test('뒤쪽 참가자가 진행 중 판에 묶여 throw 나면 앞 참가자의 끝난 옛 판 기록은 그대로 (1-12)', () => {
    const ended = F.startGame({ id: 'e-old', n: 5, prefix: 'ea' });
    ended.phase = 'ENDED';
    F.startGame({ id: 'live', n: 5, prefix: 'lb' });
    const room = {
        id: 'mixed',
        players: new Map([...F.makePlayers(4, 'mx'), { uuid: 'ea-0', nickname: 'a', isReady: true }, { uuid: 'lb-0', nickname: 'b', isReady: true }]
            .map((p) => [p.uuid, p])),
        settings: { jokerCount: 1 },
    };
    const candidate = T.buildSessionCandidate(room, { randomFn: () => 0 });
    assert.throws(() => core.commitGameSession(candidate.session), /이미 다른 GameSession/);
    assert.equal(core.getActiveSessionRoutingInfo('ea-0').gameId, ended.id);
    assert.equal(ended.detachedUuids?.has('ea-0') ?? false, false);
});

test('진행 중 판은 매칭이 막히고, 기권하면 풀림', () => {
    const session = F.startGame({ id: 'mm', n: 5 });
    assert.equal(core.isMatchmakingBlocked('mm-1'), true);
    session.forfeitedUuids = new Set(['mm-1']);
    assert.equal(core.isMatchmakingBlocked('mm-1'), false);
});

test('끝난 판에 남은 사람은 매칭이 막히지 않음', () => {
    const session = F.startGame({ id: 'mm-end', n: 5 });
    session.phase = 'ENDED';
    assert.equal(core.isMatchmakingBlocked('mm-end-0'), false);
});

test('방 코드로 판 찾기: 코드 앞뒤 공백 무시, 방 id가 다르면 못 찾음', () => {
    const session = F.startGame({ id: 'code-room', n: 5, extra: { code: 'ABCD' } });
    assert.equal(core.getRoomCodeSessionState({ roomCode: ' ABCD ' }).gameId, session.id);
    assert.equal(core.getRoomCodeSessionState({ roomCode: 'ABCD', roomId: 'other' }), null);
    assert.equal(core.getRoomCodeSessionState({ roomCode: '' }), null);
});

test('진행 중 판에서 한 사람 판 정리를 부르면 판째로 지워짐', () => {
    const session = F.startGame({ id: 'wipe', n: 5 });
    const r = core.endGameSessionForPlayer('wipe-2', 'TEST');
    assert.equal(r.sessionDeleted, true);
    assert.equal(r.cleanupUuids.length, 5);
    assert.equal(core.getActiveSessionRoutingInfo('wipe-0'), null);
    assert.equal(core.getRoomCodeSessionState({ roomCode: 'x' }), null);
    assert.equal(core.__getStateSnapshotForTests().roomGameSession.some(([r2]) => r2 === session.roomId), false);
});

test('끝난 판은 한 사람씩 빠지고 마지막 사람이 나가야 판이 지워짐', () => {
    const session = F.startGame({ id: 'ended-out', n: 5 });
    session.phase = 'ENDED';
    for (let i = 0; i < 4; i += 1) {
        assert.equal(core.endGameSessionForPlayer(`ended-out-${i}`, 'LEFT').sessionDeleted, false);
    }
    assert.equal(core.endGameSessionForPlayer('ended-out-4', 'LEFT').sessionDeleted, true);
    assert.equal(core.__getStateSnapshotForTests().gameSessions.length, 0);
});

test('판 정리: 부른 쪽이 생각한 판 id가 다르면 STALE_SESSION_MISMATCH로 아무것도 안 지움', () => {
    F.startGame({ id: 'stale-end', n: 5 });
    assert.equal(core.endGameSessionForPlayer('stale-end-0', 'X', 'other-game').code, 'STALE_SESSION_MISMATCH');
    assert.notEqual(core.getActiveSessionRoutingInfo('stale-end-0'), null);
});

test('판 정리: 판 장부엔 없고 내 판 기록만 남았으면 기록만 지우고 SESSION_NOT_FOUND', () => {
    const session = F.startGame({ id: 'orphan', n: 5 });
    T.__deleteGameSessionOnlyForTests(session.id);
    assert.equal(core.endGameSessionForPlayer('orphan-0', 'X').code, 'SESSION_NOT_FOUND');
    assert.equal(core.endGameSessionForPlayer('orphan-0', 'X').code, 'NOT_IN_SESSION');
});

// ── 역할 공개 (새 규칙: 10초 마감, 확인 버튼은 기다리지 않음) ──

test('[규칙 변경] 역할 공개 중 확인 안 한 사람이 나가도 첫 낮으로 안 넘어감 (마감만 넘김)', () => {
    const session = F.startGame({ id: 'rr-leave', n: 5 });
    for (const uuid of [...session.players.keys()].slice(0, 4)) core.acknowledgeRoleReveal(uuid, session.id);
    const nonJoker = F.byRole(session, 'CITIZEN').find((u) => !session.roleRevealAcks.has(u)) ?? 'rr-leave-4';
    core.commitParticipantDeparture(session, nonJoker);
    assert.deepEqual(core.advanceStalledPhase(session), { transitioned: null });
    assert.equal(session.phase, 'ROLE_REVEAL');
});

test('10명 판 첫날 밤 차례엔 마녀사냥꾼이 없고, 2일째 밤부터 들어감', () => {
    const session = F.toNight(F.toDay(F.startGame({ id: 'wh-order', n: 10 })), 1);
    assert.deepEqual([...core.getNightTurnOrder(session)], ['JOKER', 'DOCTOR', 'GUARD']);
    session.dayIndex = 2;
    assert.deepEqual([...core.getNightTurnOrder(session)], ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']);
});

test('역할 확인을 같은 사람이 두 번 보내도 ok', () => {
    const session = F.startGame({ id: 'ack-twice', n: 5 });
    assert.equal(core.acknowledgeRoleReveal('ack-twice-0', session.id).ok, true);
    assert.equal(core.acknowledgeRoleReveal('ack-twice-0', session.id).ok, true);
});

test('역할 확인: 다른 판 id면 STALE_SESSION_MISMATCH, 판 없는 사람은 NOT_IN_SESSION, 숫자 id는 INVALID_GAME_ID', () => {
    const session = F.startGame({ id: 'ack-bad', n: 5 });
    assert.equal(core.acknowledgeRoleReveal('ack-bad-0', 'nope').code, 'STALE_SESSION_MISMATCH');
    assert.equal(core.acknowledgeRoleReveal('stranger', session.id).code, 'NOT_IN_SESSION');
    assert.equal(core.acknowledgeRoleReveal('ack-bad-0', 42).code, 'INVALID_GAME_ID');
});

test('역할 공개 마감: 아무도 안 눌러도 첫 낮(1일째 토론)으로', () => {
    const session = F.startGame({ id: 'force', n: 5 });
    const r = core.forceCompleteRoleReveal(session);
    assert.deepEqual([r.ok, r.transitioned], [true, true]);
    assert.deepEqual([session.phase, session.dayIndex, session.dayPhase], ['DAY', 1, 'DAY_DISCUSSION']);
});

test('역할 공개 마감을 두 번 부르면 두 번째는 INVALID_PHASE (날짜 두 번 안 넘어감)', () => {
    const session = F.startGame({ id: 'force2', n: 5 });
    core.forceCompleteRoleReveal(session);
    assert.equal(core.forceCompleteRoleReveal(session).code, 'INVALID_PHASE');
    assert.equal(session.dayIndex, 1);
});

test('역할 공개 마감: 장부에 없는 판이면 SESSION_NOT_FOUND', () => {
    const candidate = T.buildSessionCandidate(F.makeRoom({ id: 'ghost', n: 5 }), { randomFn: () => 0 });
    assert.equal(core.forceCompleteRoleReveal(candidate.session).code, 'SESSION_NOT_FOUND');
});

test('역할 공개 마감: 참여 중인 사람이 아무도 없으면 넘기지 않음', () => {
    const session = F.startGame({ id: 'empty-rr', n: 5 });
    for (const p of session.players.values()) p.isParticipating = false;
    const r = core.forceCompleteRoleReveal(session);
    assert.deepEqual([r.ok, r.transitioned, session.phase], [true, false, 'ROLE_REVEAL']);
});

// ── 시작 방송 내용 ──

test('게임 시작 방송: 사람 목록엔 역할이 없고 내 역할은 self에만', () => {
    const session = F.startGame({ id: 'start-pl', n: 6 });
    const viewer = F.firstOf(session, 'CITIZEN');
    const payload = core.buildGameStartedPayload(session, viewer);
    assert.ok(payload.state.players.every((p) => !('role' in p)));
    assert.equal(payload.state.self.role, 'CITIZEN');
    assert.equal('allies' in payload.state.self, false);
});

test('게임 시작 방송: 광대는 동료 광대 uuid만 받음 (자기 자신 빼고)', () => {
    const session = F.startGame({ id: 'start-j2', n: 6, jokerCount: 2 });
    const [j1, j2] = F.byRole(session, 'JOKER');
    assert.deepEqual(core.buildGameStartedPayload(session, j1).state.self.allies, [j2]);
});

test('방 설정의 이상한 시간 값(0·음수·소수·문자)은 판 시간 설정에서 빠짐', () => {
    const settings = T.buildTimerSettings({
        dayDiscussionTime: 0, dayVoteTime: -5, nightActionTime: 1.5,
        roleNightActionTimes: { JOKER: 20, DOCTOR: '10', GUARD: 0, MAFIA: 5 },
    });
    assert.deepEqual(settings, { dayDiscussionTime: null, dayVoteTime: null, tribunalTime: null, nightActionTime: null, roleNightActionTimes: { JOKER: 20 } });
});
