'use strict';

// 탈주 기록 DB 시험 — 산 채로 나감·60초 탈락만 game_desertions에 한 판 한 줄, 몇 번째별 막힘 끝 저장 값, 메모리 비워도 DB로 셈, 죽고 끊긴 사람 판 골드
// 목록 A09-B-401~431·444·449 (docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const d = require('./a09-leave-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const gameSettings = require('../../services/ops/gameSettings');
const { abortGamesForMaintenance } = require('../../socket/gameSession/departure/maintenanceAbort');

const { db, h, noDb } = d;
const { gf, desertion, MINUTE, HOUR, DAY, kst } = h;

test.before(d.prepareDb);
test.after(async () => {
    h.gs.__resetStateForTests();
    await db.sequelize.close();
});

const ms = (v) => new Date(v).getTime();

// 줄 n개가 생길 때까지 기다린 뒤 그 사람(+판) 줄
async function rowsAfter(userId, gameId, n = 1) {
    await d.waitFor(async () => (await d.desertionRows(userId, gameId)).length >= n, `탈주 줄 ${n}개`);
    return d.desertionRows(userId, gameId);
}

// ── A09-B-401~404: 탈주면 1줄 ──
test('A09-B-401 6명 판 산 채로 나가면 1줄: 그 사람·그 판·LEFT_ALIVE·막힘 끝 = 탈주 시각 + 5분', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'real', repo: null });
    const s = await d.openDbGame(w, { n: 6, label: 'r401' });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    await w.leave(s, a);
    const rows = await rowsAfter(a, s.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, a);
    assert.equal(rows[0].game_id, s.id);
    assert.equal(rows[0].reason, 'LEFT_ALIVE');
    assert.equal(ms(rows[0].blocked_until) - ms(rows[0].deserted_at), 5 * MINUTE);
});

test('A09-B-402 7명 판 60초 탈락하면 1줄 DISCONNECT_TIMEOUT', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'real', repo: null });
    const s = await d.openDbGame(w, { n: 7, label: 'r402' });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    d.disconnectWithClock(w, s, a).advance(60_000);
    const rows = await rowsAfter(a, s.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, 'DISCONNECT_TIMEOUT');
});

test('A09-B-403 5명 판 역할 확인 중 산 채로 나가도 1줄 LEFT_ALIVE', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'real', repo: null });
    const s = await d.openDbGame(w, { n: 5, label: 'r403' });
    assert.equal(s.phase, 'ROLE_REVEAL');
    const [a] = gf.nonJokers(s);
    await w.leave(s, a);
    const rows = await rowsAfter(a, s.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, 'LEFT_ALIVE');
});

test('A09-B-404 8명 판 끊김 기다림 중 다른 탭 나가기 → LEFT_ALIVE 1줄, 60초 뒤에도 안 늘어남', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'real', repo: null });
    const s = await d.openDbGame(w, { n: 8, label: 'r404' });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    const clock = d.disconnectWithClock(w, s, a);
    clock.advance(20_000);
    w.connect(a, s);
    await w.leave(s, a);
    await rowsAfter(a, s.id);
    clock.advance(60_000);
    await d.settle();
    const rows = await d.desertionRows(a, s.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reason, 'LEFT_ALIVE');
});

// ── A09-B-405~415: 탈주 아닌 것은 0줄 ──
// 판 끝내기: 광대를 처형 (판 규칙 함수로 바로)
const endGame = (w, s) => {
    for (const j of gf.byRole(s, 'JOKER')) if (s.phase !== 'ENDED') w.execute(s, j);
    assert.equal(s.phase, 'ENDED', '판이 안 끝남 (시험 준비 틀림)');
};

