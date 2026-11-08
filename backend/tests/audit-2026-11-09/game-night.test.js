'use strict';

// 게임 진행 시험: 밤 행동 받기·역할 차례·밤 판정·밤 확정 (2차 묶음)
// 새 규칙: 광대는 동료 광대(자기 포함)를 못 고름, 마녀사냥꾼은 처형 없이 죽은 사람 역할 확인만(2일째 밤부터)
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('./gameFixtures');

const { core } = F;

test.beforeEach(() => F.resetCore());
test.afterEach(() => F.resetCore());

let seq = 0;
const nextId = (name) => { seq += 1; return `${name}${seq}`; };

// 10명 판(광대·의사·경비원·마녀사냥꾼 1씩 + 시민 6)을 밤으로 (기본 1일째 밤)
const fullNight = ({ dayIndex = 1 } = {}) => {
    const session = F.toNight(F.toDay(F.startGame({ id: nextId('full'), n: 10 })), dayIndex);
    return {
        session,
        joker: F.firstOf(session, 'JOKER'),
        doctor: F.firstOf(session, 'DOCTOR'),
        guard: F.firstOf(session, 'GUARD'),
        hunter: F.firstOf(session, 'WITCH_HUNTER'),
        citizens: F.byRole(session, 'CITIZEN'),
    };
};

// 직접 구성 판을 밤으로
const customNight = (n, roleCounts, dayIndex = 1) => {
    const session = F.toNight(F.toDay(F.startGame({ id: nextId('cus'), n, roleCounts })), dayIndex);
    return session;
};

const submit = (session, actor, target) => core.submitNightAction(actor, session.id, target);
const prep = (session) => core.prepareNightResolution([...session.players.keys()][0], session.id);

// ── 밤 행동 받기 ──

test('낮에 온 밤 행동은 INVALID_PHASE', () => {
    const session = F.toDay(F.startGame({ id: nextId('dayact'), n: 5 }));
    assert.equal(submit(session, F.firstOf(session, 'JOKER'), F.byRole(session, 'CITIZEN')[0]).code, 'INVALID_PHASE');
});

test('시민은 밤 행동이 없음 (NOT_ELIGIBLE)', () => {
    const { session, citizens } = fullNight();
    assert.equal(submit(session, citizens[0], citizens[1]).code, 'NOT_ELIGIBLE');
});

test('죽은 사람의 밤 행동은 ACTOR_NOT_ALIVE', () => {
    const { session, doctor, citizens } = fullNight();
    session.players.get(doctor).alive = false;
    assert.equal(submit(session, doctor, citizens[0]).code, 'ACTOR_NOT_ALIVE');
});

test('[규칙 변경] 광대가 동료 광대를 고르면 거절, 기록 안 남음', () => {
    const session = customNight(6, { JOKER: 2 });
    const [j1, j2] = F.byRole(session, 'JOKER');
    const r = submit(session, j1, j2);
    assert.equal(r.ok, false);
    assert.equal(session.nightActions.has(j1), false);
});

test('[규칙 변경] 광대가 자기 자신을 고르면 거절', () => {
    const { session, joker } = fullNight();
    const r = submit(session, joker, joker);
    assert.equal(r.ok, false);
    assert.equal(session.nightActions.has(joker), false);
});

test('광대가 죽은 사람을 고르면 TARGET_NOT_ALIVE', () => {
    const { session, joker, citizens } = fullNight();
    session.players.get(citizens[0]).alive = false;
    assert.equal(submit(session, joker, citizens[0]).code, 'TARGET_NOT_ALIVE');
});

test('의사는 자기 자신을 지킬 수 있음', () => {
    const { session, doctor } = fullNight();
    assert.equal(submit(session, doctor, doctor).ok, true);
    assert.equal(session.nightActions.get(doctor), doctor);
});

test('경비원은 자기 자신을 조사 못 함 (INVALID_TARGET)', () => {
    const { session, guard } = fullNight();
    assert.equal(submit(session, guard, guard).code, 'INVALID_TARGET');
});

