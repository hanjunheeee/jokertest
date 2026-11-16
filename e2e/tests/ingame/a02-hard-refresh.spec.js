'use strict';

// 의사 사람 둘 중 한 명이 새로고침해도 두 화면 모두 같은 직업 동료가 그대로인지 브라우저 시험 (PC, 어려움)
// 목록 A02-판시작-역할.md 번호 A02-H-009~010 (밤까지는 손잡이로 넘김)
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const N = require('./b-night/_night');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
const U = (x) => x.account.uuid;

// 역할 창 열린 채로 받기 — 안 떠 있으면 위 "내 역할 보기"로 엶 (안내 창이 막으면 닫으면서)
async function openReveal(page) {
    const dialog = revealDialog(page);
    await expect(async () => {
        if (await dialog.isVisible().catch(() => false)) return;
        await N.closeNotices(page);
        await N.closeDawnReport(page);
        await page.getByRole('button', { name: '내 역할 보기', exact: true }).click({ timeout: 1500 });
        await expect(dialog).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    return dialog;
}

// 그 사람 창에 "동료 의사" + 상대 닉네임 하나만 → 확인 눌러 닫음
async function expectDoctorMate(page, mateNick) {
    const dialog = await openReveal(page);
    await expect(dialog.getByText('동료 의사', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('listitem')).toHaveText([mateNick]);
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toHaveCount(0);
}

// 사람 A·B 의사 + 봇 5 = 7명 (광대 1·의사 2·시민 4)
async function openDoctorPair(players, table) {
    const a = await players.add();
    const b = await players.add();
    const wanted = { [U(a)]: 'DOCTOR', [U(b)]: 'DOCTOR' };
    const t = await table.setup({ humans: [a, b], bots: 5, settings: customRoleSettings({ JOKER: 1, DOCTOR: 2 }), roles: wanted });
    const s = await t.state();
    for (const [uuid, role] of Object.entries(wanted)) expect(s.players.find((p) => p.uuid === uuid)?.role, '미리 정한 직업').toBe(role);
    return { t, a, b };
}

test('A02-H-009 의사 사람 둘(7명) 역할 확인 중 A 새로고침 → A·B 창 모두 동료 그대로 @game @hard @smoke', async ({ players, table }) => {
    test.setTimeout(180_000);
    const { t, a, b } = await openDoctorPair(players, table);
    // 새로고침이 역할 확인 단계 안에서 일어났는지 (지나서 하면 다른 케이스가 됨)
    expect((await t.state()).phase, '새로고침 전 단계').toBe('ROLE_REVEAL');
    await a.page.reload();
    await expect(a.page).toHaveURL(/\/ingame/);
    await expectDoctorMate(a.page, b.account.nickname);
    await expectDoctorMate(b.page, a.account.nickname);
});

test('A02-H-010 의사 사람 둘(7명) 1일 밤 A 새로고침 → A·B 창 모두 동료 그대로 @game @hard', async ({ players, table }) => {
    test.setTimeout(180_000);
    const { t, a, b } = await openDoctorPair(players, table);
    // 1일 밤 (낮은 아무도 안 찍어 재판 없이 밤)
    await N.toNight(t, { dayIndex: 1 });
    await a.page.reload();
    await expect(a.page).toHaveURL(/\/ingame/);
    expect((await t.state()).phase, '새로고침 뒤에도 1일 밤').toBe('NIGHT');
    await expectDoctorMate(a.page, b.account.nickname);
    await expectDoctorMate(b.page, a.account.nickname);
});