const notDesertion = [
    ['A09-B-405', '6명 판 죽은 뒤 나감', 6, async (w, s, a) => { w.execute(s, a); await w.leave(s, a); }],
    ['A09-B-406', '7명 판 처형 뒤 끊겨 60초', 7, async (w, s, a) => {
        w.execute(s, a);
        await w.disconnect(a);
    }],
    ['A09-B-407', '10명 판 밤에 죽고 끊김', 10, async (w, s, a) => {
        gf.toDay(s);
        w.night(s, a);
        await w.disconnect(a);
    }],
    ['A09-B-408', '8명 판 결과 화면 나감', 8, async (w, s, a) => { endGame(w, s); await w.leave(s, a); }],
    ['A09-B-409', '5명 판 결과 화면 끊김', 5, async (w, s, a) => { endGame(w, s); await w.disconnect(a); }],
    ['A09-B-410', '6명 판 점검 강제 종료(끊긴 사람 포함)', 6, async (w, s, a) => {
        gf.toDay(s);
        const clock = d.disconnectWithClock(w, s, a);
        abortGamesForMaintenance(w.io);
        clock.advance(61_000);
    }],
    ['A09-B-411', '7명 판 판 장부 비움(다시 켬 흉내)', 7, async (w, s, a) => {
        gf.toDay(s);
        const clock = d.disconnectWithClock(w, s, a);
        gf.resetCore();
        clock.advance(61_000);
    }],
    ['A09-B-412', '8명 판 끊긴 지 30초에 판 끝', 8, async (w, s, a) => {
        gf.toDay(s);
        const clock = d.disconnectWithClock(w, s, a);
        clock.advance(30_000);
        endGame(w, s);
        clock.advance(31_000);
    }],
    ['A09-B-413', '6명 판 끊긴 사이 살해', 6, async (w, s, a) => {
        gf.toDay(s);
        const clock = d.disconnectWithClock(w, s, a);
        w.night(s, a);
        clock.advance(61_000);
    }],
    ['A09-B-414', '7명 판 끊긴 사이 처형', 7, async (w, s, a) => {
        gf.toDay(s);
        const clock = d.disconnectWithClock(w, s, a);
        w.execute(s, a);
        clock.advance(61_000);
    }],
    ['A09-B-415', '10명 판 59초에 붙음', 10, async (w, s, a) => {
        gf.toDay(s);
        const clock = d.disconnectWithClock(w, s, a);
        clock.advance(59_000);
        assert.equal((await w.reconnect(s, a)).ok, true);
        clock.advance(2_000);
    }],
];
for (const [id, label, n, run] of notDesertion) {
    test(`${id} ${label} → 그 사람 탈주 줄 0`, async (t) => {
        if (noDb(t)) return;
        const w = h.setup(t, { timers: 'real', repo: null });
        const s = await d.openDbGame(w, { n, label: `r${id.slice(-3)}`, roleCounts: n >= 10 ? { JOKER: 2 } : { JOKER: 1 } });
        const [a] = gf.nonJokers(s);
        await run(w, s, a);
        await d.settle();
        assert.equal((await d.desertionRows(a)).length, 0);
    });
}

// ── A09-B-416~421: 한 판 한 줄 ──
test('A09-B-416 같은 사람·판으로 recordDesertion 두 번 → 1줄, 두 번째 recorded false·blockedUntil 같음', async (t) => {
    if (noDb(t)) return;
    h.setup(t, { timers: 'real', repo: null });
    const [a] = await d.createUsers(1, 'r416');
    const gameId = crypto.randomUUID();
    const first = await desertion.recordDesertion({ userId: a, gameId, reason: 'LEFT_ALIVE' });
    const second = await desertion.recordDesertion({ userId: a, gameId, reason: 'DISCONNECT_TIMEOUT' });
    assert.equal(second.recorded, false);
    assert.equal(second.blockedUntil.getTime(), first.blockedUntil.getTime());
    assert.equal((await d.desertionRows(a, gameId)).length, 1);
});

test('A09-B-417 같은 순간 두 번 → 1줄', async (t) => {
    if (noDb(t)) return;
    h.setup(t, { timers: 'real', repo: null });
    const [a] = await d.createUsers(1, 'r417');
    const gameId = crypto.randomUUID();
    await Promise.all([
        desertion.recordDesertion({ userId: a, gameId, reason: 'LEFT_ALIVE' }),
        desertion.recordDesertion({ userId: a, gameId, reason: 'LEFT_ALIVE' }),
    ]);
    assert.equal((await d.desertionRows(a, gameId)).length, 1);
});

test('A09-B-418 같은 user_id·game_id 직접 두 번 넣기 → 두 번째 game_desertions_user_game_unique 오류', async (t) => {
    if (noDb(t)) return;
    const [a] = await d.createUsers(1, 'r418');
    const gameId = crypto.randomUUID();
    const now = Date.now();
    await d.insertRow({ userId: a, gameId, desertedAt: now, blockedUntil: now + 5 * MINUTE });
    await assert.rejects(
        d.insertRow({ userId: a, gameId, reason: 'DISCONNECT_TIMEOUT', desertedAt: now, blockedUntil: now + 5 * MINUTE }),
        (error) => {
            assert.equal(error.name, 'SequelizeUniqueConstraintError');
            assert.match(String(error.parent?.sqlMessage ?? error.message), /game_desertions_user_game_unique/);
            return true;
        },
    );
});