test('판에 없는 사람을 고르면 INVALID_TARGET', () => {
    const { session, joker } = fullNight();
    assert.equal(submit(session, joker, 'ghost').code, 'INVALID_TARGET');
});

test('마녀사냥꾼은 첫날 밤(1일째)엔 행동 없음 (NOT_ELIGIBLE)', () => {
    const { session, hunter, citizens } = fullNight({ dayIndex: 1 });
    session.players.get(citizens[0]).alive = false;
    assert.equal(submit(session, hunter, citizens[0]).code, 'NOT_ELIGIBLE');
});

test('마녀사냥꾼은 2일째 밤부터 행동 가능, 산 사람은 못 고름 (TARGET_NOT_DEAD)', () => {
    const { session, hunter, citizens } = fullNight({ dayIndex: 2 });
    assert.equal(submit(session, hunter, citizens[0]).code, 'TARGET_NOT_DEAD');
    session.players.get(citizens[0]).alive = false;
    assert.equal(submit(session, hunter, citizens[0]).ok, true);
});

test('지금 차례가 광대인데 의사가 내면 NOT_YOUR_TURN', () => {
    const { session, doctor, citizens } = fullNight();
    session.nightTurnRole = 'JOKER';
    assert.equal(submit(session, doctor, citizens[0]).code, 'NOT_YOUR_TURN');
});

test('밤 행동을 다시 내면 마지막 대상으로 덮어씀', () => {
    const { session, joker, citizens } = fullNight();
    submit(session, joker, citizens[0]);
    submit(session, joker, citizens[1]);
    assert.equal(session.nightActions.get(joker), citizens[1]);
});

test('판정 끝난 밤에 늦게 온 행동은 NIGHT_ALREADY_RESOLVED', () => {
    const { session, joker, citizens } = fullNight();
    session.nightResolution = { dayIndex: session.dayIndex };
    assert.equal(submit(session, joker, citizens[0]).code, 'NIGHT_ALREADY_RESOLVED');
});

test('판 id 앞뒤 공백은 잘라서 받음 (밤 행동)', () => {
    const { session, joker, citizens } = fullNight();
    assert.equal(core.submitNightAction(joker, `  ${session.id} `, citizens[0]).ok, true);
});

// ── 한 번에 판정 ──

test('한 번에 판정: 행동할 산 사람이 다 안 냈으면 ACTIONS_PENDING', () => {
    const { session, joker, citizens } = fullNight();
    submit(session, joker, citizens[0]);
    assert.equal(prep(session).code, 'ACTIONS_PENDING');
});

test('광대 암살: 대상이 죽고 죽은 이유 ASSASSINATION, 2일째 낮으로', () => {
    const { session, joker, doctor, guard, citizens } = fullNight();
    const { committed } = F.resolveNightDirect(session, { [joker]: citizens[0], [doctor]: null, [guard]: null });
    assert.equal(committed.victimUuid, citizens[0]);
    const victim = session.players.get(citizens[0]);
    assert.deepEqual([victim.alive, victim.deathReason], [false, 'ASSASSINATION']);
    assert.deepEqual([session.phase, session.dayIndex], ['DAY', 2]);
});

test('의사가 광대 대상을 지키면 암살 막힘, 광대한테 실패 알림', () => {
    const { session, joker, doctor, guard, citizens } = fullNight();
    const { prepared, committed } = F.resolveNightDirect(session, { [joker]: citizens[0], [doctor]: citizens[0], [guard]: null });
    assert.equal(committed.victimUuid, null);
    assert.equal(session.players.get(citizens[0]).alive, true);
    assert.deepEqual(prepared.resolution.privateResults.get(joker), { actionType: 'ASSASSINATE', success: false });
});

test('의사가 다른 사람을 지키면 암살 성공', () => {
    const { session, joker, doctor, guard, citizens } = fullNight();
    const { committed } = F.resolveNightDirect(session, { [joker]: citizens[0], [doctor]: citizens[1], [guard]: null });
    assert.equal(committed.victimUuid, citizens[0]);
});

