'use strict';

// 탈주 대기 서버 흐름 시험 — 다섯 길 같은 거절·풀림, 5분·30분·1일 경계, 한국 자정에 횟수 0, 같은 판 한 번, 저장소 실패·켤 때 읽기
// 목록 A09-B-251~291 (docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md), 돌리기: node --env-file=.env.test --test tests/flow/a09-desertion-block.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const h = require('./a09-leave-harness');

const { gf, desertion, MINUTE, HOUR, DAY, kst } = h;

const WAIT_TEXT = (text) => `탈주로 ${text} 뒤에 참여할 수 있습니다.`;
const FIVE_WAYS = ['create_room', 'join_room_by_code', 'join_public_room', 'accept_game_invite', 'join_matchmaking'];

// 이 사람이 산 채로 판에서 나감 (새 6명 판, 나머지는 새 사람), 나간 시각
let gameNo = 0;
async function desert(w, uuid, n = 6) {
    gameNo += 1;
    const others = Array.from({ length: n - 1 }, (_, i) => `a09blk${gameNo}-${i}`);
    // 광대는 첫 자리 → 이 사람은 시민 자리 (뒤쪽)
    const s = w.openGame({ uuids: [...others, uuid] });
    gf.toDay(s);
    const at = w.now();
    assert.deepEqual(await w.leave(s, uuid), { ok: true });
    return { s, at };
}

// 그 시각까지 가짜 시계 넘김
const tickTo = (w, ms) => w.tick(ms - w.now());

// ── A09-B-251~255: 대기 중엔 다섯 길 다 같은 거절 ──
const blockIds = ['A09-B-251', 'A09-B-252', 'A09-B-253', 'A09-B-254', 'A09-B-255'];
FIVE_WAYS.forEach((way, i) => {
    test(`${blockIds[i]} 6명 판 산 채로 나간 뒤 ${way} → DESERTION_COOLDOWN + 글 + retryAfterMs + blockedUntil`, async (t) => {
        const w = h.setup(t);
        const { at } = await desert(w, 'a09deserter', 6);
        const res = await w.tryWay('a09deserter', way);
        assert.equal(res.ok, false);
        assert.equal(res.code, 'DESERTION_COOLDOWN');
        assert.equal(res.message, WAIT_TEXT('5분 0초'));
        assert.equal(res.retryAfterMs, 5 * MINUTE);
        assert.equal(res.blockedUntil, new Date(at + 5 * MINUTE).toISOString());
    });
});

// ── A09-B-256~260: 대기가 끝나면 다섯 길이 풀림 ──
const freeIds = ['A09-B-256', 'A09-B-257', 'A09-B-258', 'A09-B-259', 'A09-B-260'];
FIVE_WAYS.forEach((way, i) => {
    test(`${freeIds[i]} 5분 + 1ms 뒤 ${way} → 탈주 거절 없음`, async (t) => {
        const w = h.setup(t);
        await desert(w, 'a09deserter', 6);
        w.tick(5 * MINUTE + 1);
        const res = await w.tryWay('a09deserter', way);
        assert.notEqual(res.code, 'DESERTION_COOLDOWN');
        if (way === 'join_matchmaking') {
            // 자동 매칭은 잠겨 있음 → 탈주 거절 대신 꺼짐 알림
            assert.equal(res.event, 'matchmaking_disabled');
            assert.equal(res.message, '현재 빠른 매칭은 지원하지 않습니다.');
        } else {
            assert.equal(res.ok, true, `${way} 거절: ${res.code} ${res.message}`);
        }
    });
});

// ── A09-B-261~264: 1번째 남은 시간 경계 ──
test('A09-B-261 탈주 직후 → retryAfterMs 300000·글 "5분 0초"', async (t) => {
    const w = h.setup(t);
    await desert(w, 'a09deserter');
    const res = await w.createRoom('a09deserter');
    assert.equal(res.retryAfterMs, 300_000);
    assert.equal(res.message, WAIT_TEXT('5분 0초'));
});

test('A09-B-262 탈주 1초 뒤 → 글 "4분 59초"', async (t) => {
    const w = h.setup(t);
    await desert(w, 'a09deserter');
    w.tick(1_000);
    const res = await w.createRoom('a09deserter');
    assert.equal(res.message, WAIT_TEXT('4분 59초'));
});

test('A09-B-263 탈주 4분 59초 뒤 → retryAfterMs 1000', async (t) => {
    const w = h.setup(t);
    await desert(w, 'a09deserter');
    w.tick(4 * MINUTE + 59_000);
    const res = await w.createRoom('a09deserter');
    assert.equal(res.code, 'DESERTION_COOLDOWN');
    assert.equal(res.retryAfterMs, 1_000);
});

