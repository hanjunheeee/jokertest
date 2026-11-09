// 마녀사냥꾼 밤 행동 시험 파일, 첫 밤엔 없음·둘째 밤부터 죽은 사람 직업 확인만('확인 결과, ○○ 님의 역할은 △△입니다.'), 처형·사망 없음
// 둘째 밤에 죽은 사람이 있게 첫날 낮에 처형하거나 첫 밤에 광대가 죽임
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

/** 첫날만 그 사람에게 투표, 그 뒤로는 기권 */
const voteDay1 = (uuid) => (ctx) => (ctx.snapshot.dayIndex === 1 ? uuid : null);

async function expectConfirm(page, text) {
    await expect(async () => {
        await n.closeNotices(page, { names: ['단계 전환 안내'] });
        await n.closeFinalStatus(page);
        await expect(page.locator('[data-ingame-night-private-result="CONFIRM"]')).toContainText(text, { timeout: 1000 });
    }).toPass({ timeout: 30000 });
}

const WJ = n.custom({ JOKER: 1, WITCH_HUNTER: 1 });

test('마녀사냥꾼인 내가 둘째 밤에 처형된 시민 카드를 확인하면 → "확인 결과, ○○ 님의 역할은 시민입니다." 창이 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: WJ, humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[3];
    t.playBots({ dayVote: voteDay1(dead.account.uuid), tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await n.nightActUi(user.page, dead.nickname, '확인');
    await n.toDay(t, { dayIndex: 3 });
    await expectConfirm(user.page, `확인 결과, ${dead.nickname} 님의 역할은 시민입니다.`);
});

test('마녀사냥꾼인 내가 첫 밤에 광대에게 죽은 의사를 확인하면 → 역할이 의사로 나옴 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, WITCH_HUNTER: 1 }), humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const doctor = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? (ctx) => (ctx.snapshot.dayIndex === 1 ? doctor.account.uuid : undefined) : 'skip' }));
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await n.nightActUi(user.page, doctor.nickname, '확인');
    await n.toDay(t, { dayIndex: 3 });
    await expectConfirm(user.page, `${doctor.nickname} 님의 역할은 의사입니다.`);
});

test('마녀사냥꾼인 내가 처형된 광대를 확인하면 → 역할이 광대로 나옴 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2, WITCH_HUNTER: 1 }), humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[0];
    t.playBots({ dayVote: voteDay1(dead.account.uuid), tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await n.nightActUi(user.page, dead.nickname, '확인');
    await n.toDay(t, { dayIndex: 3 });
    await expectConfirm(user.page, `${dead.nickname} 님의 역할은 광대입니다.`);
});

test('마녀사냥꾼인 내가 처형된 경비원을 확인하면 → 역할이 경비원으로 나옴 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, GUARD: 1, WITCH_HUNTER: 1 }), humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[1];
    t.playBots({ dayVote: voteDay1(dead.account.uuid), tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await n.nightActUi(user.page, dead.nickname, '확인');
    await n.toDay(t, { dayIndex: 3 });
    await expectConfirm(user.page, `${dead.nickname} 님의 역할은 경비원입니다.`);
});

test('마녀사냥꾼인 내 차례에 산 사람 카드를 누르면 → 확인 항목이 잠기고 "대상이 아닙니다" 이유가 붙음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: WJ, humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[3];
    t.playBots({ dayVote: voteDay1(dead.account.uuid), tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    const menu = await n.openCardMenu(user.page, t.bots[1].nickname);
    const item = menu.getByRole('menuitem', { name: '확인', exact: true });
    await expect(item).toBeDisabled();
    await expect(item).toHaveAttribute('title', '대상이 아닙니다');
});

test('마녀사냥꾼인 내 차례에 내 카드를 누르면 → 메뉴가 안 열림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: WJ, humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: voteDay1(t.bots[3].account.uuid), tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await n.expectNoCardMenu(user.page, user.account.nickname);
});

test('마녀사냥꾼인 내가 죽은 사람을 확인해도 → 아무도 처형·사망되지 않고 산 사람 수가 그대로 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: WJ, humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[3];
    t.playBots({ dayVote: voteDay1(dead.account.uuid), tribunal: 'GUILTY', night: 'skip' });
    const before = await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await n.nightActUi(user.page, dead.nickname, '확인');
    const after = await n.toDay(t, { dayIndex: 3 });
    expect(n.aliveCount(after)).toBe(n.aliveCount(before));
    const applied = n.eventsOf(t.bots[0], 'night_result_applied').find((p) => p.dayIndex === 3);
    expect(applied.victimUuid).toBeNull();
    expect(applied.deathReveals).toEqual([]);
});

test('둘째 밤에 죽은 사람이 아무도 없으면 → 마녀사냥꾼 차례는 열리지만 모든 카드의 확인이 잠기고 건너뛰기는 눌림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: WJ, humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    for (const bot of t.bots) {
        const menu = await n.openCardMenu(user.page, bot.nickname);
        await expect(menu.getByRole('menuitem', { name: '확인', exact: true })).toBeDisabled();
        await user.page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
    }
    await expect(n.skipButton(user.page)).toBeEnabled();
});