test('의사가 자기 자신을 지키면 광대가 노린 의사는 삶', () => {
    const { session, joker, doctor, guard } = fullNight();
    const { committed } = F.resolveNightDirect(session, { [joker]: doctor, [doctor]: doctor, [guard]: null });
    assert.equal(committed.victimUuid, null);
    assert.equal(session.players.get(doctor).alive, true);
});

test('경비원 조사: 고른 산 사람의 역할을 경비원만 받음', () => {
    const { session, joker, doctor, guard } = fullNight();
    const { prepared } = F.resolveNightDirect(session, { [joker]: null, [doctor]: null, [guard]: joker });
    assert.deepEqual(prepared.resolution.privateResults.get(guard), { actionType: 'INVESTIGATE', targetId: joker, role: 'JOKER' });
    assert.equal(prepared.resolution.privateResults.has(doctor), false);
});

test('광대가 경비원을 찍고 의사가 안 지키면 경비원 조사는 막히고 경비원은 죽음', () => {
    const { session, joker, doctor, guard, citizens } = fullNight();
    const { prepared, committed } = F.resolveNightDirect(session, { [joker]: guard, [doctor]: citizens[0], [guard]: joker });
    assert.equal(prepared.resolution.privateResults.has(guard), false);
    assert.equal(committed.victimUuid, guard);
});

test('광대가 경비원을 찍어도 의사가 경비원을 지키면 조사 결과를 받음', () => {
    const { session, joker, doctor, guard } = fullNight();
    const { prepared, committed } = F.resolveNightDirect(session, { [joker]: guard, [doctor]: guard, [guard]: joker });
    assert.equal(prepared.resolution.privateResults.get(guard)?.role, 'JOKER');
    assert.equal(committed.victimUuid, null);
});

test('마녀사냥꾼 확인: 죽은 사람 역할만 받고 아무도 더 안 죽음', () => {
    const { session, joker, doctor, guard, hunter, citizens } = fullNight({ dayIndex: 2 });
    session.players.get(citizens[0]).alive = false;
    const aliveBefore = [...session.players.values()].filter((p) => p.alive).length;
    const { prepared, committed } = F.resolveNightDirect(session, { [joker]: null, [doctor]: null, [guard]: null, [hunter]: citizens[0] });
    assert.deepEqual(prepared.resolution.privateResults.get(hunter), { actionType: 'CONFIRM', targetId: citizens[0], role: 'CITIZEN' });
    assert.equal(committed.victimUuid, null);
    assert.equal([...session.players.values()].filter((p) => p.alive).length, aliveBefore);
});

test('광대가 마녀사냥꾼을 찍고 안 지켜지면 마녀사냥꾼 확인은 막힘', () => {
    const { session, joker, doctor, guard, hunter, citizens } = fullNight({ dayIndex: 2 });
    session.players.get(citizens[0]).alive = false;
    const { prepared } = F.resolveNightDirect(session, { [joker]: hunter, [doctor]: null, [guard]: null, [hunter]: citizens[0] });
    assert.equal(prepared.resolution.privateResults.has(hunter), false);
});

test('광대 둘이 서로 다른 사람을 찍으면(동률) 희생자 없음', () => {
    const session = customNight(6, { JOKER: 2 });
    const [j1, j2] = F.byRole(session, 'JOKER');
    const [c1, c2] = F.byRole(session, 'CITIZEN');
    const { committed } = F.resolveNightDirect(session, { [j1]: c1, [j2]: c2 });
    assert.equal(committed.victimUuid, null);
});

test('광대 둘 중 하나만 찍고 하나는 건너뛰면 찍힌 사람이 죽음', () => {
    const session = customNight(6, { JOKER: 2 });
    const [j1, j2] = F.byRole(session, 'JOKER');
    const [c1] = F.byRole(session, 'CITIZEN');
    const { committed } = F.resolveNightDirect(session, { [j1]: c1, [j2]: null });
    assert.equal(committed.victimUuid, c1);
});

