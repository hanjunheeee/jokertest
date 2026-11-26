'use strict';

// A05b 낮 시작 공개 값 만들기 시험 — 밤 판정 뒤 모두에게 갈 희생자·사망 공개 값을 판 규칙만으로 봄 (doctorSaved 칸은 안 실림, 2026-11-18)
// 목록 A05-B-501~531 (docs/게임_의도_2026-11-15/시험목록/A05b-밤-알림-낮연출.md B-1), 돌리기: node --test tests/game-core/a05b-dawn-payload.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// gameFixtures가 맨 위에서 DB 주소를 막음 (판 코드를 불러도 DB에 안 붙게)
const gf = require('../audit-2026-11-09/gameFixtures');

const core = gf.core;

// 판 하나: 직업은 randomFn 0으로 늘 같게, 첫 낮 → 밤 (판 id는 시험마다 다르게)
function nightGame({ id, n, jokerCount, roleCounts }) {
    gf.resetCore();
    const s = gf.startGame({ id, n, jokerCount, roleCounts });
    gf.toDay(s);
    gf.toNight(s);
    return s;
}

// 밤 한 번을 차례대로 돌림: 직업마다 고른 대상 내고(안 적은 사람은 마감 때처럼 건너뛰기) 그 차례 닫기
// picks = { 낸 사람 uuid: 대상 uuid | null }, hold = 안 낸 채 둘 사람(마감에 건너뛰기로 채움), after = { 직업: 그 차례 닫은 뒤 할 일 }
// 돌려줌: 밤 끝에 모두에게 가는 공개 값 (밤 마무리가 보내는 night_result_applied와 같은 재료로 만듦)
function runNight(s, picks = {}, { hold = [], after = {} } = {}) {
    core.markNightSequenced(s);
    for (const role of core.NIGHT_TURN_ORDER) {
        const actors = core.getAliveActorUuidsForRole(s, role);
        // 먼저 낸 사람
        for (const uuid of actors) {
            if (!(uuid in picks) || hold.includes(uuid)) continue;
            const r = core.submitNightAction(uuid, s.id, picks[uuid]);
            assert.equal(r.ok, true, `밤 제출 거절(${uuid}): ${r.code}`);
        }
        // 마감: 안 낸 사람은 건너뛰기로 채움 (서버 마감과 같은 처리)
        for (const uuid of actors) {
            if (!s.nightActions.has(uuid)) core.submitNightAction(uuid, s.id, null);
        }
        const done = core.completeNightRole(s, role);
        assert.equal(done.ok, true, `${role} 차례 닫기 실패: ${done.code}`);
        if (after[role]) after[role]();
    }
    const prepared = core.prepareNightResolutionForSession(s);
    assert.equal(prepared.ok, true, `밤 판정 준비 실패: ${prepared.code}`);
    const committed = core.commitNightResolution(prepared.session, prepared.resolution);
    assert.equal(committed.ok, true, `밤 확정 실패: ${committed.code}`);
    return core.buildNightResultAppliedPayload(
        s, committed.victimUuid, prepared.resolution.publicDeathReveals);
}

// 판 안에서 나가기 (화면의 게임 나가기와 같은 판 규칙 길)
function leave(s, uuid) {
    const r = core.commitParticipantDeparture(s, uuid, { reason: 'PLAYER_LEFT' });
    assert.equal(r.ok, true, `나가기 실패: ${r.code}`);
}

const citizens = (s) => gf.byRole(s, 'CITIZEN');

// 값 안 어디든 그 글자가 있나 (칸 이름이든 값이든) — 사람 목록 칸은 빼고 볼 때 omit 씀
function mentions(value, needle, omit = []) {
    const copy = { ...value };
    for (const key of omit) delete copy[key];
    return JSON.stringify(copy).includes(needle);
}

// 값 안 모든 칸 이름 모으기 (깊이 끝까지)
function allKeys(value, out = new Set()) {
    if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
    else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) { out.add(k); allKeys(v, out); }
    }
    return out;
}

