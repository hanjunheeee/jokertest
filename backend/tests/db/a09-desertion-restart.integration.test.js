'use strict';

// 서버를 다시 켜도 탈주 막힘이 남는지 DB 시험 — 메모리 비우고 켤 때 읽기, 자정 넘은 막힘, 다섯 길, DB가 안 될 때 탈주
// 목록 A09-B-432~443 (docs/게임_의도_2026-11-15/시험목록/A09-끊김-나가기-탈주.md), 돌리기: with-lock.sh testdb (시험_도우미.md 3-3)
const d = require('./a09-leave-db-helpers');

const test = require('node:test');
const assert = require('node:assert/strict');

const { db, h, noDb } = d;
const { gf, desertion, MINUTE, HOUR, kst } = h;

test.before(d.prepareDb);
test.after(async () => {
    h.gs.__resetStateForTests();
    await db.sequelize.close();
});

const ms = (v) => new Date(v).getTime();
const NOW = kst(2026, 11, 18, 12, 0);

// 서버 다시 켬 흉내: 탈주 메모리 비우고 켤 때 읽기 한 번
async function restart() {
    desertion.__resetForTests();
    const loaded = await desertion.loadActiveDesertions();
    assert.equal(loaded.ok, true, '켤 때 읽기 실패 (시험 준비 틀림)');
}

// 이 사람이 산 채로 새 6명 판에서 나감 → 그 판 줄
async function desertInNewGame(w, uuid, label) {
    const rest = await d.createUsers(5, label);
    const s = await d.openDbGame(w, { uuids: [...rest, uuid] });
    gf.toDay(s);
    await w.leave(s, uuid);
    await d.waitFor(async () => (await d.desertionRows(uuid, s.id)).length >= 1, '탈주 줄');
    const [row] = await d.desertionRows(uuid, s.id);
    return row;
}

// ── A09-B-432~435 ──
test('A09-B-432 막힘 끝 > 지금 줄 → 다시 켬 → 방 만들기 거절', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'date', repo: null, now: NOW });
    const [a] = await d.createUsers(1, 'r432');
    await d.insertRow({ userId: a, desertedAt: NOW - MINUTE, blockedUntil: NOW + 4 * MINUTE });
    await restart();
    w.connect(a);
    const res = await w.createRoom(a);
    assert.equal(res.code, 'DESERTION_COOLDOWN');
    assert.equal(res.retryAfterMs, 4 * MINUTE);
});

test('A09-B-433 막힘 끝 < 지금 줄 → 다시 켬 → 방 만들기 됨', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'date', repo: null, now: NOW });
    const [a] = await d.createUsers(1, 'r433');
    await d.insertRow({ userId: a, desertedAt: NOW - 10 * MINUTE, blockedUntil: NOW - 5 * MINUTE });
    await restart();
    w.connect(a);
    const res = await w.createRoom(a);
    assert.equal(res.ok, true, `방 만들기 거절: ${res.code}`);
});

test('A09-B-434 오늘 1줄·막힘 끝남 → 다시 켬 → 새 탈주 30분', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'date', repo: null, now: NOW });
    const [a] = await d.createUsers(1, 'r434');
    await d.insertRow({ userId: a, desertedAt: NOW - HOUR, blockedUntil: NOW - HOUR + 5 * MINUTE });
    await restart();
    const row = await desertInNewGame(w, a, 'r434g');
    assert.equal(ms(row.blocked_until) - ms(row.deserted_at), 30 * MINUTE);
});

test('A09-B-435 어제 줄만 → 다시 켬 → 새 탈주 5분', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'date', repo: null, now: NOW });
    const [a] = await d.createUsers(1, 'r435');
    const yesterday = kst(2026, 11, 17, 20, 0);
    await d.insertRow({ userId: a, desertedAt: yesterday, blockedUntil: yesterday + 5 * MINUTE });
    await restart();
    const row = await desertInNewGame(w, a, 'r435g');
    assert.equal(ms(row.blocked_until) - ms(row.deserted_at), 5 * MINUTE);
});