test('의사 둘이 서로 다른 사람을 지키면(만장일치 아님) 보호 없음', () => {
    const session = customNight(6, { JOKER: 1, DOCTOR: 2 });
    const joker = F.firstOf(session, 'JOKER');
    const [d1, d2] = F.byRole(session, 'DOCTOR');
    const [c1, c2] = F.byRole(session, 'CITIZEN');
    const { committed } = F.resolveNightDirect(session, { [joker]: c1, [d1]: c1, [d2]: c2 });
    assert.equal(committed.victimUuid, c1);
});

test('모두 건너뛰면 아무도 안 죽고 다음 낮으로', () => {
    const { session } = fullNight();
    F.skipAllNight(session);
    const r = prep(session);
    const c = core.commitNightResolution(r.session, r.resolution);
    assert.deepEqual([c.ok, c.victimUuid, session.phase], [true, null, 'DAY']);
});

test('밤 희생으로 산 광대 수가 나머지 이상이 되면 광대 승, 판 끝', () => {
    const session = F.toNight(F.toDay(F.startGame({ id: nextId('jwin'), n: 3 })));
    const joker = F.firstOf(session, 'JOKER');
    const [c1] = F.byRole(session, 'CITIZEN');
    const { committed } = F.resolveNightDirect(session, { [joker]: c1 });
    assert.deepEqual(committed.terminal, { winner: 'JOKER' });
    assert.equal(session.phase, 'ENDED');
});

test('밤 사망 공개: 광대 희생은 출처 JOKER, 밤 결과 방송엔 역할이 없음', () => {
    const { session, joker, doctor, guard, citizens } = fullNight();
    F.resolveNightDirect(session, { [joker]: citizens[0], [doctor]: null, [guard]: null });
    assert.deepEqual(session.nightResolution.publicDeathReveals, [{ victimUuid: citizens[0], source: 'JOKER' }]);
    const payload = core.buildNightResultAppliedPayload(session, citizens[0], session.nightResolution.publicDeathReveals);
    assert.ok(payload.players.every((p) => Object.keys(p).sort().join() === 'alive,uuid'));
});

// ── 밤 확정 막기 ──

test('확정: prepare 뒤 제출이 바뀌면 STALE_RESOLUTION, 아무도 안 죽음', () => {
    const { session, joker, doctor, guard, citizens } = fullNight();
    submit(session, joker, citizens[0]);
    submit(session, doctor, null);
    submit(session, guard, null);
    const r = prep(session);
    submit(session, joker, citizens[1]);
    assert.equal(core.commitNightResolution(r.session, r.resolution).code, 'STALE_RESOLUTION');
    assert.ok([...session.players.values()].every((p) => p.alive));
});

test('확정을 같은 준비로 두 번 하면 두 번째는 NIGHT_ALREADY_RESOLVED', () => {
    const { session } = fullNight();
    F.skipAllNight(session);
    const r = prep(session);
    core.commitNightResolution(r.session, r.resolution);
    assert.equal(core.commitNightResolution(r.session, r.resolution).code, 'NIGHT_ALREADY_RESOLVED');
});

test('확정: prepare가 안 만든 결과 객체는 UNKNOWN_RESOLUTION_SOURCE', () => {
    const { session } = fullNight();
    F.skipAllNight(session);
    const r = prep(session);
    assert.equal(core.commitNightResolution(session, { ...r.resolution }).code, 'UNKNOWN_RESOLUTION_SOURCE');
    assert.equal(core.commitNightResolution(session, null).code, 'UNKNOWN_RESOLUTION_SOURCE');
});

test('확정: 다른 판의 준비 결과를 넣으면 UNKNOWN_RESOLUTION_SOURCE', () => {
    const a = fullNight();
    const b = fullNight();
    F.skipAllNight(a.session);
    const r = prep(a.session);
    assert.equal(core.commitNightResolution(b.session, r.resolution).code, 'UNKNOWN_RESOLUTION_SOURCE');
});

test('확정: prepare 뒤 누가 판을 나가면 STALE_RESOLUTION (다시 준비해야 함)', () => {
    const { session, citizens } = fullNight();
    F.skipAllNight(session);
    const r = prep(session);
    core.commitParticipantDeparture(session, citizens[5]);
    assert.equal(core.commitNightResolution(r.session, r.resolution).code, 'STALE_RESOLUTION');
});