// ---------- A05-B-501~506 광대가 A를 죽이고 아무도 못 살림 ----------
for (const [no, n] of [[501, 5], [502, 6], [503, 7], [504, 8], [505, 9], [506, 10]]) {
    test(`A05-B-${no} ${n}명 판: 광대가 A를 죽이고 못 살림 → 희생자 A, 사망 공개 [A·광대], doctorSaved 칸 없음`, () => {
        const s = nightGame({ id: `b${no}`, n });
        const [a, other] = citizens(s);
        const picks = { [gf.firstOf(s, 'JOKER')]: a };
        // 의사가 있으면 다른 사람을 지킴
        const doctor = gf.firstOf(s, 'DOCTOR');
        if (doctor) picks[doctor] = other;
        const payload = runNight(s, picks);
        assert.equal(payload.victimUuid, a);
        assert.deepEqual(payload.deathReveals, [{ victimUuid: a, source: 'JOKER' }]);
        assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
    });
}

// ---------- A05-B-507~511 의사가 광대 대상을 지킴 ----------
for (const [no, n] of [[507, 6], [508, 7], [509, 8], [510, 9], [511, 10]]) {
    test(`A05-B-${no} ${n}명 판: 의사가 광대 대상을 지킴 → 희생자 없음, 사망 공개 [], doctorSaved 칸 없음`, () => {
        const s = nightGame({ id: `b${no}`, n });
        const [a] = citizens(s);
        const payload = runNight(s, { [gf.firstOf(s, 'JOKER')]: a, [gf.firstOf(s, 'DOCTOR')]: a });
        assert.equal(payload.victimUuid, null);
        assert.deepEqual(payload.deathReveals, []);
        assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
    });
}

test('A05-B-512 7명 판: 광대가 의사를 노리고 의사가 자기를 지킴 → 희생자 없음, doctorSaved 칸 없음', () => {
    const s = nightGame({ id: 'b512', n: 7 });
    const doctor = gf.firstOf(s, 'DOCTOR');
    const payload = runNight(s, { [gf.firstOf(s, 'JOKER')]: doctor, [doctor]: doctor });
    assert.equal(payload.victimUuid, null);
    assert.deepEqual(payload.deathReveals, []);
    assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
});

test('A05-B-513 8명 판 광대 2: 광대 둘이 다른 사람을 고름 → 희생자 없음, doctorSaved 칸 없음', () => {
    const s = nightGame({ id: 'b513', n: 8, jokerCount: 2 });
    const [j1, j2] = gf.byRole(s, 'JOKER');
    const [a, b] = citizens(s);
    const payload = runNight(s, { [j1]: a, [j2]: b });
    assert.equal(payload.victimUuid, null);
    assert.deepEqual(payload.deathReveals, []);
    assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
});

test('A05-B-514 8명 판 광대 2: 광대 둘 다른 대상 + 의사가 그중 하나를 지킴 → 희생자 없음, doctorSaved 칸 없음', () => {
    const s = nightGame({ id: 'b514', n: 8, jokerCount: 2 });
    const [j1, j2] = gf.byRole(s, 'JOKER');
    const [a, b] = citizens(s);
    const payload = runNight(s, { [j1]: a, [j2]: b, [gf.firstOf(s, 'DOCTOR')]: a });
    assert.equal(payload.victimUuid, null);
    assert.deepEqual(payload.deathReveals, []);
    assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
});

test('A05-B-515 6명 판: 광대가 건너뛰고 의사가 누군가 지킴 → 희생자 없음, doctorSaved 칸 없음', () => {
    const s = nightGame({ id: 'b515', n: 6 });
    const [a] = citizens(s);
    const payload = runNight(s, { [gf.firstOf(s, 'JOKER')]: null, [gf.firstOf(s, 'DOCTOR')]: a });
    assert.equal(payload.victimUuid, null);
    assert.deepEqual(payload.deathReveals, []);
    assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
});

test('A05-B-516 7명 판: 광대가 안 내고 시간 끝(건너뛰기로 채움) + 의사가 지킴 → 희생자 없음, doctorSaved 칸 없음', () => {
    const s = nightGame({ id: 'b516', n: 7 });
    const joker = gf.firstOf(s, 'JOKER');
    const [a] = citizens(s);
    const payload = runNight(s, { [joker]: a, [gf.firstOf(s, 'DOCTOR')]: a }, { hold: [joker] });
    assert.equal(payload.victimUuid, null);
    assert.deepEqual(payload.deathReveals, []);
    assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
});

