// 밤 카드 메뉴 시험 파일, 직업별로 어느 카드에 행동 항목이 켜지는지·죽은 행동자는 잠김·메뉴 닫기/옮기기·행동 뒤 버튼 잠김·차례 바뀌면 메뉴 닫힘
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

const MENU = '플레이어 행동';

/** 메뉴 열고 항목 상태 읽기 → { enabled, title } (항목 없으면 null) */
async function readItem(page, nickname, label) {
    const menu = await n.openCardMenu(page, nickname);
    const item = menu.getByRole('menuitem', { name: label, exact: true });
    const out = (await item.count()) === 0 ? null : { enabled: await item.isEnabled(), title: await item.getAttribute('title') };
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    return out;
}

const SELF_ROLES = [
    { role: 'JOKER', counts: { JOKER: 2, DOCTOR: 1 }, botRoles: ['JOKER', 'DOCTOR'], skip: 0 },
    { role: 'DOCTOR', counts: { JOKER: 1, DOCTOR: 1 }, botRoles: ['JOKER'], skip: -1 },
    { role: 'GUARD', counts: { JOKER: 1, GUARD: 1 }, botRoles: ['JOKER'], skip: -1 },
];

for (const c of SELF_ROLES) {
    const label = n.ACTION_LABELS[c.role];
    test(`${n.ROLE_NAMES[c.role]}인 내 차례에 산 사람 카드를 하나씩 누르면 → ${c.role === 'JOKER' ? '동료 광대 빼고 ' : ''}모든 카드에 '${label}' 항목이 켜져 있음 @game`, async ({ user, table }) => {
        const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom(c.counts), humanRoles: [c.role], botRoles: c.botRoles });
        await ui.readRoleReveal(user.page);
        t.playBots({ dayVote: 'abstain', night: 'skip' });
        await n.toTurn(t, c.role);
        for (const [i, bot] of t.bots.entries()) {
            if (i === c.skip) continue;
            expect(await readItem(user.page, bot.nickname, label)).toEqual({ enabled: true, title: null });
        }
        if (c.skip >= 0) await n.expectNoCardMenu(user.page, t.bots[c.skip].nickname);
    });
}

test('광대 둘 중 낮에 처형된 광대인 내게 그날 밤 광대 차례가 와도 → 암살 항목이 잠기고 "사망한 플레이어는 행동할 수 없습니다" 이유가 붙음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['JOKER'], botRoles: ['JOKER'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: (ctx) => (ctx.snapshot.dayIndex === 1 ? me : null), tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'JOKER', { dayIndex: 1 });
    expect((await t.player(me)).alive).toBe(false);
    expect(await readItem(user.page, t.bots[2].nickname, '암살')).toEqual({ enabled: false, title: '사망한 플레이어는 행동할 수 없습니다' });
});

test('첫 밤에 죽은 경비원인 내게 둘째 밤 경비원 차례가 와도 → 조사 항목이 잠기고 사망 이유가 붙음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? (ctx) => (ctx.snapshot.dayIndex === 1 ? me : undefined) : 'skip' }));
    await n.toTurn(t, 'GUARD', { dayIndex: 2 });
    expect(await readItem(user.page, t.bots[1].nickname, '조사')).toEqual({ enabled: false, title: '사망한 플레이어는 행동할 수 없습니다' });
});

test('광대인 내가 카드 메뉴를 연 뒤 Esc를 누르면 → 메뉴가 닫히고 아무 행동도 안 보내져 광대 차례가 그대로 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['JOKER'], botRoles: ['DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const menu = await n.openCardMenu(user.page, t.bots[1].nickname);
    await user.page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await n.sleep(1200);
    expect((await t.state()).nightTurnRole).toBe('JOKER');
});

test('광대인 내가 메뉴를 연 카드에서 키보드 Enter를 다시 누르면 → 메뉴가 닫힘 (메뉴가 카드를 덮어 마우스로는 다시 못 누름) @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const menu = await n.openCardMenu(user.page, t.bots[0].nickname);
    await n.cardButton(user.page, t.bots[0].nickname).focus();
    await user.page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(n.cardButton(user.page, t.bots[0].nickname)).toHaveAttribute('aria-expanded', 'false');
});

test('광대인 내가 한 카드 메뉴를 연 채 다른 카드를 누르면 → 메뉴가 그 카드로 옮겨감 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.openCardMenu(user.page, t.bots[0].nickname);
    await n.cardButton(user.page, t.bots[1].nickname).click();
    await expect(n.cardButton(user.page, t.bots[1].nickname)).toHaveAttribute('aria-expanded', 'true');
    await expect(n.cardButton(user.page, t.bots[0].nickname)).toHaveAttribute('aria-expanded', 'false');
    await expect(user.page.getByRole('menu', { name: MENU })).toHaveCount(1);
});