test('확정: prepare 뒤 결과 객체의 희생자를 몰래 바꿔도 준비 때 값으로 확정', () => {
    const { session, joker, doctor, guard, citizens } = fullNight();
    submit(session, joker, citizens[0]);
    submit(session, doctor, null);
    submit(session, guard, null);
    const r = prep(session);
    r.resolution.pendingEliminationTargetId = citizens[1];
    const c = core.commitNightResolution(r.session, r.resolution);
    assert.equal(c.victimUuid, citizens[0]);
    assert.equal(session.players.get(citizens[1]).alive, true);
});

test('확정: prepare 뒤 판이 끝났으면 GAME_ALREADY_ENDED', () => {
    const { session } = fullNight();
    F.skipAllNight(session);
    const r = prep(session);
    session.phase = 'ENDED';
    assert.equal(core.commitNightResolution(r.session, r.resolution).code, 'GAME_ALREADY_ENDED');
});

test('준비: 끝난 판·밤 아닌 판·장부 밖 판은 거절', () => {
    const { session } = fullNight();
    assert.equal(core.prepareNightResolutionForSession({ ...session }).code, 'SESSION_NOT_FOUND');
    session.phase = 'DAY';
    assert.equal(core.prepareNightResolutionForSession(session).code, 'INVALID_PHASE');
    session.phase = 'ENDED';
    assert.equal(core.prepareNightResolutionForSession(session).code, 'GAME_ALREADY_ENDED');
});

test('준비: 광대가 고른 사람이 그사이 죽었으면 TARGET_NOT_A_PARTICIPANT', () => {
    const { session, joker, doctor, guard, citizens } = fullNight();
    submit(session, joker, citizens[0]);
    submit(session, doctor, null);
    submit(session, guard, null);
    session.players.get(citizens[0]).alive = false;
    assert.equal(prep(session).code, 'TARGET_NOT_A_PARTICIPANT');
});

// ── 역할 차례 진행 ──

test('차례 진행: 광대 차례 전에 의사 차례를 끝내면 ROLE_OUT_OF_ORDER', () => {
    const { session, doctor } = fullNight();
    submit(session, doctor, null);
    assert.equal(core.completeNightRole(session, 'DOCTOR').code, 'ROLE_OUT_OF_ORDER');
});

test('차례 진행: 같은 역할을 두 번 끝내면 ROLE_ALREADY_COMPLETED', () => {
    const { session, joker } = fullNight();
    submit(session, joker, null);
    core.completeNightRole(session, 'JOKER');
    assert.equal(core.completeNightRole(session, 'JOKER').code, 'ROLE_ALREADY_COMPLETED');
});

test('차례 진행: 그 역할 산 사람이 안 냈으면 ACTIONS_PENDING', () => {
    const { session } = fullNight();
    assert.equal(core.completeNightRole(session, 'JOKER').code, 'ACTIONS_PENDING');
});

test('차례 진행: 모르는 역할 이름은 INVALID_ROLE', () => {
    const { session } = fullNight();
    assert.equal(core.completeNightRole(session, 'CITIZEN').code, 'INVALID_ROLE');
});

test('차례 진행: 끝난 판이면 GAME_ALREADY_ENDED', () => {
    const { session } = fullNight();
    session.phase = 'ENDED';
    assert.equal(core.completeNightRole(session, 'JOKER').code, 'GAME_ALREADY_ENDED');
});

test('차례 진행: 고른 대상이 낸 뒤 죽었으면 TARGET_NOT_A_PARTICIPANT', () => {
    const { session, joker, citizens } = fullNight();
    submit(session, joker, citizens[0]);
    session.players.get(citizens[0]).alive = false;
    assert.equal(core.completeNightRole(session, 'JOKER').code, 'TARGET_NOT_A_PARTICIPANT');
});

