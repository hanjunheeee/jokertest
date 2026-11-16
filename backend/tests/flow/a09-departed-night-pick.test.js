'use strict';

// 밤 고름을 낸 뒤 그 직업 차례가 열려 있는 동안 판에서 빠진 사람 흐름 시험 — 스스로 나가도, 끊겨 60초 탈락이어도 이미 낸 고름은 남음
// 목록 docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md A09-B-332~338, 돌리기: node --env-file=.env.test --test tests/flow/a09-departed-night-pick.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const H = require('./a09-grace-harness');

// 밤 차례 120초 (끊김 60초 탈락이 차례가 열려 있는 동안 오게)
const LONG_NIGHT = { nightActionTime: 120 };

// 지금 열린 밤 차례 직업
const turnOf = (w) => H.core.getCurrentNightTurnRole(w.session);

// 그 사람이 받은 마지막 밤 결과
const dawnOf = (w, uuid) => w.got(uuid, 'night_result_applied').at(-1);

// 밤 고름 내기 (받아야 함)
async function pick(w, actor, target) {
    const reply = await w.night(actor, target);
    assert.equal(reply.ok, true, `밤 고르기 거절(${reply.code}) (준비 잘못)`);
}

// ── 의사: 보호를 고른 의사가 빠져도 보호는 남음 (사용자 결정 2026-11-16 아침 3번) ──
test('A09-B-332 6명 판 의사 1: 의사가 A 보호를 고르고 5초 당김 중(2초 뒤) 스스로 나감 → 광대 대상 A는 삶, 밤 결과 죽은 사람 없음', async (t) => {
    const w = H.setup(t, { id: 'a09dp332', n: 6, roleCounts: { JOKER: 1, DOCTOR: 1 } });
    w.toDay();
    await w.toNight();
    const a = w.byRole('CITIZEN')[0];
    await pick(w, w.firstOf('JOKER'), a);
    await w.untilTurn('DOCTOR');
    const doctor = w.firstOf('DOCTOR');
    await pick(w, doctor, a);
    w.advance(2_000);
    assert.equal(turnOf(w), 'DOCTOR', '의사 차례가 벌써 닫힘 (준비 잘못)');
    assert.equal((await w.leave(doctor)).ok, true);
    assert.equal(w.isAlive(doctor), false);
    await w.quickNight();
    const applied = dawnOf(w, a);
    assert.ok(applied, '밤 결과 알림 없음');
    assert.equal(applied.victimUuid, null);
    assert.equal(applied.doctorSaved, true);
    assert.equal(w.isAlive(a), true);
});

test('A09-B-333 10명 판 의사 2 (차례 120초): 의사1이 A 보호를 고르고 끊김 → 의사 차례 안에 60초 탈락 → 의사2는 건너뜀 → 광대 대상 A는 삶', async (t) => {
    const w = H.setup(t, { id: 'a09dp333', n: 10, roleCounts: { JOKER: 1, DOCTOR: 2 }, settings: LONG_NIGHT });
    w.toDay();
    await w.toNight();
    const a = w.byRole('CITIZEN')[0];
    await pick(w, w.firstOf('JOKER'), a);
    await w.untilTurn('DOCTOR');
    const [d1, d2] = w.byRole('DOCTOR');
    await pick(w, d1, a);
    const at = w.now();
    await w.disconnect(d1);
    w.advanceTo(at + 60_000);
    assert.equal(w.isAlive(d1), false, '의사1이 탈락 안 함 (준비 잘못)');
    assert.equal(turnOf(w), 'DOCTOR', '의사 차례가 벌써 닫힘 (준비 잘못)');
    await pick(w, d2, null);
    await w.quickNight();
    const applied = dawnOf(w, a);
    assert.ok(applied, '밤 결과 알림 없음');
    assert.equal(applied.victimUuid, null);
    assert.equal(w.isAlive(a), true);
});

// ── 광대: 암살을 고른 광대가 빠져도 그 암살은 남음 (사용자 결정 2026-11-16 낮 6번) ──
test('A09-B-334 8명 판 광대 2: 광대1만 X를 고르고 스스로 나감 → 광대2는 안 고른 채 차례 마감 → X 죽음', async (t) => {
    const w = H.setup(t, { id: 'a09dp334', n: 8, roleCounts: { JOKER: 2 } });
    w.toDay();
    await w.toNight();
    const [j1, j2] = w.byRole('JOKER');
    const x = w.byRole('CITIZEN')[0];
    await pick(w, j1, x);
    assert.equal((await w.leave(j1)).ok, true);
    assert.equal(turnOf(w), 'JOKER', '광대 차례가 벌써 닫힘 (준비 잘못)');
    w.advanceUntil(() => w.session.phase !== 'NIGHT');
    assert.equal(dawnOf(w, j2)?.victimUuid, x);
    assert.equal(w.isAlive(x), false);
});

