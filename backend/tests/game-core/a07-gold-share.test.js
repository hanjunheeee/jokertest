'use strict';

// 판 골드 몫 순수 시험 — 판 끝까지 있던 사람은 모두 판 값, 탈주(산 채로 나감·60초 탈락)만 0, 점검·안 끝난 판·이상한 값은 아무도 안 받음
// 목록 A07-B-076~111 (docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md)
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 막음 (socket 쪽보다 먼저)
const gf = require('../audit-2026-11-09/gameFixtures');
const gs = require('../../socket/gameSession');
const { abortGamesForMaintenance } = require('../../socket/gameSession/departure/maintenanceAbort');
const { resolveGameGoldReward, buildGameGoldGrant } = require('../../game-core/result/record');

const { core } = gf;
const T = gs.__testables;

let seq = 0;
// 판 열기 + 판 시작 때 적힌 골드 값 넣기 (판 시작이 하는 일, 여기선 값만 줌)
function open(t, { goldReward, ...opts }) {
    gf.resetCore();
    t.after(() => gf.resetCore());
    seq += 1;
    const s = gf.startGame({ ...opts, id: `a07g-${seq}` });
    s.goldReward = goldReward;
    gf.toDay(s);
    return s;
}

function execute(s, uuid) {
    gf.toTribunal(s, uuid);
    const voters = [...s.players.values()].filter((p) => p.alive && p.uuid !== uuid).map((p) => p.uuid);
    for (const v of voters) assert.equal(core.submitTribunalVote(v, s.id, s.dayIndex, 'GUILTY').ok, true);
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    assert.equal(prepared.ok, true, `재판 판정 준비 실패: ${prepared.code}`);
    return core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
}

function quietNight(s) {
    gf.skipAllNight(s);
    const prepared = core.prepareNightResolution([...s.players.keys()][0], s.id);
    assert.equal(prepared.ok, true, `밤 판정 준비 실패: ${prepared.code}`);
    assert.equal(core.commitNightResolution(prepared.session, prepared.resolution).ok, true);
}

function dies(s, uuid, reason) {
    s.players.get(uuid).alive = false;
    s.players.get(uuid).deathReason = reason;
}

// 공개 줄에서 사람마다 받은 골드 → Map(uuid → 값)
const goldByUuid = (s) => new Map(core.buildTerminalFields(s).winResult.reveals.map((r) => [r.uuid, r.goldReward]));

// 받는 사람 7종이 다 있는 8명 판 (광대 2) — 광대 승으로 끝남
// 광대1 산(이긴 편 산) / 광대2 처형(이긴 편 죽음) / 시민1 산(진 편 산) / 시민2 암살(진 편 죽음)
// 시민3 처형 뒤 나감(죽은 뒤 나감) / 시민4 산 채로 나감 / 시민5 60초 탈락 / 시민6 처형
function sevenKinds(t, goldReward) {
    const s = open(t, { n: 8, jokerCount: 2, goldReward });
    const [j1, j2] = gf.byRole(s, 'JOKER');
    const [c1, c2, c3, c4, c5, c6] = gf.nonJokers(s);
    dies(s, j2, 'EXECUTION');
    dies(s, c2, 'ASSASSINATION');
    dies(s, c3, 'EXECUTION');
    dies(s, c6, 'EXECUTION');
    assert.equal(core.commitParticipantDeparture(s, c3, { reason: 'PLAYER_LEFT' }).ok, true);
    assert.equal(core.commitParticipantDeparture(s, c4, { reason: 'PLAYER_LEFT' }).terminal, null);
    // 산 (광대 1, 나머지 2)에서 60초 탈락 → (1, 1) 광대 승
    const last = core.commitParticipantDeparture(s, c5, { reason: 'DISCONNECT_GRACE_EXPIRED' });
    assert.equal(last.terminal?.winner, 'JOKER');
    return {
        s,
        kinds: {
            '이긴 편 산': j1,
            '진 편 산': c1,
            '이긴 편 죽음': j2,
            '진 편 죽음': c2,
            '죽은 뒤 나감': c3,
            '산 채로 나감': c4,
            '60초 탈락': c5,
        },
    };
}