test('마녀사냥꾼인 내가 건너뛰기를 누르면 → 확인 결과 창이 안 뜨고 셋째 날이 됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: WJ, humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots({ dayVote: voteDay1(t.bots[3].account.uuid), tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await n.nightSkipUi(user.page);
    await n.toDay(t, { dayIndex: 3 });
    await expect(user.page.getByText('제 3일')).toBeVisible();
    await n.sleep(2000);
    expect((await n.readUi(user.page)).privateResults).toEqual([]);
});

test('마녀사냥꾼인 내가 시간 안에 확인을 안 하면 → 마감 뒤 결과 창 없이 낮이 됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: WJ, humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots({ dayVote: voteDay1(t.bots[3].account.uuid), tribunal: 'GUILTY', night: 'skip' });
    await n.toDay(t, { dayIndex: 3 });
    await n.sleep(2000);
    expect((await n.readUi(user.page)).privateResults).toEqual([]);
});

test('마녀사냥꾼인 내가 셋째 밤에도 → 그사이 죽은 사람을 또 확인할 수 있음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: WJ, humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const [first, second] = [t.bots[3], t.bots[4]];
    t.playBots({
        dayVote: (ctx) => (ctx.snapshot.dayIndex === 1 ? first.account.uuid : ctx.snapshot.dayIndex === 2 ? second.account.uuid : null),
        tribunal: 'GUILTY',
        night: 'skip',
    });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 3 });
    await n.nightActUi(user.page, second.nickname, '확인');
    await n.toDay(t, { dayIndex: 4 });
    await expectConfirm(user.page, `${second.nickname} 님의 역할은 시민입니다.`);
});

test('마녀사냥꾼인 내가 확인하면 → 내 화면에 확인 연출이 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: WJ, humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: voteDay1(t.bots[3].account.uuid), tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await n.recordUi(user.page, { autoConfirm: false });
    await n.nightActUi(user.page, t.bots[3].nickname, '확인');
    await expect.poll(async () => (await n.readUi(user.page)).videos, { timeout: 10000 }).toContain('night-success-confirm-user-stacked.mp4');
});

// 봇 규칙
test('마녀사냥꾼 봇이 둘째 밤에 산 사람을 확인하면 → TARGET_NOT_DEAD로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: WJ, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'WITCH_HUNTER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    expect(await n.botNight(t, t.bots[1], user.account.uuid)).toMatchObject({ ok: false, code: 'TARGET_NOT_DEAD' });
});

test('마녀사냥꾼 봇이 자기 자신을 확인하면 → 살아 있어서 TARGET_NOT_DEAD로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: WJ, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'WITCH_HUNTER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    expect(await n.botNight(t, t.bots[1], t.bots[1].account.uuid)).toMatchObject({ ok: false, code: 'TARGET_NOT_DEAD' });
});

test('마녀사냥꾼 봇이 죽은 사람을 확인하면 → 결과 사건에 CONFIRM·대상 id·역할이 실려 옴 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: WJ, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'WITCH_HUNTER'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[3];
    t.playBots((bot, i) => ({ dayVote: voteDay1(dead.account.uuid), tribunal: 'GUILTY', night: i === 1 ? dead.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 3 });
    expect(n.eventsOf(t.bots[1], 'night_action_result')).toEqual([
        expect.objectContaining({ actionType: 'CONFIRM', targetId: dead.account.uuid, role: 'CITIZEN', dayIndex: 2 }),
    ]);
});

test('마녀사냥꾼이 확인한 밤엔 → 사망 공개에 마녀사냥꾼 원인이 없고 광대가 죽인 사람만 JOKER 원인으로 나옴 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: WJ, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'WITCH_HUNTER'] });
    await ui.readRoleReveal(user.page);
    const [dead, victim] = [t.bots[3], t.bots[4]];
    t.playBots((bot, i) => ({
        dayVote: voteDay1(dead.account.uuid),
        tribunal: 'GUILTY',
        night: i === 1 ? dead.account.uuid : i === 0 ? (ctx) => (ctx.snapshot.dayIndex === 2 ? victim.account.uuid : undefined) : 'skip',
    }));
    await n.toDay(t, { dayIndex: 3 });
    const applied = n.eventsOf(t.bots[2], 'night_result_applied').find((p) => p.dayIndex === 3);
    expect(applied.deathReveals).toEqual([{ victimUuid: victim.account.uuid, source: 'JOKER' }]);
});