test('A05-B-517 10명 판 의사 2: 의사 둘이 다른 사람을 지킴 → 못 살림, 희생자 A, doctorSaved 칸 없음', () => {
    const s = nightGame({ id: 'b517', n: 10, roleCounts: { JOKER: 1, DOCTOR: 2 } });
    const [d1, d2] = gf.byRole(s, 'DOCTOR');
    const [a, b] = citizens(s);
    const payload = runNight(s, { [gf.firstOf(s, 'JOKER')]: a, [d1]: a, [d2]: b });
    assert.equal(payload.victimUuid, a);
    assert.deepEqual(payload.deathReveals, [{ victimUuid: a, source: 'JOKER' }]);
    assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
});

test('A05-B-518 10명 판 의사 2: 의사 둘이 광대 대상을 같이 지킴 → 희생자 없음, doctorSaved 칸 없음', () => {
    const s = nightGame({ id: 'b518', n: 10, roleCounts: { JOKER: 1, DOCTOR: 2 } });
    const [d1, d2] = gf.byRole(s, 'DOCTOR');
    const [a] = citizens(s);
    const payload = runNight(s, { [gf.firstOf(s, 'JOKER')]: a, [d1]: a, [d2]: a });
    assert.equal(payload.victimUuid, null);
    assert.deepEqual(payload.deathReveals, []);
    assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
});

test('A05-B-519 9명 판 의사 2: 의사1 건너뜀, 의사2가 광대 대상 지킴 → doctorSaved 칸 없음', () => {
    const s = nightGame({ id: 'b519', n: 9, roleCounts: { JOKER: 1, DOCTOR: 2 } });
    const [d1, d2] = gf.byRole(s, 'DOCTOR');
    const [a] = citizens(s);
    const payload = runNight(s, { [gf.firstOf(s, 'JOKER')]: a, [d1]: null, [d2]: a });
    assert.equal(payload.victimUuid, null);
    assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
});

test('A05-B-520 8명 판 광대 2: 광대 둘이 같은 대상 + 의사가 그 사람을 지킴 → doctorSaved 칸 없음', () => {
    const s = nightGame({ id: 'b520', n: 8, jokerCount: 2 });
    const [j1, j2] = gf.byRole(s, 'JOKER');
    const [a] = citizens(s);
    const payload = runNight(s, { [j1]: a, [j2]: a, [gf.firstOf(s, 'DOCTOR')]: a });
    assert.equal(payload.victimUuid, null);
    assert.deepEqual(payload.deathReveals, []);
    assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
});

test('A05-B-521 7명 판: 광대 대상이 밤 끝나기 전에 나감 → 희생자 없음, doctorSaved 칸 없음', () => {
    const s = nightGame({ id: 'b521', n: 7 });
    const [a] = citizens(s);
    // 광대 차례가 닫힌 뒤(아직 밤) A가 나감
    const payload = runNight(s, { [gf.firstOf(s, 'JOKER')]: a }, { after: { JOKER: () => leave(s, a) } });
    assert.equal(payload.victimUuid, null);
    assert.deepEqual(payload.deathReveals, []);
    assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
});

test('A05-B-522 [지금 동작] 6명 판: 의사가 지킨 광대 대상이 밤 중 나감 → doctorSaved 칸 없음', () => {
    const s = nightGame({ id: 'b522', n: 6 });
    const [a] = citizens(s);
    // 의사 차례까지 닫힌 뒤(아직 밤) A가 나감
    const payload = runNight(
        s,
        { [gf.firstOf(s, 'JOKER')]: a, [gf.firstOf(s, 'DOCTOR')]: a },
        { after: { DOCTOR: () => leave(s, a) } },
    );
    assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
});

