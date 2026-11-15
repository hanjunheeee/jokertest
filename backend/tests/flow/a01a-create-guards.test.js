'use strict';

// 점검·탈주 거절 시험 — 점검 중 방 만들기·시작 거절, 예고만·끈 뒤엔 됨, 방 안 행동은 됨, 시작 시각에 대기방 닫힘, 탈주 대기 글·경계·몇 번째
// 목록 A01-B-098~112 (docs/게임_의도_2026-11-15/시험목록/A01a-방만들기-설정-시작.md "점검·탈주 거절"), 돌리기: node --env-file=.env.test --test tests/flow/a01a-create-guards.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { makeWorld } = require('./a01a-world');

const MINUTE = 60_000;
// 가짜 "지금": 2026-11-16 12:00 (한국 시간), 그날 탈주 횟수가 자정에 안 걸리게 한낮
const NOON_KST = Date.UTC(2026, 10, 16, 3, 0, 0);

// Date.now를 정한 시각으로 (탈주 막힘 끝·남은 시간이 이 시계를 봄)
function fixNow(t, start = NOON_KST) {
    let now = start;
    t.mock.method(Date, 'now', () => now);
    return { set: (ms) => { now = ms; }, get: () => now };
}

// 탈주 한 번 적기 (가짜 저장소라 DB 안 감), 그 판 id·탈주 시각
async function desert(w, uuid, gameId, desertedAt) {
    const r = await w.desertion.recordDesertion({ userId: uuid, gameId, reason: 'LEFT_ALIVE', desertedAt });
    assert.equal(r.ok, true, `탈주 적기 실패: ${r.code}`);
    return r;
}

// ── 점검 ──
test('A01-B-098 점검 켜짐·시작 시각 지남 → { ok:false, code:MAINTENANCE, message, endsAt }, 방 없음', async (t) => {
    const w = makeWorld(t);
    const endsAt = new Date(Date.now() + 60 * MINUTE);
    w.maintenance.__setStateForTests({ enabled: true, message: '점검 안내', startsAt: new Date(Date.now() - MINUTE), endsAt });
    w.connect('maker');
    const reply = await w.create('maker');
    assert.deepEqual(reply, { ok: false, code: 'MAINTENANCE', message: '점검 안내', endsAt: endsAt.toISOString() });
    assert.equal(await w.currentRoom('maker'), null);
});

test('A01-B-099 점검 켜짐·시작 시각 10분 뒤 → 방 만들어짐', async (t) => {
    const w = makeWorld(t);
    w.maintenance.__setStateForTests({ enabled: true, startsAt: new Date(Date.now() + 10 * MINUTE) });
    w.connect('maker');
    const reply = await w.create('maker');
    assert.equal(reply.ok, true, reply.message);
});

test('A01-B-100 점검 글 비움 → "서버 점검 중입니다. 점검이 끝난 뒤 다시 시도해주세요."', async (t) => {
    const w = makeWorld(t);
    w.maintenance.__setStateForTests({ enabled: true, message: '', startsAt: new Date(Date.now() - MINUTE) });
    w.connect('maker');
    const reply = await w.create('maker');
    assert.equal(reply.code, 'MAINTENANCE');
    assert.equal(reply.message, '서버 점검 중입니다. 점검이 끝난 뒤 다시 시도해주세요.');
});

test('A01-B-101 점검 켬 → 끔 → 방 만들어짐', async (t) => {
    const w = makeWorld(t);
    w.connect('maker');
    w.maintenance.__setStateForTests({ enabled: true, startsAt: new Date(Date.now() - MINUTE) });
    assert.equal((await w.create('maker')).code, 'MAINTENANCE');
    w.maintenance.__setStateForTests({ enabled: false });
    const reply = await w.create('maker');
    assert.equal(reply.ok, true, reply.message);
});

test('A01-B-102 5명 전원 준비 방, 점검 켬 → start_game MAINTENANCE, 방 그대로, 판 없음', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b102', n: 5 });
    w.maintenance.__setStateForTests({ enabled: true, startsAt: new Date(Date.now() - MINUTE) });
    const reply = await w.start(room.host);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'MAINTENANCE');
    assert.equal(w.nobodyStarted(room.uuids), true);
    for (const uuid of room.uuids) assert.equal((await w.currentRoom(uuid))?.roomId, room.roomId, `${uuid} 방에서 빠짐`);
});

test('A01-B-103 5명 방 점검 켬 → set_ready 됨', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b103', n: 5, readyAll: false });
    w.maintenance.__setStateForTests({ enabled: true, startsAt: new Date(Date.now() - MINUTE) });
    const reply = await w.ready(room.guests[0], true);
    assert.equal(reply.ok, true, reply.message);
    const me = (await w.currentRoom(room.host)).players.find((p) => p.uuid === room.guests[0]);
    assert.equal(me.isReady, true);
});

test('A01-B-104 5명 방 점검 켬 → 방장 update_room_settings 됨', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b104', n: 5, readyAll: false });
    w.maintenance.__setStateForTests({ enabled: true, startsAt: new Date(Date.now() - MINUTE) });
    const reply = await w.update(room.host, { maxPlayers: 8 });
    assert.equal(reply.ok, true, reply.message);
    assert.equal(reply.changed, true);
    assert.equal((await w.currentRoom(room.host)).settings.maxPlayers, 8);
});