test('차례 진행: 네 역할을 다 끝내야 판정 준비 가능 (마녀사냥꾼 차례 남으면 ACTIONS_PENDING)', () => {
    const { session, joker, doctor, guard } = fullNight();
    submit(session, joker, null);
    core.completeNightRole(session, 'JOKER');
    submit(session, doctor, null);
    core.completeNightRole(session, 'DOCTOR');
    submit(session, guard, null);
    core.completeNightRole(session, 'GUARD');
    assert.equal(prep(session).code, 'ACTIONS_PENDING');
    assert.equal(core.completeNightRole(session, 'WITCH_HUNTER').ok, true);
    assert.equal(prep(session).ok, true);
});

test('차례 진행: 첫날 밤 마녀사냥꾼 차례는 행동할 사람 없음(NO_ACTOR)으로 끝남', () => {
    const { session, joker, doctor, guard } = fullNight();
    for (const [u, role] of [[joker, 'JOKER'], [doctor, 'DOCTOR'], [guard, 'GUARD']]) {
        submit(session, u, null);
        core.completeNightRole(session, role);
    }
    assert.equal(core.completeNightRole(session, 'WITCH_HUNTER').step.status, 'NO_ACTOR');
});

test('차례 진행: 판에 없는 역할 차례는 NO_ROLE로 바로 끝남', () => {
    const session = F.toNight(F.toDay(F.startGame({ id: nextId('norole'), n: 5 })));
    submit(session, F.firstOf(session, 'JOKER'), null);
    core.completeNightRole(session, 'JOKER');
    assert.equal(core.completeNightRole(session, 'DOCTOR').step.status, 'NO_ROLE');
});

test('차례 진행: 이미 끝난 역할이 늦게 또 내면 NOT_YOUR_TURN', () => {
    const { session, joker, citizens } = fullNight();
    submit(session, joker, citizens[0]);
    core.completeNightRole(session, 'JOKER');
    assert.equal(submit(session, joker, citizens[1]).code, 'NOT_YOUR_TURN');
    assert.equal(session.nightActions.get(joker), citizens[0]);
});

test('차례 진행 끝까지: 광대 암살 + 의사가 다른 사람 치료 → 희생자 확정', () => {
    const { session, joker, doctor, guard, citizens } = fullNight();
    submit(session, joker, citizens[0]);
    core.completeNightRole(session, 'JOKER');
    submit(session, doctor, citizens[1]);
    core.completeNightRole(session, 'DOCTOR');
    submit(session, guard, citizens[2]);
    core.completeNightRole(session, 'GUARD');
    core.completeNightRole(session, 'WITCH_HUNTER');
    const r = prep(session);
    const c = core.commitNightResolution(r.session, r.resolution);
    assert.deepEqual([c.ok, c.victimUuid], [true, citizens[0]]);
    assert.equal(r.resolution.privateResults.get(guard).role, 'CITIZEN');
});

test('차례 진행: 준비 뒤 다른 역할 차례 기록이 늘면 확정 거절 (STALE_RESOLUTION)', () => {
    const { session, joker, doctor, guard } = fullNight();
    for (const [u, role] of [[joker, 'JOKER'], [doctor, 'DOCTOR'], [guard, 'GUARD']]) {
        submit(session, u, null);
        core.completeNightRole(session, role);
    }
    core.completeNightRole(session, 'WITCH_HUNTER');
    const r = prep(session);
    session.nightActions.set(joker, null);
    session.nightActions.set('injected', 'x');
    assert.equal(core.commitNightResolution(r.session, r.resolution).code, 'STALE_RESOLUTION');
});

test('차례 진행 표시는 장부 밖 판이나 밤 아닌 판엔 안 켜짐', () => {
    const { session } = fullNight();
    assert.equal(core.markNightSequenced({ ...session }), false);
    session.phase = 'DAY';
    assert.equal(core.markNightSequenced(session), false);
});

// ── 조커(역할) 채팅 ──

const fixedNow = (t) => ({ now: () => t });

test('밤 역할 채팅: 광대는 밤에 보낼 수 있음, 낮엔 INVALID_PHASE', () => {
    const { session, joker } = fullNight();
    assert.equal(core.prepareJokerChatMessage(joker, session.id, '안녕', fixedNow(1000)).ok, true);
    session.phase = 'DAY';
    assert.equal(core.prepareJokerChatMessage(joker, session.id, '안녕', fixedNow(1000)).code, 'INVALID_PHASE');
});