test('A09-B-264 탈주 5분 뒤 → 방 만들기 됨', async (t) => {
    const w = h.setup(t);
    await desert(w, 'a09deserter');
    w.tick(5 * MINUTE);
    const res = await w.createRoom('a09deserter');
    assert.equal(res.ok, true, `거절: ${res.code}`);
});

// ── A09-B-265~268: 30분·24시간 끝 경계 ──
// 앞 탈주 count번(막힘 끝날 때마다 새 판) 뒤 마지막 탈주 시각
async function desertInARow(w, uuid, count) {
    let last;
    for (let i = 0; i < count; i += 1) {
        if (i > 0) {
            const until = desertion.getDesertionBlock(uuid);
            if (until) w.tick(until.retryAfterMs);
        }
        last = await desert(w, uuid);
    }
    return last.at;
}

test('A09-B-265 2번째 탈주 29분 59초 뒤 → 거절', async (t) => {
    const w = h.setup(t);
    await desertInARow(w, 'a09deserter', 2);
    w.tick(29 * MINUTE + 59_000);
    assert.equal((await w.createRoom('a09deserter')).code, 'DESERTION_COOLDOWN');
});

test('A09-B-266 2번째 탈주 30분 뒤 → 됨', async (t) => {
    const w = h.setup(t);
    await desertInARow(w, 'a09deserter', 2);
    w.tick(30 * MINUTE);
    assert.equal((await w.createRoom('a09deserter')).ok, true);
});

test('A09-B-267 3번째 탈주 23시간 59분 59초 뒤 → 거절', async (t) => {
    const w = h.setup(t);
    await desertInARow(w, 'a09deserter', 3);
    w.tick(DAY - 1_000);
    assert.equal((await w.createRoom('a09deserter')).code, 'DESERTION_COOLDOWN');
});

test('A09-B-268 3번째 탈주 24시간 뒤 → 됨', async (t) => {
    const w = h.setup(t);
    await desertInARow(w, 'a09deserter', 3);
    w.tick(DAY);
    assert.equal((await w.createRoom('a09deserter')).ok, true);
});

// ── A09-B-269~272: 같은 한국 날 몇 번째 ──
const nthCases = [
    ['A09-B-269', 1, 5 * MINUTE, '5분'],
    ['A09-B-270', 2, 30 * MINUTE, '30분'],
    ['A09-B-271', 3, DAY, '24시간'],
    ['A09-B-272', 4, DAY, '24시간'],
];
for (const [id, nth, expected, label] of nthCases) {
    test(`${id} 같은 한국 날 ${nth}번째 탈주 → retryAfterMs ${label}`, async (t) => {
        const w = h.setup(t, { now: kst(2026, 11, 16, 0, 10) });
        // 3번째 막힘(1일)이 끝나면 날이 바뀜 → 4번째는 막힘 중에 판을 바로 열어 같은 날에 둠
        for (let i = 1; i < nth; i += 1) {
            await desert(w, 'a09deserter');
            const block = desertion.getDesertionBlock('a09deserter');
            if (block && i < 3) w.tick(block.retryAfterMs);
            else w.tick(MINUTE);
        }
        await desert(w, 'a09deserter');
        assert.equal(Math.floor((w.now() + 9 * HOUR) / DAY), Math.floor((kst(2026, 11, 16, 0, 10) + 9 * HOUR) / DAY), '한국 날이 바뀜 (시험 준비 틀림)');
        const res = await w.createRoom('a09deserter');
        assert.equal(res.retryAfterMs, expected);
    });
}

// ── A09-B-273~276: 한국 자정에 횟수 0, 막힘은 남음 ──
test('A09-B-273 23:40 1번째 → 23:50 2번째 → 30분', async (t) => {
    const w = h.setup(t, { now: kst(2026, 11, 16, 23, 40) });
    await desert(w, 'a09deserter');
    tickTo(w, kst(2026, 11, 16, 23, 50));
    await desert(w, 'a09deserter');
    assert.equal((await w.createRoom('a09deserter')).retryAfterMs, 30 * MINUTE);
});

test('A09-B-274 23:40 1번째 → 다음 날 00:10 탈주 → 5분', async (t) => {
    const w = h.setup(t, { now: kst(2026, 11, 16, 23, 40) });
    await desert(w, 'a09deserter');
    tickTo(w, kst(2026, 11, 17, 0, 10));
    await desert(w, 'a09deserter');
    assert.equal((await w.createRoom('a09deserter')).retryAfterMs, 5 * MINUTE);
});