test('마녀사냥꾼 봇 둘이 같은 죽은 사람을 확인하면 → 둘 다 결과를 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 1, WITCH_HUNTER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'WITCH_HUNTER', 'WITCH_HUNTER'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[4];
    t.playBots((bot, i) => ({ dayVote: voteDay1(dead.account.uuid), tribunal: 'GUILTY', night: i === 1 || i === 2 ? dead.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 3 });
    expect(n.eventsOf(t.bots[1], 'night_action_result')).toHaveLength(1);
    expect(n.eventsOf(t.bots[2], 'night_action_result')).toHaveLength(1);
});

test('마녀사냥꾼 봇 둘이 서로 다른 죽은 사람을 확인하면 → 만장일치가 안 돼 아무도 결과를 못 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 6, settings: n.custom({ JOKER: 1, WITCH_HUNTER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'WITCH_HUNTER', 'WITCH_HUNTER'] });
    await ui.readRoleReveal(user.page);
    const [deadA, deadB] = [t.bots[4], t.bots[5]];
    t.playBots((bot, i) => ({
        dayVote: voteDay1(deadA.account.uuid),
        tribunal: 'GUILTY',
        night: i === 0 ? (ctx) => (ctx.snapshot.dayIndex === 1 ? deadB.account.uuid : undefined) : i === 1 ? deadA.account.uuid : i === 2 ? deadB.account.uuid : 'skip',
    }));
    await n.toDay(t, { dayIndex: 3 });
    expect(n.eventsOf(t.bots[1], 'night_action_result')).toEqual([]);
    expect(n.eventsOf(t.bots[2], 'night_action_result')).toEqual([]);
});

test('둘째 밤 광대에게 찍힌 마녀사냥꾼을 의사가 못 살리면 → 확인해도 결과를 못 받고 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 1, DOCTOR: 1, WITCH_HUNTER: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'WITCH_HUNTER'] });
    await ui.readRoleReveal(user.page);
    const [wh, dead] = [t.bots[2], t.bots[4]];
    t.playBots((bot, i) => ({
        dayVote: voteDay1(dead.account.uuid),
        tribunal: 'GUILTY',
        night: i === 0 ? (ctx) => (ctx.snapshot.dayIndex === 2 ? wh.account.uuid : undefined) : i === 2 ? dead.account.uuid : 'skip',
    }));
    const s = await n.toDay(t, { dayIndex: 3 });
    expect(n.rowOf(s, wh.account.uuid).alive).toBe(false);
    expect(n.eventsOf(wh, 'night_action_result')).toEqual([]);
});

test('둘째 밤 광대에게 찍힌 마녀사냥꾼을 의사가 살리면 → 확인 결과를 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 1, DOCTOR: 1, WITCH_HUNTER: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'WITCH_HUNTER'] });
    await ui.readRoleReveal(user.page);
    const [wh, dead] = [t.bots[2], t.bots[4]];
    const whOnNight2 = (ctx) => (ctx.snapshot.dayIndex === 2 ? wh.account.uuid : undefined);
    t.playBots((bot, i) => ({
        dayVote: voteDay1(dead.account.uuid),
        tribunal: 'GUILTY',
        night: i === 0 || i === 1 ? whOnNight2 : i === 2 ? dead.account.uuid : 'skip',
    }));
    const s = await n.toDay(t, { dayIndex: 3 });
    expect(n.rowOf(s, wh.account.uuid).alive).toBe(true);
    expect(n.eventsOf(wh, 'night_action_result')).toHaveLength(1);
});

test('사람 둘 중 마녀사냥꾼인 나만 확인 결과를 보고 → 시민인 다른 사람 화면엔 안 뜸 @game', async ({ user, players, table }) => {
    const p2 = await players.add();
    const t = await n.setup(table, { humans: [user, p2], bots: 3, settings: WJ, humanRoles: ['WITCH_HUNTER', 'CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await ui.readRoleReveal(p2.page);
    await n.recordUi(p2.page);
    const dead = t.bots[2];
    t.playBots({ dayVote: voteDay1(dead.account.uuid), tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    await n.nightActUi(user.page, dead.nickname, '확인');
    await n.toDay(t, { dayIndex: 3 });
    await expectConfirm(user.page, '시민');
    await n.sleep(1500);
    expect((await n.readUi(p2.page)).privateResults).toEqual([]);
});

test('마녀사냥꾼이 첫 밤에 죽으면 → 둘째 밤에도 마녀사냥꾼 차례는 빈 차례로 열림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: WJ, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'WITCH_HUNTER'] });
    await ui.readRoleReveal(user.page);
    const wh = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? (ctx) => (ctx.snapshot.dayIndex === 1 ? wh.account.uuid : undefined) : 'skip' }));
    await n.toDay(t, { dayIndex: 3 });
    expect(n.turnOrder(t.bots[0], 2)).toEqual(['JOKER', 'WITCH_HUNTER']);
});
