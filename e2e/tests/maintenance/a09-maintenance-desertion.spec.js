'use strict';

// 점검 강제 종료·서버 재시작은 탈주가 아님 브라우저 시험 — 판이 그렇게 끝난 뒤 방 만들기가 탈주 글 없이 됨
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-095·096 — 서버 전체에 걸려 다른 시험이 끝난 뒤 하나씩 돎 (@serial, 재시작은 @shutdown)
const { test, expect } = require('../../helpers/fixtures');
const servers = require('../../helpers/servers');
const { setMaintenance, clearMaintenance } = require('./_maint');
const K = require('../ingame/_a09-simple-kit');

// 그 화면에 뜨는 브라우저 알림 창 글을 모으며 닫음 (탈주 글이 떴는지 나중에 봄)
function collectAlerts(page) {
    const alerts = [];
    page.on('dialog', (dialog) => { alerts.push(dialog.message()); dialog.accept().catch(() => {}); });
    return alerts;
}

test('A09-E-095 6명 판, 점검으로 판이 강제 종료 → 점검이 끝난 뒤 방 만들기 됨 (탈주 글 없음) @game @serial @smoke', async ({ user, table, internal }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const alerts = collectAlerts(page);
    const t = await K.seat(table, user, { n: 6 });
    await K.toDay(t);
    expect((await t.player(K.U(user))).alive, '점검 전엔 산 채로 판 중').toBe(true);
    try {
        // 지금 시작하는 점검 → 도는 판을 승패 없이 끝냄
        await setMaintenance(internal, { enabled: true, startsInMs: 0 });
        await expect.poll(async () => (await t.state()) === null, { timeout: 20_000, message: '판이 사라짐' }).toBe(true);
    } finally {
        // 안 끄면 다른 시험의 방 만들기가 막힘
        await clearMaintenance(internal);
    }
    await K.createRoomOk(page);
    expect(alerts.filter((text) => text.includes('탈주로')), '탈주 글').toEqual([]);
});

test('A09-E-096 7명 판, 서버 재시작 → 방 목록 화면, 방 만들기 됨 (탈주 글 없음) @game @serial @shutdown', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const alerts = collectAlerts(page);
    const t = await K.seat(table, user, { n: 7 });
    await K.toDay(t);
    await K.clear(page);
    try {
        await servers.triggerShutdown({ uuid: K.U(user) });
    } finally {
        // 꼭 다시 켜진 걸 확인 (뒤 시험이 서버 없이 돌지 않게)
        await servers.waitBackendUp();
    }
    // 판이 메모리에서 사라져 방 목록으로 보내짐
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 60_000 });
    await expect(page.getByRole('region', { name: '공개 방 목록' })).toBeVisible();
    await K.createRoomOk(page);
    expect(alerts.filter((text) => text.includes('탈주로')), '탈주 글').toEqual([]);
});
