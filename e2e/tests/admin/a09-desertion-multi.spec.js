'use strict';

// 관리자 회원 상세 "탈주 기록" 어려운 브라우저 시험 (관리자 PC 화면 + 사람 1~2명 판) — 이유가 다른 두 계정 줄·판 중 정지·막힘 끝 = 탈주 시각 + 5분
// 목록 A09-끊김-나가기-탈주.md A09-H-024·029·055, 판 중 정지는 [지금 동작] + 결정(2026-11-16 아침 6번: 정지로 빠지면 탈주 아님) — 모이는지만: npx playwright test --list tests/admin/a09-desertion-multi.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const A = require('../ingame/_a04-multi');
const K = require('../ingame/_a09-simple-kit');
const H = require('../ingame/_a09-hard-kit');

const { U, nick, GRACE_MS } = H;

// 판 사람 (관리자 묶음은 기본 화면이 관리자 주소라 PC 판 화면 창을 따로 엶)
async function openPlayers(players, count) {
    const list = [];
    for (let i = 0; i < count; i += 1) list.push(await players.add({ mobile: false }));
    return list;
}

// 그 판 탈주 줄이 DB에 적힐 때까지 (관리자 화면을 열기 전)
async function waitRow(uuid, gameId) {
    await expect.poll(async () => (await H.desertionRows(uuid)).some((r) => r.game_id === gameId), { timeout: 15_000, message: '탈주 줄' }).toBe(true);
}

test('A09-H-024 6명 판(사람 2 + 봇 4) ㄱ은 60초(손잡이) 탈락·ㄴ은 산 채로 나감 → 관리자 회원 상세에 각자 그 판 줄, 이유가 다름 @game @hard', async ({ browser, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await openPlayers(players, 2);
    const t = await H.seat(table, [a, b], { n: 6 });
    await K.toDay(t);
    await K.leaveAlive(b.page);
    const since = Date.now();
    await a.page.close();
    await K.droppedAt(t, U(a), since);
    await K.expire(t, U(a));
    for (const p of [a, b]) await waitRow(U(p), t.gameId);

    const admin = await H.openAdmin(browser);
    try {
        const tableA = await H.openDesertions(admin.page, U(a));
        const rowA = await H.desertionCells(tableA, t.gameId);
        expect(rowA.reason).toBe('끊긴 뒤 1분 안에 못 돌아옴');
        expect(rowA.state).toBe('막힘 중');
        await expectReadable(rowA.row.getByRole('cell', { name: '끊긴 뒤 1분 안에 못 돌아옴' }));

        const tableB = await H.openDesertions(admin.page, U(b));
        const rowB = await H.desertionCells(tableB, t.gameId);
        expect(rowB.reason).toBe('산 채로 나감');
        expect(rowB.state).toBe('막힘 중');
        await expectReadable(rowB.row.getByRole('cell', { name: '산 채로 나감' }));
    } finally {
        await admin.close();
    }
});

test('A09-H-029 [지금 동작] 6명 판(관리자 + 사람 2 + 봇 4) 판 중 관리자가 ㄴ 정지 → ㄴ 끊김 → 60초 → ㄱ 화면 ㄴ 사망, 정지로 빠진 건 탈주 줄 없음 @game @hard @realtime', async ({ browser, players, table }) => {
    test.setTimeout(300_000);
    const [a, b] = await openPlayers(players, 2);
    const t = await H.seat(table, [a, b], { n: 6 });
    await K.toDay(t);
    await A.calm(a.page);
    const admin = await H.openAdmin(browser);
    try {
        const since = Date.now();
        await H.adminApi(admin.page, 'POST', `/members/${U(b)}/bans`, { kind: 'PERIOD', days: 1, reason: '시험 정지' });
        const dropAt = await K.droppedAt(t, U(b), since);
        await H.expectStatus(a.page, nick(b), 'disconnected');
        // 손잡이 없이 60초
        const deadAt = await H.statusAt(a.page, nick(b), 'dead', { timeout: GRACE_MS + 15_000 });
        A.expectNear(deadAt - dropAt, GRACE_MS, '끊긴 지 60초에 ㄱ 화면 ㄴ 사망');
        expect((await t.player(U(b))).isParticipating).toBe(false);
        // 결정(아침 6번): 정지로 끊겨 빠진 사람은 탈주로 안 침 → 관리자 상세 탈주 기록 비어 있음
        await H.openDesertions(admin.page, U(b));
        await expect(admin.page.getByText('탈주 기록이 없어요.', { exact: true })).toBeVisible();
        expect(await H.desertionRows(U(b))).toEqual([]);
    } finally {
        await admin.close();
    }
});

test('A09-H-055 6명 판(사람 1 + 봇 5) ㄱ이 산 채로 나감 → 관리자 회원 상세 탈주 시각과 참여 막힘 끝의 차이 5분 @game @hard @smoke', async ({ browser, players, table }) => {
    test.setTimeout(240_000);
    const [a] = await openPlayers(players, 1);
    const t = await H.seat(table, [a], { n: 6 });
    await K.toDay(t);
    await K.leaveAlive(a.page);
    await waitRow(U(a), t.gameId);
    const admin = await H.openAdmin(browser);
    try {
        const rows = await H.openDesertions(admin.page, U(a));
        const cells = await H.desertionCells(rows, t.gameId);
        expect(cells.reason).toBe('산 채로 나감');
        // 화면은 분까지만 보임 → 분 단위로 정확히 5분 차이 (막힘 끝 = 탈주 시각 + 5분)
        expect(H.minuteMs(cells.blockedUntil) - H.minuteMs(cells.desertedAt)).toBe(5 * 60_000);
        await expectReadable(cells.row.getByRole('cell', { name: cells.blockedUntil }));
    } finally {
        await admin.close();
    }
});