test('A09-B-335 8명 판 광대 2 (차례 120초): 광대1이 X를 고르고 끊겨 60초 탈락 → 광대2도 X → 5초 뒤 닫히고 X 죽음', async (t) => {
    const w = H.setup(t, { id: 'a09dp335', n: 8, roleCounts: { JOKER: 2 }, settings: LONG_NIGHT });
    w.toDay();
    await w.toNight();
    const [j1, j2] = w.byRole('JOKER');
    const x = w.byRole('CITIZEN')[0];
    await pick(w, j1, x);
    const at = w.now();
    await w.disconnect(j1);
    w.advanceTo(at + 60_000);
    assert.equal(w.isAlive(j1), false, '광대1이 탈락 안 함 (준비 잘못)');
    assert.equal(turnOf(w), 'JOKER', '광대 차례가 벌써 닫힘 (준비 잘못)');
    const pickedAt = w.now();
    await pick(w, j2, x);
    // 남은 광대가 다 냈으니 그때부터 5초 뒤 닫힘
    assert.equal(w.got(j2, 'phase_settle_started').filter((p) => p.role === 'JOKER').at(-1)?.deadline, pickedAt + 5_000);
    w.advanceUntil(() => w.session.phase !== 'NIGHT');
    assert.equal(dawnOf(w, j2)?.victimUuid, x);
});

// 둘 다 살아서 서로 다른 사람을 골랐을 때와 같은 규칙: 1:1이면 아무도 안 죽음
test('A09-B-336 8명 판 광대 2 (차례 120초): 광대1이 X를 고르고 끊겨 60초 탈락 → 광대2는 Y → 1:1이라 그 밤 죽은 사람 없음', async (t) => {
    const w = H.setup(t, { id: 'a09dp336', n: 8, roleCounts: { JOKER: 2 }, settings: LONG_NIGHT });
    w.toDay();
    await w.toNight();
    const [j1, j2] = w.byRole('JOKER');
    const [x, y] = w.byRole('CITIZEN');
    await pick(w, j1, x);
    const at = w.now();
    await w.disconnect(j1);
    w.advanceTo(at + 60_000);
    assert.equal(w.isAlive(j1), false, '광대1이 탈락 안 함 (준비 잘못)');
    await pick(w, j2, y);
    w.advanceUntil(() => w.session.phase !== 'NIGHT');
    assert.equal(dawnOf(w, j2)?.victimUuid, null);
    assert.equal(w.isAlive(x), true);
    assert.equal(w.isAlive(y), true);
});

// ── 지키기: 빠진 사람이 남긴 고름이 다른 사람에게 새지 않음 ──
test('A09-B-337 8명 판 광대 2: 광대1이 X를 고르고 나간 뒤 남은 사람 스냅샷·알림에 X가 누구의 대상인지 없음', async (t) => {
    const w = H.setup(t, { id: 'a09dp337', n: 8, roleCounts: { JOKER: 2 } });
    w.toDay();
    await w.toNight();
    const [j1, j2] = w.byRole('JOKER');
    const [x, watcher] = w.byRole('CITIZEN');
    await pick(w, j1, x);
    assert.equal((await w.leave(j1)).ok, true);
    for (const uuid of [j2, watcher, x]) {
        const snap = await w.snapshot(uuid);
        assert.equal(snap.ok, true);
        // 밤이 안 끝났으니 밤 결과 칸도, 누가 누구를 골랐는지 담은 칸도 없음 (밤은 낸 사람 수도 숨김)
        assert.equal(Object.hasOwn(snap, 'nightResult'), false, `${uuid} 스냅샷에 밤 결과`);
        assert.equal(JSON.stringify(snap).includes('targetId'), false, `${uuid} 스냅샷에 대상 칸`);
        assert.deepEqual(snap.progress, { kind: 'NIGHT', doneCount: null, requiredCount: null });
        assert.equal(snap.self.hasActedThisPhase, false, `${uuid} 스냅샷에 낸 것으로 나옴`);
        // 나간 뒤 온 알림(탈락·참여 바뀜·내 제출 상태)에 대상 칸 없음
        for (const event of ['player_eliminated', 'session_participation_changed', 'session_self_progress']) {
            for (const payload of w.got(uuid, event)) {
                assert.equal(JSON.stringify(payload).includes('targetId'), false, `${uuid} ${event}에 대상 칸`);
            }
        }
    }
});

// ── 지키기: 빠진 사람을 고른 남의 고름은 빈 값 — 빠진 사람이 남긴 고름도 똑같이 ──
test('A09-B-338 8명 판 광대 2: 광대1이 X를 고르고 나간 뒤 X도 나감 → 광대2는 안 고름 → 그 밤 죽은 사람 없음', async (t) => {
    const w = H.setup(t, { id: 'a09dp338', n: 8, roleCounts: { JOKER: 2 } });
    w.toDay();
    await w.toNight();
    const [j1, j2] = w.byRole('JOKER');
    const x = w.byRole('CITIZEN')[0];
    await pick(w, j1, x);
    assert.equal((await w.leave(j1)).ok, true);
    assert.equal((await w.leave(x)).ok, true);
    w.advanceUntil(() => w.session.phase !== 'NIGHT');
    const applied = dawnOf(w, j2);
    assert.ok(applied, '밤 결과 알림 없음');
    assert.equal(applied.victimUuid, null);
    assert.deepEqual(applied.deathReveals, []);
});