test('A09-B-419 다른 판이면 같은 사람 두 줄', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'real', repo: null });
    const [a] = await d.createUsers(1, 'r419');
    const games = [];
    for (const label of ['r419x', 'r419y']) {
        const rest = await d.createUsers(5, label);
        const s = await d.openDbGame(w, { uuids: [...rest, a] });
        gf.toDay(s);
        await w.leave(s, a);
        games.push(s.id);
    }
    const rows = await rowsAfter(a, null, 2);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.game_id).sort(), [...games].sort());
});

test('A09-B-420 8명 판 A 나감·B 60초 탈락 → 2줄, A LEFT_ALIVE·B DISCONNECT_TIMEOUT', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'real', repo: null });
    const s = await d.openDbGame(w, { n: 8, label: 'r420' });
    gf.toDay(s);
    const [a, b] = gf.nonJokers(s);
    await w.leave(s, a);
    d.disconnectWithClock(w, s, b).advance(60_000);
    const [rowA] = await rowsAfter(a, s.id);
    const [rowB] = await rowsAfter(b, s.id);
    assert.equal(rowA.reason, 'LEFT_ALIVE');
    assert.equal(rowB.reason, 'DISCONNECT_TIMEOUT');
    const all = await db.GameDesertion.count({ where: { game_id: s.id } });
    assert.equal(all, 2);
});

test('A09-B-421 같은 방 코드 다음 판 탈주는 새 game_id로 새 줄 (6명 판 둘)', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'real', repo: null });
    const uuids = await d.createUsers(6, 'r421');
    const x = uuids[5];
    const first = await d.openDbGame(w, { uuids, code: 'A9RCDE' });
    gf.toDay(first);
    await w.leave(first, x);
    await rowsAfter(x, first.id);
    endGame(w, first);
    for (const u of uuids) if (u !== x) await w.leave(first, u);
    const second = await d.openDbGame(w, { uuids, code: 'A9RCDE' });
    assert.notEqual(second.id, first.id);
    gf.toDay(second);
    await w.leave(second, x);
    const rows = await rowsAfter(x, null, 2);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.game_id), [first.id, second.id]);
});

// ── A09-B-422~427: 막힘 끝 저장 값 ──
// 이 사람이 산 채로 새 판에서 나감 (나머지 5명은 새 계정)
async function desertInNewGame(w, uuid, label) {
    const rest = await d.createUsers(5, label);
    const s = await d.openDbGame(w, { uuids: [...rest, uuid] });
    gf.toDay(s);
    await w.leave(s, uuid);
    await rowsAfter(uuid, s.id);
    return s;
}

const nthStored = [
    ['A09-B-422', 1, 5 * MINUTE, '5분'],
    ['A09-B-423', 2, 30 * MINUTE, '30분'],
    ['A09-B-424', 3, DAY, '24시간'],
    ['A09-B-425', 4, DAY, '24시간'],
];
for (const [id, nth, expected, label] of nthStored) {
    test(`${id} 같은 한국 날 ${nth}번째 탈주 → blocked_until = deserted_at + ${label}`, async (t) => {
        if (noDb(t)) return;
        const w = h.setup(t, { timers: 'date', repo: null, now: kst(2026, 11, 16, 9, 0) });
        const [a] = await d.createUsers(1, `r${id.slice(-3)}`);
        for (let i = 1; i <= nth; i += 1) {
            if (i > 1) w.tick(MINUTE);
            await desertInNewGame(w, a, `r${id.slice(-3)}g${i}`);
        }
        const rows = await d.desertionRows(a);
        assert.equal(rows.length, nth);
        const last = rows[nth - 1];
        assert.equal(ms(last.blocked_until) - ms(last.deserted_at), expected);
    });
}

test('A09-B-426 한국 22:00·22:40·23:50 탈주 → 셋째 줄 blocked_until = 다음 날 23:50', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'date', repo: null, now: kst(2026, 11, 16, 22, 0) });
    const [a] = await d.createUsers(1, 'r426');
    await desertInNewGame(w, a, 'r426a');
    w.tick(kst(2026, 11, 16, 22, 40) - w.now());
    await desertInNewGame(w, a, 'r426b');
    w.tick(kst(2026, 11, 16, 23, 50) - w.now());
    await desertInNewGame(w, a, 'r426c');
    const rows = await d.desertionRows(a);
    assert.equal(rows.length, 3);
    assert.equal(ms(rows[2].blocked_until), kst(2026, 11, 17, 23, 50));
});