test('A01-B-105 5명 대기방, 점검 시작 시각 지남 → 다섯 사람 room_deleted + 점검 글, get_current_room 없음', async (t) => {
    const w = makeWorld(t);
    const room = await w.openRoom({ prefix: 'b105', n: 5, readyAll: false });
    const clock = w.gf.fakeClock(Date.now());
    const { createMaintenanceClock } = require('../../services/ops/maintenanceClock');
    const mClock = createMaintenanceClock({
        setTimeoutFn: clock.setTimeoutFn, clearTimeoutFn: clock.clearTimeoutFn, nowFn: clock.nowFn, getIo: () => w.io,
    });
    t.after(() => mClock.stop());
    // 시작 시각 1초 뒤로 점검 예고 → 시계 맞춤 → 1초 지남
    w.maintenance.__setStateForTests({ enabled: true, message: '오전 점검', startsAt: new Date(clock.now() + 1000) });
    mClock.sync(w.maintenance.getMaintenanceState(), clock.now());
    for (const uuid of room.uuids) assert.equal(w.received(uuid, 'room_deleted').length, 0, '시작 시각 전에 방이 닫힘');
    clock.advance(1000);
    for (const uuid of room.uuids) {
        const deleted = w.received(uuid, 'room_deleted');
        assert.equal(deleted.length, 1, `${uuid}가 room_deleted를 못 받음`);
        assert.equal(deleted[0].code, 'MAINTENANCE');
        assert.equal(deleted[0].message, '오전 점검');
        assert.equal(await w.currentRoom(uuid), null, `${uuid}에게 방이 남음`);
    }
});

// ── 탈주 ──
test('A01-B-106 막힘 남은 299초 → DESERTION_COOLDOWN·"탈주로 4분 59초 뒤에 참여할 수 있습니다."·retryAfterMs 299000·blockedUntil, 방 없음', async (t) => {
    const w = makeWorld(t);
    fixNow(t);
    w.connect('runner');
    await desert(w, 'runner', 'g-106', NOON_KST - 1000); // 5분 막힘 중 1초 지남
    const reply = await w.create('runner');
    assert.deepEqual(reply, {
        ok: false,
        code: 'DESERTION_COOLDOWN',
        message: '탈주로 4분 59초 뒤에 참여할 수 있습니다.',
        retryAfterMs: 299000,
        blockedUntil: new Date(NOON_KST + 299000).toISOString(),
    });
    assert.equal(await w.currentRoom('runner'), null);
});

test('A01-B-107 막힘 끝 1ms 전 → 거절, 글 "탈주로 1초 뒤에…"', async (t) => {
    const w = makeWorld(t);
    const clock = fixNow(t);
    w.connect('runner');
    await desert(w, 'runner', 'g-107', NOON_KST);
    clock.set(NOON_KST + 5 * MINUTE - 1);
    const reply = await w.create('runner');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'DESERTION_COOLDOWN');
    assert.equal(reply.message, '탈주로 1초 뒤에 참여할 수 있습니다.');
});

test('A01-B-108 막힘 끝 지남 → 방 만들어짐', async (t) => {
    const w = makeWorld(t);
    const clock = fixNow(t);
    w.connect('runner');
    await desert(w, 'runner', 'g-108', NOON_KST);
    clock.set(NOON_KST + 5 * MINUTE + 1);
    const reply = await w.create('runner');
    assert.equal(reply.ok, true, reply.message);
});

// 그날 n번째 탈주 바로 뒤 방 만들기 글
const NTH_CASES = [
    ['A01-B-109', 1, '탈주로 5분 0초 뒤에 참여할 수 있습니다.'],
    ['A01-B-110', 2, '탈주로 30분 0초 뒤에 참여할 수 있습니다.'],
    ['A01-B-111', 3, '탈주로 24시간 0분 0초 뒤에 참여할 수 있습니다.'],
];
for (const [no, nth, text] of NTH_CASES) {
    test(`${no} 그날 ${nth}번째 탈주 바로 뒤 create_room → "${text}"`, async (t) => {
        const w = makeWorld(t);
        fixNow(t);
        w.connect('runner');
        // 앞선 탈주는 1분 간격으로 앞에, 마지막 탈주는 지금
        for (let i = 1; i <= nth; i += 1) await desert(w, 'runner', `g-${no}-${i}`, NOON_KST - (nth - i) * MINUTE);
        const reply = await w.create('runner');
        assert.equal(reply.ok, false);
        assert.equal(reply.code, 'DESERTION_COOLDOWN');
        assert.equal(reply.message, text);
    });
}

test('A01-B-112 [지금 동작] 점검 켜짐 + 탈주 막힘 → MAINTENANCE가 먼저', async (t) => {
    const w = makeWorld(t);
    fixNow(t);
    w.connect('runner');
    await desert(w, 'runner', 'g-112', NOON_KST);
    // 점검은 진짜 시계(new Date)로 보니 시작 시각을 아주 옛날로 (가짜 지금과 안 엇갈리게)
    w.maintenance.__setStateForTests({ enabled: true, startsAt: new Date('2000-01-01T00:00:00Z') });
    const reply = await w.create('runner');
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'MAINTENANCE');
});
