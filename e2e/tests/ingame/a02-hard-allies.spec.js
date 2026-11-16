'use strict';

// 여러 사람이 같은 판에서 서로 동료를 보는지 브라우저 시험 (PC, 어려움) — 같은 직업 사람 둘은 서로 보고 셋째는 못 봄, 다섯 직업 다섯 화면, 밤 대상
// 목록 A02-판시작-역할.md 번호 A02-H-001~008 (앞 단계는 손잡이로 넘김, 시간 규칙을 보는 시험 아님)
const { test, expect } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { ROLE_LABELS } = require('../../helpers/ui');
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

async function closeReveal(page) {
    const dialog = revealDialog(page);
    if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toHaveCount(0);
}

/**
 * 한 사람 창의 동료 줄 확인: 같은 직업 상대가 있으면 "동료 ○○" + 그 닉네임만, 없으면(시민·혼자) "동료" 글 없음
 * 상대는 서버 판 값에서 찾음 (보이면 안 되는 이름이 섞이면 목록이 달라져 실패)
 */
async function expectAllies(page, s, uuid) {
    const me = s.players.find((p) => p.uuid === uuid);
    const label = ROLE_LABELS[me.role];
    const mates = me.role === 'CITIZEN' ? [] : s.players.filter((p) => p.uuid !== uuid && p.role === me.role).map((p) => p.nickname);
    const dialog = await openReveal(page);
    await expect(dialog.getByText(label, { exact: true })).toBeVisible();
    if (mates.length === 0) {
        await expect(dialog).not.toContainText('동료');
    } else {
        await expect(dialog.getByText(`동료 ${label}`, { exact: true })).toBeVisible();
        await expect(dialog.getByRole('listitem')).toHaveText(mates);
    }
    await closeReveal(page);
}

// 사람마다 정한 직업이 맞았는지 (서버 예약이 가끔 못 맞음)
function expectRoles(s, wanted) {
    for (const [uuid, role] of Object.entries(wanted)) {
        expect(s.players.find((p) => p.uuid === uuid)?.role, `미리 정한 직업 (${uuid})`).toBe(role);
    }
}

async function openHumans(players, n) {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await players.add());
    return out;
}

// A02-H-001~004 사람 A·B 같은 직업, 사람 C 시민
const TRIO_CASES = [
    { no: 'A02-H-001', role: 'JOKER', n: 5, settings: { jokerCount: 2 } },
    { no: 'A02-H-002', role: 'DOCTOR', n: 6, settings: customRoleSettings({ JOKER: 1, DOCTOR: 2 }) },
    { no: 'A02-H-003', role: 'GUARD', n: 8, settings: customRoleSettings({ JOKER: 1, GUARD: 2 }) },
    { no: 'A02-H-004', role: 'WITCH_HUNTER', n: 10, settings: customRoleSettings({ JOKER: 1, WITCH_HUNTER: 2 }) },
];

TRIO_CASES.forEach((c, i) => {
    const label = ROLE_LABELS[c.role];
    const tags = ['@game', '@hard', ...(i === 0 ? ['@smoke'] : [])].join(' ');
    test(`${c.no} 사람 셋 ${c.n}명 판: ${label} A·B는 창에 서로, 시민 C 창엔 둘 다 없음 ${tags}`, async ({ players, table }) => {
        test.setTimeout(240_000);
        const [a, b, cc] = await openHumans(players, 3);
        const wanted = { [U(a)]: c.role, [U(b)]: c.role, [U(cc)]: 'CITIZEN' };
        const t = await table.setup({ humans: [a, b, cc], bots: c.n - 3, settings: c.settings, roles: wanted });
        const s = await t.state();
        expectRoles(s, wanted);

        await expectAllies(a.page, s, U(a));
        await expectAllies(b.page, s, U(b));
        // A 창엔 B, B 창엔 A (위 확인이 서버 값으로 본 것과 같은지 이름으로 한 번 더)
        expect(s.players.filter((p) => p.role === c.role).map((p) => p.uuid).sort()).toEqual([U(a), U(b)].sort());
        const dialog = await openReveal(cc.page);
        await expect(dialog.getByText('시민', { exact: true })).toBeVisible();
        await expect(dialog).not.toContainText(a.account.nickname);
        await expect(dialog).not.toContainText(b.account.nickname);
        await expect(dialog).not.toContainText('동료');
    });
});