// ---------- A05-B-523~528 공개 값에 직업이 안 실림 ----------
for (const [no, n] of [[523, 5], [524, 6], [525, 7], [526, 8], [527, 9], [528, 10]]) {
    test(`A05-B-${no} ${n}명 판 광대 암살 밤: 공개 값 어디에도 직업 칸 없음, 사람 목록은 uuid·생사만, 사망 공개는 uuid·원인만`, () => {
        const s = nightGame({ id: `b${no}`, n });
        const [a] = citizens(s);
        const payload = runNight(s, { [gf.firstOf(s, 'JOKER')]: a });
        assert.equal(allKeys(payload).has('role'), false);
        for (const p of payload.players) assert.deepEqual(Object.keys(p).sort(), ['alive', 'uuid']);
        assert.equal(payload.deathReveals.length, 1);
        for (const d of payload.deathReveals) assert.deepEqual(Object.keys(d).sort(), ['source', 'victimUuid']);
        // 직업 이름이 값으로도 안 들어감 (원인 칸 JOKER는 "광대가 죽였다"는 뜻이라 사망 공개만 허용)
        for (const name of ['DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN']) {
            assert.equal(JSON.stringify(payload).includes(name), false, `${name}이 공개 값에 실림`);
        }
    });
}

test('A05-B-529 7명 판: 의사가 살렸을 때 공개 값 어디에도 공격받은 A uuid 없음 (희생자 null, 사망 공개 [])', () => {
    const s = nightGame({ id: 'b529', n: 7 });
    const [a] = citizens(s);
    const payload = runNight(s, { [gf.firstOf(s, 'JOKER')]: a, [gf.firstOf(s, 'DOCTOR')]: a });
    assert.equal(payload.victimUuid, null);
    assert.deepEqual(payload.deathReveals, []);
    // 사람 목록은 모두 실리니 빼고 봄, 목록 안 A 칸도 다른 사람과 같은 모양
    assert.equal(mentions(payload, a, ['players']), false);
    assert.deepEqual(payload.players.find((p) => p.uuid === a), { uuid: a, alive: true });
});

test('A05-B-530 10명 판 둘째 밤: 경비원 조사 대상 B·마녀사냥꾼 확인 대상 C가 공개 값에 대상으로 안 실림', () => {
    const s = nightGame({ id: 'b530', n: 10 });
    const joker = gf.firstOf(s, 'JOKER');
    const [c, b, d] = citizens(s);
    // 첫 밤: 광대가 C를 죽임 (마녀사냥꾼이 둘째 밤에 확인할 죽은 사람)
    runNight(s, { [joker]: c });
    gf.toNight(s);
    const payload = runNight(s, {
        [joker]: d,
        [gf.firstOf(s, 'GUARD')]: b,
        [gf.firstOf(s, 'WITCH_HUNTER')]: c,
    });
    assert.equal(mentions(payload, b, ['players']), false);
    assert.equal(mentions(payload, c, ['players']), false);
    // C는 사람 목록 생사로만
    assert.deepEqual(payload.players.find((p) => p.uuid === c), { uuid: c, alive: false });
});

test('A05-B-531 6명 판: 의사가 광대 대상 아닌 B를 지킴 → 희생자 A, doctorSaved 칸 없음, B는 대상으로 안 실림', () => {
    const s = nightGame({ id: 'b531', n: 6 });
    const [a, b] = citizens(s);
    const payload = runNight(s, { [gf.firstOf(s, 'JOKER')]: a, [gf.firstOf(s, 'DOCTOR')]: b });
    assert.equal(payload.victimUuid, a);
    assert.equal(Object.hasOwn(payload, 'doctorSaved'), false);
    assert.equal(mentions(payload, b, ['players']), false);
});

// ---------- A05-B-705 아무도 안 죽은 밤은 의사가 살렸든 광대가 안 죽였든 같은 값 (사용자 결정 2026-11-18) ----------
test('A05-B-705 7명 판: 의사가 살린 밤과 광대가 건너뛴 밤의 공개 값이 똑같음 (값으로도 못 가림)', () => {
    // 같은 판 id·같은 사람 수로 두 번 차려 한 번은 의사가 살리고, 한 번은 광대가 건너뜀
    const play = (jokerPick) => {
        const s = nightGame({ id: 'b705', n: 7 });
        const [a] = citizens(s);
        return runNight(s, { [gf.firstOf(s, 'JOKER')]: jokerPick(a), [gf.firstOf(s, 'DOCTOR')]: a });
    };
    const saved = play((a) => a);
    const skipped = play(() => null);
    assert.equal(Object.hasOwn(saved, 'doctorSaved'), false);
    // 판 id는 차릴 때마다 번호가 붙어 다르니 빼고 봄
    const withoutGameId = (p) => { const copy = { ...p }; delete copy.gameId; return copy; };
    assert.deepEqual(withoutGameId(saved), withoutGameId(skipped));
});