test('밤 역할 채팅: 죽은 광대·죽은 의사 모두 NOT_ELIGIBLE (죽은 사람 채팅으로, 사용자 규칙), 죽은 광대는 읽기만', () => {
    const { session, joker, doctor } = fullNight();
    session.players.get(joker).alive = false;
    session.players.get(doctor).alive = false;
    assert.equal(core.prepareJokerChatMessage(joker, session.id, 'a', fixedNow(1000)).code, 'NOT_ELIGIBLE');
    assert.equal(core.prepareJokerChatMessage(doctor, session.id, 'a', fixedNow(1000)).code, 'NOT_ELIGIBLE');
    assert.ok(core.getChatRecipientUuids(session, 'JOKER').includes(joker));
});

test('밤 역할 채팅: 기록 뒤 0.5초 안에 또 보내면 RATE_LIMITED, 0.5초 지나면 통과', () => {
    const { session, joker } = fullNight();
    const p = core.prepareJokerChatMessage(joker, session.id, 'a', fixedNow(10_000));
    core.commitJokerChatMessage(session, joker, p.sentAt);
    assert.equal(core.prepareJokerChatMessage(joker, session.id, 'b', fixedNow(10_499)).code, 'RATE_LIMITED');
    assert.equal(core.prepareJokerChatMessage(joker, session.id, 'b', fixedNow(10_500)).ok, true);
});

test('밤 역할 채팅: prepare만 하고 commit 안 하면 간격 기록 안 먹음', () => {
    const { session, joker } = fullNight();
    core.prepareJokerChatMessage(joker, session.id, 'a', fixedNow(10_000));
    assert.equal(core.prepareJokerChatMessage(joker, session.id, 'b', fixedNow(10_001)).ok, true);
});

test('밤 역할 채팅 commit: 그사이 낮이 됐으면 INVALID_PHASE', () => {
    const { session, joker } = fullNight();
    const p = core.prepareJokerChatMessage(joker, session.id, 'a', fixedNow(10_000));
    session.phase = 'DAY';
    assert.equal(core.commitJokerChatMessage(session, joker, p.sentAt).code, 'INVALID_PHASE');
});

test('밤 채팅은 같은 직업끼리 허용 (사용자 결정): 산 시민이 밤에 보내면 받아 주고, 받는 사람은 시민만', () => {
    const { session, joker, citizens } = fullNight();
    const r = core.prepareJokerChatMessage(citizens[0], session.id, '시민끼리 밤 대화', fixedNow(1000));
    assert.equal(r.ok, true);
    const recipients = core.getChatRecipientUuids(session, 'CITIZEN');
    assert.deepEqual([...recipients].sort(), [...citizens].sort());
    assert.equal(recipients.includes(joker), false);
});

test('밤 역할 채팅 받는 사람: 광대 채널은 죽은 광대 포함, 의사 채널은 산 의사만', () => {
    const session = customNight(7, { JOKER: 2, DOCTOR: 2 });
    const [j1, j2] = F.byRole(session, 'JOKER');
    const [d1, d2] = F.byRole(session, 'DOCTOR');
    session.players.get(j2).alive = false;
    session.players.get(d2).alive = false;
    assert.deepEqual(core.getChatRecipientUuids(session, 'JOKER').sort(), [j1, j2].sort());
    assert.deepEqual(core.getChatRecipientUuids(session, 'DOCTOR'), [d1]);
});

test('죽은 사람 밤 행동은 판정 때 지워짐 (희생자의 제출)', () => {
    const { session, joker, doctor, guard } = fullNight();
    const { committed } = F.resolveNightDirect(session, { [joker]: guard, [doctor]: null, [guard]: joker });
    assert.equal(committed.victimUuid, guard);
    assert.equal(session.nightActions.has(guard), false);
    assert.equal(session.nightActions.get(joker), guard);
});
