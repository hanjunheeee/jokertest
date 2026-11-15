'use strict';

// 전적 승패 줄 순수 시험 — 산 채로 나간 사람은 편이 이겨도 패, 죽은 뒤 나간 사람은 편 결과 그대로, 점검 판은 전원 승패 없음
// 목록 A07-B-068~075 (docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md)
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 막음 (socket 쪽보다 먼저)
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const { abortGamesForMaintenance } = require('../../socket/gameSession/departure/maintenanceAbort');

const { core } = gf;
const T = gs.__testables;

let seq = 0;
function open(t, opts) {
    gf.resetCore();
    t.after(() => gf.resetCore());
    seq += 1;
    const s = gf.startGame({ n: 7, ...opts, id: `a07rw-${seq}` });
    gf.toDay(s);
    return s;
}

// 재판 유죄 처형 한 번
function execute(s, uuid) {
    gf.toTribunal(s, uuid);
    const voters = [...s.players.values()].filter((p) => p.alive && p.uuid !== uuid).map((p) => p.uuid);
    for (const v of voters) assert.equal(core.submitTribunalVote(v, s.id, s.dayIndex, 'GUILTY').ok, true);
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    assert.equal(prepared.ok, true, `재판 판정 준비 실패: ${prepared.code}`);
    return core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
}

// 아무도 안 죽는 밤 (행동자 전원 건너뛰기)
function quietNight(s) {
    gf.skipAllNight(s);
    const prepared = core.prepareNightResolution([...s.players.keys()][0], s.id);
    assert.equal(prepared.ok, true, `밤 판정 준비 실패: ${prepared.code}`);
    assert.equal(core.commitNightResolution(prepared.session, prepared.resolution).ok, true);
}

// 산 채로 나가기 / 끊김 60초 탈락 (판 코드는 둘 다 같은 나가기 함수, 이유만 다름)
const leaveAlive = (s, uuid) => assert.equal(core.commitParticipantDeparture(s, uuid, { reason: 'PLAYER_LEFT' }).ok, true);
const graceExpire = (s, uuid) => assert.equal(core.commitParticipantDeparture(s, uuid, { reason: 'DISCONNECT_GRACE_EXPIRED' }).ok, true);

// 밤에 죽은 걸로 두기 (광대 승 판을 짧게 만들 때)
function assassinated(s, uuid) {
    s.players.get(uuid).alive = false;
    s.players.get(uuid).deathReason = 'ASSASSINATION';
}

// 전적 기록에서 그 사람 won 값
const wonOf = (s, uuid) => core.buildGameResultRecord(s).players.find((p) => p.user_id === uuid).won;

test('A07-B-068 7명 판 산 채로 나간 시민, 시민 승 → won false', (t) => {
    const s = open(t);
    const [left] = gf.nonJokers(s);
    leaveAlive(s, left);
    assert.equal(execute(s, gf.firstOf(s, 'JOKER')).terminal?.winner, 'CITIZEN');
    assert.equal(wonOf(s, left), false);
});

test('A07-B-069 7명 판(광대 2) 산 채로 나간 광대, 광대 승 → won false', (t) => {
    const s = open(t, { jokerCount: 2 });
    const [leftJoker, stayJoker] = gf.byRole(s, 'JOKER');
    leaveAlive(s, leftJoker);
    const [a, b, c, d] = gf.nonJokers(s);
    for (const u of [a, b, c]) assassinated(s, u);
    // 산 (광대 1, 나머지 2) → 하나 처형하면 (1, 1) 광대 승
    assert.equal(execute(s, d).terminal?.winner, 'JOKER');
    assert.equal(wonOf(s, leftJoker), false);
    assert.equal(wonOf(s, stayJoker), true);
});

test('A07-B-070 7명 판 60초 탈락 시민, 시민 승 → won false', (t) => {
    const s = open(t);
    const [timedOut] = gf.nonJokers(s);
    graceExpire(s, timedOut);
    assert.equal(execute(s, gf.firstOf(s, 'JOKER')).terminal?.winner, 'CITIZEN');
    assert.equal(wonOf(s, timedOut), false);
});

test('A07-B-071 7명 판 죽은 뒤 나간 시민, 시민 승 → won true', (t) => {
    const s = open(t);
    const [deadThenLeft] = gf.nonJokers(s);
    assert.equal(execute(s, deadThenLeft).terminal, null);
    quietNight(s);
    assert.equal(core.commitParticipantDeparture(s, deadThenLeft, { reason: 'PLAYER_LEFT' }).ok, true);
    assert.equal(execute(s, gf.firstOf(s, 'JOKER')).terminal?.winner, 'CITIZEN');
    assert.equal(wonOf(s, deadThenLeft), true);
});

test('A07-B-072 7명 판 처형된 시민, 시민 승 → won true', (t) => {
    const s = open(t);
    const [executed] = gf.nonJokers(s);
    assert.equal(execute(s, executed).terminal, null);
    quietNight(s);
    assert.equal(execute(s, gf.firstOf(s, 'JOKER')).terminal?.winner, 'CITIZEN');
    assert.equal(wonOf(s, executed), true);
});

test('A07-B-073 7명 판 진 편 산 사람(광대 승 때 산 시민) → won false', (t) => {
    const s = open(t);
    const [a, b, c, d, e, survivor] = gf.nonJokers(s);
    for (const u of [a, b, c, d]) assassinated(s, u);
    assert.equal(execute(s, e).terminal?.winner, 'JOKER');
    assert.equal(s.players.get(survivor).alive, true);
    assert.equal(wonOf(s, survivor), false);
});

test('A07-B-074 7명 판 이긴 편 산 사람(시민 승 때 산 시민) → won true', (t) => {
    const s = open(t);
    const survivor = gf.nonJokers(s)[5];
    assert.equal(execute(s, gf.firstOf(s, 'JOKER')).terminal?.winner, 'CITIZEN');
    assert.equal(s.players.get(survivor).alive, true);
    assert.equal(wonOf(s, survivor), true);
});

test('A07-B-075 7명 판 점검 강제 종료 → 전적 won 전원 null', (t) => {
    // 저장 함수를 가짜로 바꿔 저장되는 전적 기록을 받아 봄 (DB 안 감)
    const saved = [];
    T.__setGameResultPersistForTests(async (record) => { saved.push(record); });
    t.after(() => {
        T.__setGameResultPersistForTests(null);
        gs.__resetStateForTests();
    });
    const s = open(t);
    gf.nonJokers(s).slice(0, 1).forEach((u) => execute(s, u));
    const io = gf.createFakeIo([]);
    assert.equal(abortGamesForMaintenance(io), 1);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].result.win_reason, 'MAINTENANCE');
    assert.equal(saved[0].players.length, 7);
    for (const row of saved[0].players) assert.equal(row.won, null, `${row.user_id} won ${row.won}`);
});
