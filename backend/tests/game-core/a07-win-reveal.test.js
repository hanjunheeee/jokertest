'use strict';

// 판 끝 직업 공개 순수 시험 — 끝난 판 공개 줄(사람마다 직업·팀·생사·죽은 이유·골드), MVP 없음, 끝나기 전엔 공개 없음
// 목록 A07-B-049~067 (docs/게임_의도_2026-11-15/시험목록/A07-승패-결과-골드.md)
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 막음
const gf = require('../audit-2026-11-09/gameFixtures');

const { core } = gf;

let seq = 0;
function open(t, opts) {
    gf.resetCore();
    t.after(() => gf.resetCore());
    seq += 1;
    const s = gf.startGame({ ...opts, id: `a07r-${seq}` });
    gf.toDay(s);
    return s;
}

const jokersOf = (s) => gf.byRole(s, 'JOKER');
const aliveOthers = (s) => gf.nonJokers(s).filter((u) => s.players.get(u).alive);

// 재판 유죄 처형 한 번 → 판정 확정 결과
function execute(s, uuid) {
    gf.toTribunal(s, uuid);
    const voters = [...s.players.values()].filter((p) => p.alive && p.uuid !== uuid).map((p) => p.uuid);
    for (const v of voters) assert.equal(core.submitTribunalVote(v, s.id, s.dayIndex, 'GUILTY').ok, true);
    const prepared = core.prepareTribunalVoteResolution(voters[0], s.id, s.dayIndex);
    assert.equal(prepared.ok, true, `재판 판정 준비 실패: ${prepared.code}`);
    return core.commitTribunalVoteResolution(prepared.session, prepared.resolution);
}

// 밤 한 번: 준 행동만 내고 나머지 행동자는 건너뛰기 → 판정 확정 (광대 2명 판은 둘 다 내야 판정됨)
function night(s, actions = {}) {
    for (const [actor, target] of Object.entries(actions)) {
        assert.equal(core.submitNightAction(actor, s.id, target).ok, true);
    }
    gf.skipAllNight(s);
    const prepared = core.prepareNightResolution([...s.players.keys()][0], s.id);
    assert.equal(prepared.ok, true, `밤 판정 준비 실패: ${prepared.code}`);
    const committed = core.commitNightResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true, `밤 확정 실패: ${committed.code}`);
    return committed;
}

// 광대를 하나씩 처형해 시민 승으로 끝냄 (사이 밤은 아무도 안 죽음)
function endCitizenWin(s) {
    const js = jokersOf(s).filter((u) => s.players.get(u).alive);
    js.forEach((j, i) => {
        const committed = execute(s, j);
        if (i < js.length - 1) {
            assert.equal(committed.terminal, null);
            night(s);
        } else {
            assert.equal(committed.terminal?.winner, 'CITIZEN');
        }
    });
    return core.buildTerminalFields(s).winResult;
}

// A07-B-049~054: 인원 5~10 → 공개 줄 수 = 인원, uuid 안 겹침
[5, 6, 7, 8, 9, 10].forEach((n, i) => {
    test(`A07-B-0${49 + i} ${n}명 판 끝 → 공개 줄 ${n}개, uuid 겹침 없음`, (t) => {
        const s = open(t, { n, jokerCount: n >= 8 ? 2 : 1 });
        const { reveals } = endCitizenWin(s);
        assert.equal(reveals.length, n);
        const uuids = new Set(reveals.map((r) => r.uuid));
        assert.equal(uuids.size, n);
        assert.deepEqual([...uuids].sort(), [...s.players.keys()].sort());
    });
});

test('A07-B-055 6명 판 공개 줄마다 uuid·닉네임·직업·팀·생사·죽은 이유·goldReward 칸', (t) => {
    const s = open(t, { n: 6 });
    const { reveals } = endCitizenWin(s);
    for (const row of reveals) {
        for (const key of ['uuid', 'nickname', 'role', 'team', 'alive', 'deathReason', 'goldReward']) {
            assert.ok(key in row, `${row.uuid} 줄에 ${key} 칸 없음`);
        }
        assert.equal(row.nickname, s.players.get(row.uuid).nickname);
        assert.equal(row.role, s.players.get(row.uuid).role);
    }
});

test('A07-B-056 7명 판 끝까지 산 사람 줄 → alive true, deathReason null', (t) => {
    const s = open(t, { n: 7 });
    const { reveals } = endCitizenWin(s);
    const survivors = reveals.filter((r) => s.players.get(r.uuid).alive);
    assert.equal(survivors.length, 6);
    for (const row of survivors) {
        assert.equal(row.alive, true);
        assert.equal(row.deathReason, null);
    }
});