test('A09-B-427 6명 판 탈주 시각 = 나간 순간 (차이 1초 안)', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'real', repo: null });
    const s = await d.openDbGame(w, { n: 6, label: 'r427' });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    const leftAt = Date.now();
    await w.leave(s, a);
    const [row] = await rowsAfter(a, s.id);
    assert.ok(Math.abs(ms(row.deserted_at) - leftAt) < 1_000, `차이 ${ms(row.deserted_at) - leftAt}ms`);
});

// ── A09-B-428~431: 메모리를 비운 뒤에도 몇 번째는 DB로 셈 ──
const NOW_428 = kst(2026, 11, 17, 10, 0);
const priorCases = [
    ['A09-B-428', '오늘 1줄', [kst(2026, 11, 17, 8, 0)], 30 * MINUTE, '30분'],
    ['A09-B-429', '오늘 2줄', [kst(2026, 11, 17, 7, 0), kst(2026, 11, 17, 8, 0)], DAY, '24시간'],
    ['A09-B-430', '어제 한국 23:59:59 1줄', [kst(2026, 11, 16, 23, 59, 59)], 5 * MINUTE, '5분'],
    ['A09-B-431', '오늘 한국 00:00:00 1줄', [kst(2026, 11, 17, 0, 0, 0)], 30 * MINUTE, '30분'],
];
for (const [id, label, times, expected, expectedLabel] of priorCases) {
    test(`${id} 메모리 비움 + ${label} → 새 탈주 ${expectedLabel}`, async (t) => {
        if (noDb(t)) return;
        const w = h.setup(t, { timers: 'date', repo: null, now: NOW_428 });
        const [a] = await d.createUsers(1, `r${id.slice(-3)}`);
        // 앞 줄은 막힘이 이미 끝난 줄 (막힘이 아니라 횟수만 보게)
        for (const at of times) await d.insertRow({ userId: a, desertedAt: at, blockedUntil: at + 5 * MINUTE });
        desertion.__resetForTests();
        const s = await desertInNewGame(w, a, `r${id.slice(-3)}g`);
        const [row] = await d.desertionRows(a, s.id);
        assert.equal(ms(row.blocked_until) - ms(row.deserted_at), expected);
    });
}

// ── A09-B-444 ──
test("A09-B-444 이유 'QUIT'로는 줄 없음", async (t) => {
    if (noDb(t)) return;
    h.setup(t, { timers: 'real', repo: null });
    const [a] = await d.createUsers(1, 'r444');
    const res = await desertion.recordDesertion({ userId: a, gameId: crypto.randomUUID(), reason: 'QUIT' });
    assert.equal(res.code, 'INVALID_DESERTION');
    await d.settle();
    assert.equal((await d.desertionRows(a)).length, 0);
});

// ── A09-B-449 ──
test('A09-B-449 8명 판 처형된 A 끊긴 채 판 끝 + 끊긴 지 30초에 판 끝난 산 B → A·B 장부 GAME_REWARD 각 1줄', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'real', repo: null, realPersist: true });
    const s = await d.openDbGame(w, { n: 8, label: 'r449' });
    s.goldReward = gameSettings.getGameGoldReward();
    const [a, b] = gf.nonJokers(s);
    w.execute(s, a);
    await w.disconnect(a);
    w.night(s);
    const clock = d.disconnectWithClock(w, s, b);
    clock.advance(30_000);
    w.execute(s, gf.firstOf(s, 'JOKER'));
    assert.equal(s.phase, 'ENDED', '판이 안 끝남 (시험 준비 틀림)');
    h.T.persistTerminalSession(s, { completed: true });
    const reference = `game-reward:${s.id}`;
    const ledgerOf = (uuid) => db.sequelize.query(
        'SELECT user_id, reason FROM economy_ledger_entries WHERE reference_event_id = :reference AND user_id = :uuid',
        { replacements: { reference, uuid }, type: db.Sequelize.QueryTypes.SELECT },
    );
    await d.waitFor(async () => (await ledgerOf(a)).length >= 1 && (await ledgerOf(b)).length >= 1, 'A·B 판 골드 장부 줄');
    for (const uuid of [a, b]) {
        const rows = await ledgerOf(uuid);
        assert.equal(rows.length, 1, `${uuid} 장부 줄 수`);
        assert.equal(rows[0].reason, 'GAME_REWARD');
    }
    // 끊긴 B의 60초 타이머가 판 끝 뒤에 돌아도 탈주 아님
    clock.advance(31_000);
    await d.settle();
    assert.equal((await d.desertionRows(b)).length, 0);
});