test('A09-B-275 22:00·22:40 → 23:50 3번째 → 다음 날 00:30 거절, 23:49 거절, 23:50 됨', async (t) => {
    const w = h.setup(t, { now: kst(2026, 11, 16, 22, 0) });
    await desert(w, 'a09deserter');
    tickTo(w, kst(2026, 11, 16, 22, 40));
    await desert(w, 'a09deserter');
    tickTo(w, kst(2026, 11, 16, 23, 50));
    await desert(w, 'a09deserter');
    tickTo(w, kst(2026, 11, 17, 0, 30));
    assert.equal((await w.createRoom('a09deserter')).code, 'DESERTION_COOLDOWN');
    tickTo(w, kst(2026, 11, 17, 23, 49));
    assert.equal((await w.createRoom('a09deserter')).code, 'DESERTION_COOLDOWN');
    tickTo(w, kst(2026, 11, 17, 23, 50));
    assert.equal((await w.createRoom('a09deserter')).ok, true);
});

test('A09-B-276 첫날 22:00·22:40·23:50 탈주 뒤 둘째 날 23:55 첫 탈주 → 5분', async (t) => {
    const w = h.setup(t, { now: kst(2026, 11, 16, 22, 0) });
    await desert(w, 'a09deserter');
    tickTo(w, kst(2026, 11, 16, 22, 40));
    await desert(w, 'a09deserter');
    tickTo(w, kst(2026, 11, 16, 23, 50));
    await desert(w, 'a09deserter');
    tickTo(w, kst(2026, 11, 17, 23, 55));
    await desert(w, 'a09deserter');
    assert.equal((await w.createRoom('a09deserter')).retryAfterMs, 5 * MINUTE);
});

// ── A09-B-277~279: 한 판 한 줄·동시에 두 번·사람마다 ──
test('A09-B-277 같은 사람·같은 판 두 번 적기 → 두 번째 recorded false, 막힘 끝 첫 번째와 같음', async (t) => {
    const w = h.setup(t);
    const first = await desertion.recordDesertion({ userId: 'a09u277', gameId: 'g-277', reason: 'LEFT_ALIVE' });
    w.tick(10_000);
    const second = await desertion.recordDesertion({ userId: 'a09u277', gameId: 'g-277', reason: 'DISCONNECT_TIMEOUT' });
    assert.equal(first.recorded, true);
    assert.equal(second.recorded, false);
    assert.equal(second.blockedUntil.getTime(), first.blockedUntil.getTime());
});

test('A09-B-278 같은 판 같은 순간 두 번 → 둘 다 같은 결과, 몇 번째 1', async (t) => {
    h.setup(t);
    const [a, b] = await Promise.all([
        desertion.recordDesertion({ userId: 'a09u278', gameId: 'g-278', reason: 'LEFT_ALIVE' }),
        desertion.recordDesertion({ userId: 'a09u278', gameId: 'g-278', reason: 'LEFT_ALIVE' }),
    ]);
    assert.deepEqual(a, b);
    assert.equal(a.nth, 1);
});

test('A09-B-279 A가 오늘 3번 탈주 → B 첫 탈주는 5분', async (t) => {
    const w = h.setup(t);
    for (const g of ['g-279a', 'g-279b', 'g-279c']) {
        await desertion.recordDesertion({ userId: 'a09u279a', gameId: g, reason: 'LEFT_ALIVE' });
        w.tick(MINUTE);
    }
    await desert(w, 'a09u279b');
    assert.equal((await w.createRoom('a09u279b')).retryAfterMs, 5 * MINUTE);
});

// ── A09-B-280~281: 대기 중에도 되는 것 ──
test('A09-B-280 대기 중에도 공개 방 목록 보기 → 목록 옴', async (t) => {
    const w = h.setup(t);
    const room = await w.hostRoom('open');
    await desert(w, 'a09deserter');
    const res = await w.publicRooms();
    assert.equal(res.ok, true);
    assert.ok(res.rooms.some((r) => r.id === room.roomId), '공개 방이 목록에 없음');
});

test('A09-B-281 대기 중에도 로비 입장 → 거절 없음', async (t) => {
    const w = h.setup(t);
    await desert(w, 'a09deserter');
    const res = await w.enterLobby('a09deserter');
    assert.equal(res.ok, true, `로비 입장 거절: ${res.code}`);
    assert.notEqual(res.code, 'DESERTION_COOLDOWN');
});

// ── A09-B-282~289: 저장소 사정 ──
test('A09-B-282 저장소가 던져도 막힘은 걸림 → 방 만들기 DESERTION_COOLDOWN, 결과 saved false', async (t) => {
    const fail = async () => { throw new Error('DB 끊김 흉내'); };
    const w = h.setup(t, { repo: { countDesertionsSince: fail, insertDesertion: fail } });
    w.connect('a09u282');
    const result = await desertion.recordDesertion({ userId: 'a09u282', gameId: 'g-282', reason: 'LEFT_ALIVE' });
    assert.equal(result.saved, false);
    assert.equal((await w.createRoom('a09u282')).code, 'DESERTION_COOLDOWN');
});