test('광대 둘 중 내가 암살을 고르면 → 같은 차례 동안 건너뛰기 버튼이 잠김 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['JOKER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    // '밤이 되었습니다' 안내가 떠 있는 동안은 조작이 잠김 → 닫고 봄
    await expect(async () => {
        await n.closeNotices(user.page);
        await expect(n.skipButton(user.page)).toBeEnabled({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await n.nightActUi(user.page, t.bots[2].nickname, '암살');
    await expect(n.skipButton(user.page)).toBeDisabled();
    expect((await t.state()).nightTurnRole).toBe('JOKER');
});

test('광대인 내가 카드 메뉴를 연 채 광대 차례가 마감되면 → 열려 있던 메뉴가 닫힘 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['JOKER'], botRoles: ['DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const menu = await n.openCardMenu(user.page, t.bots[1].nickname);
    await n.toTurn(t, 'DOCTOR');
    await expect(menu).toBeHidden({ timeout: 10000 });
});

test('광대인 내가 "밤 종료"를 눌러도 → 차례가 남아 있어 밤이 바로 끝나지 않고 광대 차례가 그대로 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['JOKER'], botRoles: ['DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const resolve = user.page.locator('[data-ingame-phase-action="nightResolve"]');
    await expect(async () => {
        await n.closeNotices(user.page);
        await resolve.click({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await n.sleep(1500);
    const s = await t.state();
    expect(s.phase).toBe('NIGHT');
    expect(s.nightTurnRole).toBe('JOKER');
});

test('의사인 내가 보호를 고르면 → 의사 차례가 마감을 안 기다리고 바로 닫힘 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'DOCTOR');
    await n.nightActUi(user.page, t.bots[1].nickname, '보호');
    await expect.poll(() => n.eventsOf(t.bots[0], 'night_turn_ended').some((p) => p.role === 'DOCTOR'), { timeout: 5000 }).toBe(true);
});

test('경비원인 내가 조사를 고르면 → 경비원 차례가 마감을 안 기다리고 바로 닫힘 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'GUARD');
    await n.nightActUi(user.page, t.bots[0].nickname, '조사');
    await expect.poll(() => n.eventsOf(t.bots[0], 'night_turn_ended').some((p) => p.role === 'GUARD'), { timeout: 5000 }).toBe(true);
});

test('마녀사냥꾼인 내가 확인을 고르면 → 마녀사냥꾼 차례가 마감을 안 기다리고 바로 닫힘 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, WITCH_HUNTER: 1 }), humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[3];
    t.playBots({ dayVote: (ctx) => (ctx.snapshot.dayIndex === 1 ? dead.account.uuid : null), tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await n.nightActUi(user.page, dead.nickname, '확인');
    await expect.poll(() => n.eventsOf(t.bots[0], 'night_turn_ended').some((p) => p.role === 'WITCH_HUNTER'), { timeout: 5000 }).toBe(true);
});

test('의사인 내 차례가 끝나 경비원 차례가 되면 → 카드 메뉴가 다시 안 열림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['DOCTOR'], botRoles: ['JOKER', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'GUARD');
    await n.expectNoCardMenu(user.page, t.bots[2].nickname);
});

test('밤이 두 번 지나는 동안 → "낮이 되었습니다"·"밤이 되었습니다" 안내가 낮·밤·낮·밤·낮 순서로 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toDay(t, { dayIndex: 3, stepDelayMs: 1200 });
    await expect.poll(async () => (await n.readUi(user.page)).entrances, { timeout: 10000 }).toEqual(['DAY', 'NIGHT', 'DAY', 'NIGHT', 'DAY']);
});

test('사람 의사가 사람 시민을 광대 봇에게서 살리면 → 살아난 시민 화면에 "최종 결과, 생존했습니다." 창이 뜸 @game', async ({ user, players, table }) => {
    const p2 = await players.add();
    const t = await n.setup(table, { humans: [user, p2], bots: 2, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['DOCTOR', 'CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await ui.readRoleReveal(p2.page);
    await n.recordUi(p2.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? p2.account.uuid : 'skip' }));
    await n.toTurn(t, 'DOCTOR');
    await n.nightActUi(user.page, p2.account.nickname, '보호');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, p2.account.uuid).alive).toBe(true);
    await expect.poll(async () => (await n.readUi(p2.page)).finals, { timeout: 25000 }).toEqual(['ALIVE']);
});