// A07-B-076~103: 받는 사람 7종 × 판 값 0·1·2·100
const KINDS = [
    { name: '이긴 편 산', gets: true },
    { name: '진 편 산', gets: true },
    { name: '이긴 편 죽음', gets: true },
    { name: '진 편 죽음', gets: true },
    { name: '죽은 뒤 나감', gets: true },
    { name: '산 채로 나감', gets: false },
    { name: '60초 탈락', gets: false },
];
let no = 76;
for (const kind of KINDS) {
    for (const value of [0, 1, 2, 100]) {
        const id = `A07-B-${String(no).padStart(3, '0')}`;
        no += 1;
        const expected = kind.gets ? value : 0;
        test(`${id} 8명 판 ${kind.name}, 판 값 ${value} → ${expected}`, (t) => {
            const { s, kinds } = sevenKinds(t, value);
            assert.equal(goldByUuid(s).get(kinds[kind.name]), expected);
        });
    }
}

test('A07-B-104 6명 판 판 값 1, 점검 강제 종료 → 전원 0', (t) => {
    T.__setGameResultPersistForTests(async () => {});
    t.after(() => {
        T.__setGameResultPersistForTests(null);
        gs.__resetStateForTests();
    });
    const s = open(t, { n: 6, goldReward: 1 });
    assert.equal(abortGamesForMaintenance(gf.createFakeIo([])), 1);
    for (const p of s.players.values()) assert.equal(resolveGameGoldReward(s, p), 0, `${p.uuid}`);
    assert.equal(buildGameGoldGrant(s), null);
});

test('A07-B-105 5명 판 판 값 1, 진행 중 → 전원 0', (t) => {
    const s = open(t, { n: 5, goldReward: 1 });
    execute(s, gf.nonJokers(s)[0]);
    assert.notEqual(s.phase, 'ENDED');
    for (const p of s.players.values()) assert.equal(resolveGameGoldReward(s, p), 0, `${p.uuid}`);
    assert.equal(buildGameGoldGrant(s), null);
});

test('A07-B-106 5명 판 1명 탈주, 값 1 → 지급 묶음 { amount 1, 받을 사람 4명 }', (t) => {
    const s = open(t, { n: 5, goldReward: 1 });
    const [left] = gf.nonJokers(s);
    assert.equal(core.commitParticipantDeparture(s, left, { reason: 'PLAYER_LEFT' }).ok, true);
    assert.equal(execute(s, gf.firstOf(s, 'JOKER')).terminal?.winner, 'CITIZEN');
    const grant = buildGameGoldGrant(s);
    assert.equal(grant.amount, 1);
    assert.deepEqual([...grant.userIds].sort(), [...s.players.keys()].filter((u) => u !== left).sort());
});

test('A07-B-107 10명 판 3명 탈주, 값 2 → 지급 묶음 { amount 2, 받을 사람 7명 }', (t) => {
    const s = open(t, { n: 10, jokerCount: 2, goldReward: 2 });
    const leavers = gf.nonJokers(s).slice(0, 3);
    for (const u of leavers) assert.equal(core.commitParticipantDeparture(s, u, { reason: 'PLAYER_LEFT' }).ok, true);
    const [j1, j2] = gf.byRole(s, 'JOKER');
    assert.equal(execute(s, j1).terminal, null);
    quietNight(s);
    assert.equal(execute(s, j2).terminal?.winner, 'CITIZEN');
    const grant = buildGameGoldGrant(s);
    assert.equal(grant.amount, 2);
    assert.deepEqual([...grant.userIds].sort(), [...s.players.keys()].filter((u) => !leavers.includes(u)).sort());
});

// A07-B-108~111: 판에 적힌 값이 이상하면 아무도 안 받음 [지금 동작]
[
    { id: 'A07-B-108', label: '글자 "1"', value: '1' },
    { id: 'A07-B-109', label: '1.5', value: 1.5 },
    { id: 'A07-B-110', label: '−1', value: -1 },
    { id: 'A07-B-111', label: '없음', value: undefined },
].forEach(({ id, label, value }) => {
    test(`${id} 5명 판 판 값 ${label} → 전원 0, 묶음 null`, (t) => {
        const s = open(t, { n: 5, goldReward: value });
        assert.equal(execute(s, gf.firstOf(s, 'JOKER')).terminal?.winner, 'CITIZEN');
        for (const [uuid, gold] of goldByUuid(s)) assert.equal(gold, 0, uuid);
        assert.equal(buildGameGoldGrant(s), null);
    });
});
