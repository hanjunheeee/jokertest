'use strict';

// 서버 재시작·점검 강제 종료가 탈주가 아닌지 보는 어려운 브라우저 시험 (PC, 사람 2명) — 서버 전체에 걸려 하나씩만 돎(serial 묶음)
// 목록 A09-끊김-나가기-탈주.md A09-H-057·058, 점검 판은 결과 화면 없이 지움(결정 2026-11-16 아침 5번) — 모이는지만: npx playwright test --list tests/maintenance/a09-maintenance-multi.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { triggerShutdown, waitBackendUp } = require('../../helpers/servers');
const maint = require('./_maint');
const K = require('../ingame/_a09-simple-kit');
const H = require('../ingame/_a09-hard-kit');

const { U, GRACE_MS, TOL } = H;

test('A09-H-057 6명 판(사람 2 + 봇 4) 서버 재시작 → ㄱ·ㄴ 방 목록, 둘 다 방 만들기에 탈주 글 없음 @game @hard @serial @shutdown @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const people = await H.openPeople(user, players, 2);
    for (const p of people) H.collectDialogs(p.page);
    const t = await H.seat(table, people, { n: 6 });
    await K.toDay(t);

    await triggerShutdown();
    await waitBackendUp();
    for (const p of people) await expect(p.page).toHaveURL(/\/multiplay/, { timeout: 60_000 });
    for (const p of people) {
        await K.createRoomOk(p.page);
        expect(await H.desertionRows(U(p)), '탈주 줄 없음').toEqual([]);
    }
});

test('A09-H-058 6명 판(사람 2 + 봇 4) ㄴ 오프라인 중 점검으로 판 강제 종료 → 결과 화면 없이 판 지움, 점검 끝난 뒤 ㄴ 방 만들기에 탈주 글 없음 @game @hard @serial', async ({ user, players, table, internal }) => {
    test.setTimeout(300_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const gate = await H.socketGate(b);
    const t = await H.seat(table, [a, b], { n: 6 });
    await K.toDay(t);
    const dropAt = await H.goOffline(t, b, gate);
    try {
        await maint.setMaintenance(internal, { enabled: true, startsInMs: 3000 });
        await expect.poll(
            async () => (await query('SELECT win_reason FROM game_results WHERE id = ?', [t.gameId]))[0]?.win_reason ?? null,
            { timeout: 40_000, message: '점검으로 끝난 판 전적' },
        ).toBe('MAINTENANCE');
    } finally {
        await maint.clearMaintenance(internal);
    }
    await expect.poll(async () => (await t.state()) === null, { timeout: 20_000, message: '판이 서버에서 지워짐' }).toBe(true);
    await expect(a.page).not.toHaveURL(/\/gameresult/);

    // 끊긴 때부터 60초가 지나도 탈주로 안 적힘 (끊김 기다림도 판과 같이 끝남)
    await K.sleepUntil(dropAt + GRACE_MS + TOL);
    await gate.open();
    expect(await H.desertionRows(U(b)), '탈주 줄 없음').toEqual([]);
    // 옛 판 탭을 먼저 닫음: 다시 온라인이 된 옛 탭이 늦게 다시 붙으면 같은 세션 소켓 하나 규칙(known 1-15)으로 새 탭 소켓을 밀어내 방 만들기가 "네트워크" 실패였음
    await b.page.close();
    const tab = await b.context.newPage();
    H.collectDialogs(tab);
    await K.createRoomOk(tab);
});