test('A09-B-436 23:50 3번째 줄 → 다음 날 00:30에 다시 켬 → 방 만들기 거절', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'date', repo: null, now: kst(2026, 11, 18, 22, 0) });
    const [a] = await d.createUsers(1, 'r436');
    await desertInNewGame(w, a, 'r436a');
    w.tick(kst(2026, 11, 18, 22, 40) - w.now());
    await desertInNewGame(w, a, 'r436b');
    w.tick(kst(2026, 11, 18, 23, 50) - w.now());
    const third = await desertInNewGame(w, a, 'r436c');
    assert.equal(ms(third.blocked_until), kst(2026, 11, 19, 23, 50), '셋째 줄 막힘 끝이 다름 (B-426 쪽)');
    w.tick(kst(2026, 11, 19, 0, 30) - w.now());
    await restart();
    const res = await w.createRoom(a);
    assert.equal(res.code, 'DESERTION_COOLDOWN');
});

// ── A09-B-437~441: 다시 켠 뒤 다섯 길 다 막힘 ──
const WAYS = [
    ['A09-B-437', 'create_room'],
    ['A09-B-438', 'join_room_by_code'],
    ['A09-B-439', 'join_public_room'],
    ['A09-B-440', 'accept_game_invite'],
    ['A09-B-441', 'join_matchmaking'],
];
for (const [id, way] of WAYS) {
    test(`${id} 막힘 줄 1개 → 다시 켬 → ${way} DESERTION_COOLDOWN`, async (t) => {
        if (noDb(t)) return;
        const w = h.setup(t, { timers: 'date', repo: null, now: NOW });
        const [a] = await d.createUsers(1, `r${id.slice(-3)}`);
        await d.insertRow({ userId: a, desertedAt: NOW - MINUTE, blockedUntil: NOW + 29 * MINUTE });
        await restart();
        w.connect(a);
        const res = await w.tryWay(a, way);
        assert.equal(res.code, 'DESERTION_COOLDOWN');
    });
}

// ── A09-B-442~443: DB가 안 될 때 ──
// DB 끊김 흉내: 탈주 표 읽기·쓰기가 연결 오류를 던짐 (시험 끝나면 원래대로)
function breakDesertionTable(t) {
    const down = async () => { throw new db.Sequelize.ConnectionError(new Error('DB 끊김 흉내')); };
    t.mock.method(db.GameDesertion, 'count', down);
    t.mock.method(db.GameDesertion, 'create', down);
    t.mock.method(db.GameDesertion, 'findOne', down);
}

test('A09-B-442 6명 판 DB 끊고 산 채로 나감 → 방 만들기 거절(막힘 걸림), 줄 없음', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'real', repo: null });
    const s = await d.openDbGame(w, { n: 6, label: 'r442' });
    gf.toDay(s);
    const [a] = gf.nonJokers(s);
    breakDesertionTable(t);
    await w.leave(s, a);
    await d.settle();
    const res = await w.createRoom(a);
    assert.equal(res.code, 'DESERTION_COOLDOWN');
    t.mock.restoreAll();
    assert.equal((await d.desertionRows(a)).length, 0);
});

test('A09-B-443 7명 판 DB 끊긴 채 나감 → 판 사람들 player_eliminated 받음, 판 계속', async (t) => {
    if (noDb(t)) return;
    const w = h.setup(t, { timers: 'real', repo: null });
    const s = await d.openDbGame(w, { n: 7, label: 'r443' });
    gf.toDay(s);
    const [a, watcher] = gf.nonJokers(s);
    breakDesertionTable(t);
    assert.deepEqual(await w.leave(s, a), { ok: true });
    await d.settle();
    for (const u of [...s.players.keys()].filter((x) => x !== a)) {
        assert.equal(w.received(u, 'player_eliminated').length, 1, `${u} 탈락 알림 수`);
    }
    const snap = await w.snapshot(s, watcher);
    assert.equal(snap.ok, true);
    assert.equal(snap.phase, 'DAY');
});

