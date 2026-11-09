// 경비원 밤 행동 시험 파일, 조사 결과 창('조사 결과, ○○ 님의 역할은 △△입니다.')·광대 찾음·찍혀서 막힘·경비원 여럿 만장일치
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

const RESULT_DIALOG = '밤 조사 결과';

/** 조사 결과 창 글자 기다리기 (낮 안내 창은 닫으면서) */
async function expectResult(page, text) {
    await expect(async () => {
        await n.closeNotices(page, { names: ['단계 전환 안내'] });
        await n.closeFinalStatus(page);
        await expect(page.locator('[data-ingame-night-private-result="INVESTIGATE"]')).toContainText(text, { timeout: 1000 });
    }).toPass({ timeout: 30000 });
}

const TARGETS = [
    { role: 'JOKER', counts: { JOKER: 1, GUARD: 1 }, botRoles: ['JOKER'] },
    { role: 'CITIZEN', counts: { JOKER: 1, GUARD: 1 }, botRoles: ['JOKER', 'CITIZEN'] },
    { role: 'DOCTOR', counts: { JOKER: 1, GUARD: 1, DOCTOR: 1 }, botRoles: ['JOKER', 'DOCTOR'] },
    { role: 'WITCH_HUNTER', counts: { JOKER: 1, GUARD: 1, WITCH_HUNTER: 1 }, botRoles: ['JOKER', 'WITCH_HUNTER'] },
];

for (const c of TARGETS) {
    test(`경비원인 내가 ${n.josa(n.ROLE_NAMES[c.role], '을', '를')} 조사하면 → '조사 결과, ○○ 님의 역할은 ${n.ROLE_NAMES[c.role]}입니다.' 창이 뜸 @game`, async ({ user, table }) => {
        const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom(c.counts), humanRoles: ['GUARD'], botRoles: c.botRoles });
        await ui.readRoleReveal(user.page);
        t.playBots({ dayVote: 'abstain', night: 'skip' });
        await n.toTurn(t, 'GUARD');
        const target = t.bots[c.botRoles.length - 1];
        await n.nightActUi(user.page, target.nickname, '조사');
        await n.toDay(t, { dayIndex: 2 });
        await expectResult(user.page, `조사 결과, ${target.nickname} 님의 역할은 ${n.ROLE_NAMES[c.role]}입니다.`);
    });
}

test('경비원인 내가 조사 결과 창의 확인을 누르면 → 창이 닫히고 다시 안 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'GUARD');
    await n.nightActUi(user.page, t.bots[0].nickname, '조사');
    await n.toDay(t, { dayIndex: 2 });
    await expectResult(user.page, '광대');
    const dialog = user.page.getByRole('dialog', { name: RESULT_DIALOG });
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(user.page.locator('[data-ingame-night-private-result]')).toHaveCount(0);
    await n.sleep(1500);
    await expect(user.page.locator('[data-ingame-night-private-result]')).toHaveCount(0);
});

test('경비원인 내가 조사하면 → 내 화면에 조사 연출이 뜨고 서버는 내게만 조사 결과를 보냄 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page, { autoConfirm: false });
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'GUARD');
    await n.nightActUi(user.page, t.bots[1].nickname, '조사');
    await expect.poll(async () => (await n.readUi(user.page)).videos, { timeout: 10000 }).toContain('night-success-investigate-user-stacked.mp4');
    await n.toDay(t, { dayIndex: 2 });
    for (const bot of t.bots) expect(n.eventsOf(bot, 'night_action_result')).toEqual([]);
});