// A07-B-057~061: 팀은 직업 편 (10명 판, 광대 2 = 직업 다섯 가지가 다 있음)
[
    { id: 'A07-B-057', role: 'JOKER', team: 'JOKER' },
    { id: 'A07-B-058', role: 'CITIZEN', team: 'CITIZEN' },
    { id: 'A07-B-059', role: 'DOCTOR', team: 'CITIZEN' },
    { id: 'A07-B-060', role: 'GUARD', team: 'CITIZEN' },
    { id: 'A07-B-061', role: 'WITCH_HUNTER', team: 'CITIZEN' },
].forEach(({ id, role, team }) => {
    test(`${id} 공개 줄 ${role} → 팀 ${team}`, (t) => {
        const s = open(t, { n: 10, jokerCount: 2 });
        const { reveals } = endCitizenWin(s);
        const rows = reveals.filter((r) => r.role === role);
        assert.ok(rows.length > 0, `${role} 줄 없음`);
        for (const row of rows) assert.equal(row.team, team);
    });
});

test('A07-B-062 8명 판 재판·밤 여러 번 뒤 끝 → winResult·공개 줄에 MVP 없음', (t) => {
    const s = open(t, { n: 8, jokerCount: 2 });
    const [j1, j2] = jokersOf(s);
    // 1일 시민 처형 → 밤 암살 → 2일 광대1 처형 → 밤 암살 → 3일 광대2 처형
    assert.equal(execute(s, aliveOthers(s)[0]).terminal, null);
    night(s, { [j1]: aliveOthers(s)[0] });
    assert.equal(execute(s, j1).terminal, null);
    night(s, { [j2]: aliveOthers(s)[0] });
    assert.equal(execute(s, j2).terminal?.winner, 'CITIZEN');
    const { winResult } = core.buildTerminalFields(s);
    assert.equal('mvp' in winResult, false);
    for (const key of Object.keys(winResult)) assert.doesNotMatch(key, /mvp/i);
    for (const row of winResult.reveals) {
        for (const key of Object.keys(row)) assert.doesNotMatch(key, /mvp/i, `${row.uuid} 줄에 ${key}`);
    }
});

test('A07-B-063 6명 판 진행 중 → 단계·생존 목록만, winResult 없음, 직업 칸 없음', (t) => {
    const s = open(t, { n: 6 });
    execute(s, aliveOthers(s)[0]);
    const fields = core.buildTerminalFields(s);
    assert.equal('winResult' in fields, false);
    assert.equal(fields.phase, s.phase);
    assert.equal(fields.players.length, 6);
    for (const p of fields.players) {
        assert.deepEqual(Object.keys(p).sort(), ['isAlive', 'uuid']);
    }
});

// A07-B-064~066: 죽은 이유 공개 (7명 판: 시민 처형 → 밤 암살 → 산 채로 나감·60초 탈락 → 광대 처형)
function deathReasonGame(t) {
    const s = open(t, { n: 7 });
    const joker = jokersOf(s)[0];
    const [executed, assassinated, left, timedOut] = gf.nonJokers(s);
    assert.equal(execute(s, executed).terminal, null);
    night(s, { [joker]: assassinated });
    assert.equal(core.commitParticipantDeparture(s, left, { reason: 'PLAYER_LEFT' }).ok, true);
    assert.equal(core.commitParticipantDeparture(s, timedOut, { reason: 'DISCONNECT_GRACE_EXPIRED' }).ok, true);
    assert.equal(execute(s, joker).terminal?.winner, 'CITIZEN');
    const byUuid = new Map(core.buildTerminalFields(s).winResult.reveals.map((r) => [r.uuid, r]));
    return { byUuid, executed, assassinated, left, timedOut, joker };
}

test('A07-B-064 재판 처형된 사람 → deathReason EXECUTION', (t) => {
    const g = deathReasonGame(t);
    assert.equal(g.byUuid.get(g.executed).deathReason, 'EXECUTION');
    assert.equal(g.byUuid.get(g.joker).deathReason, 'EXECUTION');
});

test('A07-B-065 밤 암살된 사람 → deathReason ASSASSINATION', (t) => {
    const g = deathReasonGame(t);
    assert.equal(g.byUuid.get(g.assassinated).deathReason, 'ASSASSINATION');
});

test('A07-B-066 산 채로 나간 사람·60초 탈락 → deathReason DISCONNECT', (t) => {
    const g = deathReasonGame(t);
    assert.equal(g.byUuid.get(g.left).deathReason, 'DISCONNECT');
    assert.equal(g.byUuid.get(g.timedOut).deathReason, 'DISCONNECT');
});

test('A07-B-067 10명 판 판 끝 방송용·스냅샷용 공개 값이 깊은 비교로 같음', (t) => {
    const s = open(t, { n: 10, jokerCount: 2 });
    endCitizenWin(s);
    const broadcast = core.buildTerminalFields(s).winResult;
    for (const uuid of s.players.keys()) {
        const snap = core.getSessionSnapshotForPlayer(uuid, s.id);
        assert.equal(snap.ok, true, `${uuid} 스냅샷 실패: ${snap.code}`);
        assert.deepEqual(snap.snapshot.winResult, broadcast);
    }
    // 같은 판을 다시 만들어도 같음
    assert.deepEqual(core.buildTerminalFields(s).winResult, broadcast);
});