test('A09-B-283 메모리 0번인데 저장소가 오늘 2줄을 알면 → 이번 탈주 24시간', async (t) => {
    const w = h.setup(t, { repo: { countDesertionsSince: async () => 2 } });
    await desert(w, 'a09deserter');
    await gf.flush();
    assert.equal((await w.createRoom('a09deserter')).retryAfterMs, DAY);
});

const invalidCases = [
    ['A09-B-284', '사람 id 없음', { gameId: 'g-284', reason: 'LEFT_ALIVE' }],
    ['A09-B-285', '판 id 없음', { userId: 'a09u285', reason: 'LEFT_ALIVE' }],
    ['A09-B-286', "이유 'QUIT'", { userId: 'a09u286', gameId: 'g-286', reason: 'QUIT' }],
    ['A09-B-287', "시각 'abc'", { userId: 'a09u287', gameId: 'g-287', reason: 'LEFT_ALIVE', desertedAt: 'abc' }],
];
for (const [id, label, input] of invalidCases) {
    test(`${id} recordDesertion ${label} → INVALID_DESERTION, 막힘 안 걸림`, async (t) => {
        const w = h.setup(t);
        const who = input.userId ?? `a09u${id.slice(-3)}`;
        w.connect(who);
        assert.deepEqual(await desertion.recordDesertion(input), { ok: false, code: 'INVALID_DESERTION' });
        assert.equal((await w.createRoom(who)).ok, true);
    });
}

test('A09-B-288 서버 켤 때 읽기: 저장소에 막힘 끝 > 지금 1줄 → 그 사람 방 만들기 거절', async (t) => {
    const w = h.setup(t);
    const now = w.now();
    w.desertionRepo.findDesertionsForWarmup = async () => [{
        user_id: 'a09u288', game_id: 'g-288', deserted_at: new Date(now - MINUTE), blocked_until: new Date(now + 4 * MINUTE),
    }];
    w.connect('a09u288');
    await desertion.loadActiveDesertions();
    const res = await w.createRoom('a09u288');
    assert.equal(res.code, 'DESERTION_COOLDOWN');
    assert.equal(res.retryAfterMs, 4 * MINUTE);
});

test('A09-B-289 켤 때 읽기 실패 → ok false, 서버 계속, 30초 뒤 검사 때 다시 읽음 [지금 동작]', async (t) => {
    const w = h.setup(t, { repo: { findDesertionsForWarmup: async () => { throw new Error('DB 끊김 흉내'); } } });
    const loaded = await desertion.loadActiveDesertions();
    assert.equal(loaded.ok, false);
    // 서버 계속: 다른 사람 방 만들기 됨
    const other = w.outsider('u289o');
    assert.equal((await w.createRoom(other)).ok, true);
    // 저장소가 살아남 (그 사이 막힌 줄 하나)
    const now = w.now();
    w.desertionRepo.findDesertionsForWarmup = async () => [{
        user_id: 'a09u289', game_id: 'g-289', deserted_at: new Date(now), blocked_until: new Date(now + 10 * MINUTE),
    }];
    w.connect('a09u289');
    w.tick(29_999);
    await w.joinMatchmaking('a09u289');
    await gf.flush();
    assert.equal((await w.joinMatchmaking('a09u289'))?.event, 'matchmaking_disabled', '30초 전에 다시 읽음');
    w.tick(1);
    await w.joinMatchmaking('a09u289');
    await gf.flush();
    const after = await w.joinMatchmaking('a09u289');
    assert.equal(after?.payload?.code, 'DESERTION_COOLDOWN', '30초 뒤 검사 때 다시 안 읽음');
});

// ── A09-B-290~291 ──
test('A09-B-290 7명 판 산 채로 나감 → 5분 뒤 판 진행 중 → 그 방 코드 입장 → "이미 게임이 시작된 방입니다."', async (t) => {
    const w = h.setup(t);
    const uuids = Array.from({ length: 7 }, (_, i) => `a09b290-${i}`);
    const s = w.openGame({ uuids, code: 'A9LVQZ' });
    gf.toDay(s);
    await w.leave(s, uuids[3]);
    w.tick(5 * MINUTE);
    const ev = await w.joinByCode(uuids[3], 'A9LVQZ');
    assert.equal(ev?.event, 'room_join_failed');
    assert.equal(ev.payload.message, '이미 게임이 시작된 방입니다.');
});

test('A09-B-291 가짜 시계 T에 나감 → 막힘 끝 = T + 5분', async (t) => {
    const w = h.setup(t);
    w.tick(12_345);
    const { at } = await desert(w, 'a09deserter');
    const res = await w.createRoom('a09deserter');
    assert.equal(res.blockedUntil, new Date(at + 5 * MINUTE).toISOString());
});