test('시민인 나를 경비원 봇이 조사하면 → 내게는 조사자 없이 "연출 자료 대기 중입니다." 임시 연출만 뜨고 결과 창은 없음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'GUARD'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 1 ? me : 'skip' }));
    // 봇 경비원은 차례가 열리자마자 내서 차례가 바로 닫힘 → 경비원 차례 끝 사건까지만 넘김 (그 뒤 연출 대기 동안 내 화면 봄)
    await n.advanceUntilSettled(t, () => n.eventsOf(t.bots[0], 'night_turn_ended').some((p) => p.role === 'GUARD'));
    const pending = user.page.locator('[data-ingame-night-success-pending]');
    await expect(async () => {
        await n.closeNotices(user.page);
        await expect(pending).toContainText('연출 자료 대기 중입니다.', { timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await expect(pending).not.toContainText(t.bots[1].nickname);
    await pending.getByRole('button', { name: '확인' }).click();
    await n.toDay(t, { dayIndex: 2 });
    await expect(user.page.locator('[data-ingame-night-private-result]')).toHaveCount(0);
});

test('사람 둘 중 경비원인 나만 조사 결과 창을 보고 → 시민인 다른 사람 화면엔 안 뜸 @game', async ({ user, players, table }) => {
    const p2 = await players.add();
    const t = await n.setup(table, { humans: [user, p2], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['GUARD', 'CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await ui.readRoleReveal(p2.page);
    await n.recordUi(p2.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'GUARD');
    await n.nightActUi(user.page, t.bots[0].nickname, '조사');
    await n.toDay(t, { dayIndex: 2 });
    await expectResult(user.page, '광대');
    await n.sleep(1500);
    expect((await n.readUi(p2.page)).privateResults).toEqual([]);
});

test('광대에게 찍힌 경비원인 내가 의사에게 못 살면 → 조사해도 결과를 못 받고 내가 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, GUARD: 1, DOCTOR: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER', 'DOCTOR'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? me : 'skip' }));
    await n.toTurn(t, 'GUARD');
    await n.nightActUi(user.page, t.bots[0].nickname, '조사');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, me).alive).toBe(false);
    await n.sleep(2000);
    expect((await n.readUi(user.page)).privateResults).toEqual([]);
});

test('광대에게 찍힌 경비원인 나를 의사가 살리면 → 조사 결과를 받고 살아남음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, GUARD: 1, DOCTOR: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER', 'DOCTOR'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i <= 1 ? me : 'skip' }));
    await n.toTurn(t, 'GUARD');
    await n.nightActUi(user.page, t.bots[0].nickname, '조사');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, me).alive).toBe(true);
    await expectResult(user.page, `${t.bots[0].nickname} 님의 역할은 광대입니다.`);
});

test('경비원인 내가 건너뛰기를 누르면 → 조사 결과 창이 안 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'GUARD');
    await n.nightSkipUi(user.page);
    await n.toDay(t, { dayIndex: 2 });
    await n.sleep(2000);
    expect((await n.readUi(user.page)).privateResults).toEqual([]);
});

test('경비원인 내가 시간 안에 조사를 안 하면 → 마감 뒤 낮이 되고 조사 결과 창이 안 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toDay(t, { dayIndex: 2 });
    await n.sleep(2000);
    expect((await n.readUi(user.page)).privateResults).toEqual([]);
});

test('경비원인 내가 내 카드를 누르면 → 조사 메뉴가 안 열림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'GUARD');
    await n.expectNoCardMenu(user.page, user.account.nickname);
});

test('경비원인 내가 처형된 사람 카드를 누르면 → 조사 항목이 잠기고 "대상이 아닙니다" 이유가 붙음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[3];
    t.playBots({ dayVote: dead.account.uuid, tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'GUARD', { dayIndex: 1 });
    const menu = await n.openCardMenu(user.page, dead.nickname);
    const item = menu.getByRole('menuitem', { name: '조사', exact: true });
    await expect(item).toBeDisabled();
    await expect(item).toHaveAttribute('title', '대상이 아닙니다');
});

// 봇 경비원 규칙
test('경비원 봇이 자기 자신을 조사하면 → INVALID_TARGET으로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'GUARD');
    expect(await n.botNight(t, t.bots[1], t.bots[1].account.uuid)).toMatchObject({ ok: false, code: 'INVALID_TARGET' });
});