test('A02-H-005 사람 2 + 봇 5 = 7명, 둘 다 시민 → 두 창 모두 동료 줄 없음 @game @hard', async ({ players, table }) => {
    const [a, b] = await openHumans(players, 2);
    const wanted = { [U(a)]: 'CITIZEN', [U(b)]: 'CITIZEN' };
    const t = await table.setup({ humans: [a, b], bots: 5, roles: wanted });
    const s = await t.state();
    expectRoles(s, wanted);
    for (const h of [a, b]) {
        const dialog = await openReveal(h.page);
        await expect(dialog.getByText('시민', { exact: true })).toBeVisible();
        await expect(dialog).not.toContainText('동료');
        await expect(dialog.getByRole('listitem')).toHaveCount(0);
    }
});

test('A02-H-006 사람 5 + 봇 5 = 10명 짝 판, 사람 직업 다섯 → 시작부터 1일 밤까지 다섯 화면 모두 동료가 맞음 @game @hard', async ({ players, table }) => {
    test.setTimeout(300_000);
    const humans = await openHumans(players, 5);
    const roles = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'];
    const wanted = Object.fromEntries(humans.map((h, i) => [U(h), roles[i]]));
    const t = await table.setup({
        humans,
        bots: 5,
        settings: customRoleSettings({ JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }),
        roles: wanted,
    });
    const s = await t.state();
    expectRoles(s, wanted);
    // 시작 때
    for (const h of humans) await expectAllies(h.page, s, U(h));
    // 1일 밤 (낮은 아무도 안 찍어 재판 없이 밤) → 다시 열어도 같음
    await N.toNight(t, { dayIndex: 1 });
    for (const h of humans) await expectAllies(h.page, s, U(h));
});

test('A02-H-007 의사 사람 둘(6명 J1D2C3) 1일 밤 → A가 B를 보호로 고를 수 있고 서버가 받음 (광대가 B를 노려도 B 삶) @game @hard', async ({ players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await openHumans(players, 2);
    const wanted = { [U(a)]: 'DOCTOR', [U(b)]: 'DOCTOR' };
    const t = await table.setup({ humans: [a, b], bots: 4, settings: customRoleSettings({ JOKER: 1, DOCTOR: 2 }), roles: wanted });
    const s = await t.state();
    expectRoles(s, wanted);
    const joker = t.bots.find((bot) => s.players.find((p) => p.uuid === U(bot))?.role === 'JOKER');
    expect(joker, '광대 봇').toBeTruthy();

    // 광대 차례: 광대 봇이 B를 노림
    await N.toTurn(t, 'JOKER', { dayIndex: 1 });
    const kill = await N.botNight(t, joker, U(b));
    expect(kill?.ok, `광대 봇 밤 행동 답 ${JSON.stringify(kill)}`).toBe(true);

    // 의사 차례: A가 화면에서 B 카드 → 보호, 다시 열면 "취소하기" = 서버가 받음
    await N.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    await N.nightActUi(a.page, b.account.nickname, '보호');
    await expect(async () => {
        const menu = await N.openCardMenu(a.page, b.account.nickname, { timeout: 5000 });
        await expect(menu.getByRole('menuitem', { name: '취소하기', exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });

    // 둘째 날: B 삶 (A의 보호가 들어감)
    await N.toDay(t, { dayIndex: 2 });
    expect((await t.player(U(b)))?.alive, 'B 생존').toBe(true);
    await N.expectCard(a.page, b.account.nickname, 'alive');
});

test('A02-H-008 광대 사람 둘(5명 J2C3) 1일 밤 → 서로의 카드에 암살 단추 꺼짐 (시민 카드엔 켜짐) @game @hard', async ({ players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await openHumans(players, 2);
    const wanted = { [U(a)]: 'JOKER', [U(b)]: 'JOKER' };
    const t = await table.setup({ humans: [a, b], bots: 3, settings: { jokerCount: 2 }, roles: wanted });
    const s = await t.state();
    expectRoles(s, wanted);
    const citizen = s.players.find((p) => p.role === 'CITIZEN');

    await N.toTurn(t, 'JOKER', { dayIndex: 1 });
    for (const [me, mate] of [[a, b], [b, a]]) {
        // 메뉴가 막힌 게 아님을 먼저: 시민 카드엔 암살 켜짐
        const menu = await N.openCardMenu(me.page, citizen.nickname);
        await expect(menu.getByRole('menuitem', { name: '암살', exact: true })).toBeEnabled();
        await N.cardButton(me.page, citizen.nickname).click();
        await expect(menu).toBeHidden();
        // 동료 카드: 메뉴가 안 열리거나, 열려도 눌러지는 암살 없음
        await N.cardButton(me.page, mate.account.nickname).click();
        await menu.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
        const killOnMate = menu.getByRole('menuitem', { name: '암살', exact: true });
        expect((await killOnMate.count()) === 0 || (await killOnMate.isDisabled()), `${mate.account.nickname} 카드의 암살`).toBe(true);
        if (await menu.isVisible().catch(() => false)) await N.cardButton(me.page, mate.account.nickname).click();
    }
});