test('경비원 봇이 처형된 사람을 조사하면 → TARGET_NOT_ALIVE로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[3];
    t.playBots({ dayVote: dead.account.uuid, tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'GUARD', { dayIndex: 1 });
    expect(await n.botNight(t, t.bots[1], dead.account.uuid)).toMatchObject({ ok: false, code: 'TARGET_NOT_ALIVE' });
});

test('경비원 봇이 광대를 조사하면 → 결과 사건에 대상 id와 역할 JOKER가 실려 옴 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    const [joker, guard] = [t.bots[0], t.bots[1]];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 1 ? joker.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    const results = n.eventsOf(guard, 'night_action_result');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ actionType: 'INVESTIGATE', targetId: joker.account.uuid, role: 'JOKER', dayIndex: 1 });
});

test('경비원이 조사한 사람이 그 밤 광대에게 죽어도 → 조사 결과는 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[2];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toTurn(t, 'GUARD');
    await n.nightActUi(user.page, victim.nickname, '조사');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
    await expectResult(user.page, `${victim.nickname} 님의 역할은 시민입니다.`);
});

test('경비원이 조사해도 → 조사받은 사람은 안 죽고 다음 날 그대로 살아 있음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'GUARD');
    await n.nightActUi(user.page, t.bots[0].nickname, '조사');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.aliveCount(s)).toBe(4);
    await n.expectCard(user.page, t.bots[0].nickname, 'alive');
});

// 경비원 여럿
const TWO_GUARDS = n.custom({ JOKER: 1, GUARD: 2 });

test('경비원 봇 둘이 같은 사람을 조사하면 → 둘 다 같은 조사 결과를 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: TWO_GUARDS, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'GUARD', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    const joker = t.bots[0];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 1 || i === 2 ? joker.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    for (const guard of [t.bots[1], t.bots[2]]) {
        expect(n.eventsOf(guard, 'night_action_result')).toEqual([expect.objectContaining({ actionType: 'INVESTIGATE', role: 'JOKER' })]);
    }
});

test('경비원 봇 둘이 서로 다른 사람을 조사하면 → 만장일치가 안 돼 아무도 결과를 못 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: TWO_GUARDS, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'GUARD', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 1 ? t.bots[0].account.uuid : i === 2 ? user.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    expect(n.eventsOf(t.bots[1], 'night_action_result')).toEqual([]);
    expect(n.eventsOf(t.bots[2], 'night_action_result')).toEqual([]);
});

test('경비원 봇 둘 중 하나만 조사하고 하나는 시간 초과면 → 둘 다 그 조사 결과를 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: TWO_GUARDS, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'GUARD', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 1 ? t.bots[0].account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    expect(n.eventsOf(t.bots[1], 'night_action_result')).toHaveLength(1);
    expect(n.eventsOf(t.bots[2], 'night_action_result')).toHaveLength(1);
});

test('경비원인 나와 경비원 봇이 같은 광대를 조사하면 → 내 화면에 광대 결과 창이 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: TWO_GUARDS, humanRoles: ['GUARD'], botRoles: ['JOKER', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    const joker = t.bots[0];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 1 ? joker.account.uuid : 'skip' }));
    await n.toTurn(t, 'GUARD');
    await n.nightActUi(user.page, joker.nickname, '조사');
    await n.toDay(t, { dayIndex: 2 });
    await expectResult(user.page, `${joker.nickname} 님의 역할은 광대입니다.`);
});

test('경비원인 나와 경비원 봇이 서로 다른 사람을 조사하면 → 내 화면에 결과 창이 안 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: TWO_GUARDS, humanRoles: ['GUARD'], botRoles: ['JOKER', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 1 ? t.bots[0].account.uuid : 'skip' }));
    await n.toTurn(t, 'GUARD');
    await n.nightActUi(user.page, t.bots[2].nickname, '조사');
    await n.toDay(t, { dayIndex: 2 });
    await n.sleep(2000);
    expect((await n.readUi(user.page)).privateResults).toEqual([]);
});
