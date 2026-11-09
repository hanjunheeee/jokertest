// 의사 밤 행동 시험 파일, 살리기(광대가 노린 사람 보호)·자기 살리기 규칙·의사 여럿 만장일치·살렸을 때 연출(치료 영상·최종 생존 창)
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

const JD = n.custom({ JOKER: 1, DOCTOR: 1 });

test('의사인 내가 광대가 노린 사람을 보호하면 → 아침에 그 사람이 살아 있고 카드도 생존 표시 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toTurn(t, 'DOCTOR');
    await n.nightActUi(user.page, victim.nickname, '보호');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(true);
    expect(n.aliveCount(s)).toBe(4);
    await expect(user.page.getByText('제 2일')).toBeVisible();
    await n.expectCard(user.page, victim.nickname, 'alive');
});

test('의사인 내가 광대가 노리지 않은 사람을 보호하면 → 광대가 노린 사람은 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const [victim, other] = [t.bots[1], t.bots[2]];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toTurn(t, 'DOCTOR');
    await n.nightActUi(user.page, other.nickname, '보호');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
    expect(n.rowOf(s, other.account.uuid).alive).toBe(true);
    await n.expectCard(user.page, victim.nickname, 'dead');
});

test('의사인 내가 광대가 노린 사람을 살리면 → 내 화면에 치료 연출이 뜨고 서버도 치료 성공 사건을 보냄 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page, { autoConfirm: false });
    const victim = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toTurn(t, 'DOCTOR');
    await n.nightActUi(user.page, victim.nickname, '보호');
    await expect.poll(async () => (await n.readUi(user.page)).videos, { timeout: 10000 }).toContain('night-success-heal-stacked.mp4');
    await expect.poll(() => n.eventsOf(victim, 'night_action_success').map((p) => p.type), { timeout: 10000 }).toEqual(['KILL', 'HEAL']);
});

test('광대가 아무도 안 노린 밤에 의사인 내가 보호하면 → 치료 연출도 치료 사건도 없음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'DOCTOR');
    const target = t.bots[1];
    await n.nightActUi(user.page, target.nickname, '보호');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.aliveCount(s)).toBe(4);
    expect((await n.readUi(user.page)).kills).toBe(0);
    expect(n.eventsOf(target, 'night_action_success')).toEqual([]);
});

test('의사인 내가 건너뛰기를 누르면 → 의사 차례가 바로 끝나고 광대가 노린 사람은 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toTurn(t, 'DOCTOR');
    await n.nightSkipUi(user.page);
    await expect.poll(() => n.eventsOf(t.bots[0], 'night_turn_ended').some((p) => p.role === 'DOCTOR'), { timeout: 8000 }).toBe(true);
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
});

test('의사인 내가 의사 차례에 시간 안에 안 고르면 → 마감 때 건너뛴 것으로 되고 광대가 노린 사람은 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[2];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
});

test('의사인 내가 의사 차례에 내 카드를 누르면 → 보호 항목이 있어 나를 살릴 수 있음 (서버는 의사 자기 보호 허용) @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? user.account.uuid : 'skip' }));
    await n.toTurn(t, 'DOCTOR');
    const menu = await n.openCardMenu(user.page, user.account.nickname);
    await menu.getByRole('menuitem', { name: '보호', exact: true }).click();
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, user.account.uuid).alive).toBe(true);
});

test('광대가 의사인 나를 노려도 → 의사 차례에 보호 메뉴가 잠기지 않고 눌림 (의사는 찍혀도 행동함) @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? user.account.uuid : 'skip' }));
    await n.toTurn(t, 'DOCTOR');
    const menu = await n.openCardMenu(user.page, t.bots[1].nickname);
    await expect(menu.getByRole('menuitem', { name: '보호', exact: true })).toBeEnabled();
});

test('광대가 의사인 나를 노렸는데 내가 다른 사람을 보호하면 → 내가 죽고 "최종 결과, 사망했습니다." 창이 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? me : 'skip' }));
    await n.toTurn(t, 'DOCTOR');
    await n.nightActUi(user.page, t.bots[1].nickname, '보호');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, me).alive).toBe(false);
    await expect.poll(async () => (await n.readUi(user.page)).finals, { timeout: 20000 }).toEqual(['DEAD']);
});

// 봇 의사 규칙
test('의사 봇이 자기를 보호한 밤에 광대가 의사를 노리면 → 의사가 살아남음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const doctor = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 || i === 1 ? doctor.account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, doctor.account.uuid).alive).toBe(true);
    await n.expectCard(user.page, doctor.nickname, 'alive');
});

test('의사 봇이 자기를 보호한 밤에 광대가 다른 사람(나)을 노리면 → 내가 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    const doctor = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? me : i === 1 ? doctor.account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, me).alive).toBe(false);
});

test('의사 봇이 자기 자신을 보호로 보내면 → 받아짐 (다른 직업과 달리 의사만 자기 지목 허용) @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'DOCTOR');
    expect(await n.botNight(t, t.bots[1], t.bots[1].account.uuid)).toMatchObject({ ok: true });
});

test('의사 봇이 낮에 처형된 사람을 보호하면 → TARGET_NOT_ALIVE로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: JD, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[3];
    t.playBots({ dayVote: dead.account.uuid, tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    expect(await n.botNight(t, t.bots[1], dead.account.uuid)).toMatchObject({ ok: false, code: 'TARGET_NOT_ALIVE' });
});

test('의사 봇이 살리면 → 의사에겐 대상 id가 실린 치료 성공(USER 시점), 대상에겐 대상 시점 사건이 감 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const [doctor, victim] = [t.bots[1], t.bots[2]];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i <= 1 ? victim.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    const toDoctor = n.eventsOf(doctor, 'night_action_success').find((p) => p.type === 'HEAL');
    const toVictim = n.eventsOf(victim, 'night_action_success').find((p) => p.type === 'HEAL');
    expect(toDoctor).toMatchObject({ perspectives: ['USER'], targetId: victim.account.uuid });
    expect(toVictim.perspectives).toEqual(['TARGET']);
    expect(toVictim.targetId).toBeUndefined();
});

// 의사 여럿 (만장일치)
const TWO_DOCTORS = n.custom({ JOKER: 1, DOCTOR: 2 });

test('의사 봇 둘이 광대가 노린 같은 사람을 보호하면 → 살아남음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: TWO_DOCTORS, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[3];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i <= 2 ? victim.account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(true);
});

test('의사 봇 둘이 서로 다른 사람을 보호하면 → 만장일치가 안 돼 아무도 못 살리고 광대 대상이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: TWO_DOCTORS, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[3];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 || i === 1 ? victim.account.uuid : i === 2 ? user.account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
});

test('의사 봇 둘 중 하나만 보호하고 하나는 시간 초과면 → 보호한 사람이 살아남음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: TWO_DOCTORS, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[3];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 || i === 1 ? victim.account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(true);
});

test('의사인 나와 의사 봇이 같은 사람을 보호하면 → 광대가 노린 그 사람이 살아남음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: TWO_DOCTORS, humanRoles: ['DOCTOR'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[2];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i <= 1 ? victim.account.uuid : 'skip' }));
    await n.toTurn(t, 'DOCTOR');
    await n.nightActUi(user.page, victim.nickname, '보호');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(true);
});

test('의사인 나와 의사 봇이 서로 다른 사람을 보호하면 → 광대가 노린 사람이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: TWO_DOCTORS, humanRoles: ['DOCTOR'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const [victim, other] = [t.bots[2], t.bots[3]];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : i === 1 ? other.account.uuid : 'skip' }));
    await n.toTurn(t, 'DOCTOR');
    await n.nightActUi(user.page, victim.nickname, '보호');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
});

test('의사가 밤에 죽은 다음 밤에도 → 의사 차례는 열리고(빈 차례) 광대가 노린 사람은 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: JD, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const [doctor, second] = [t.bots[1], t.bots[2]];
    t.playBots((bot, i) => ({
        dayVote: 'abstain',
        night: i === 0 ? (ctx) => (ctx.snapshot.dayIndex === 1 ? doctor.account.uuid : second.account.uuid) : 'skip',
    }));
    await n.toDay(t, { dayIndex: 3 });
    expect(n.turnOrder(t.bots[0], 2)).toEqual(['JOKER', 'DOCTOR']);
    const s = await t.state();
    expect(n.rowOf(s, doctor.account.uuid).alive).toBe(false);
    expect(n.rowOf(s, second.account.uuid).alive).toBe(false);
});

test('의사 봇이 이틀 밤 연속 같은 사람을 보호해도 → 둘째 밤에도 그 사람을 살림 (연속 보호 막힘 없음) @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i <= 1 ? me : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 3 });
    expect(n.rowOf(s, me).alive).toBe(true);
    expect(n.eventsOf(t.bots[1], 'night_action_success').filter((p) => p.type === 'HEAL').length).toBe(2);
});

test('광대가 노린 시민인 나를 의사 봇이 살리면 → "최종 결과, 생존했습니다." 창이 뜨고 확인하면 닫힘 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i <= 1 ? me : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    const final = user.page.locator('[data-ingame-night-success-final]');
    await expect(async () => {
        await n.closeNotices(user.page, { names: ['단계 전환 안내'] });
        await expect(final).toHaveAttribute('data-ingame-night-success-final', 'ALIVE', { timeout: 1000 });
    }).toPass({ timeout: 30000 });
    await expect(final).toContainText('최종 결과, 생존했습니다.');
    await final.getByRole('button', { name: '확인' }).click();
    await expect(final).toHaveCount(0);
    await n.expectCard(user.page, user.account.nickname, 'alive');
});

test('광대가 노린 시민인 나를 의사 봇이 살리면 → 내 화면에 암살·치료 연출이 둘 다 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: JD, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i <= 1 ? me : 'skip' }));
    await n.toDay(t, { dayIndex: 2, stepDelayMs: 1500 });
    await expect.poll(async () => (await n.readUi(user.page)).videos, { timeout: 20000 })
        .toEqual(['night-success-kill-target-stacked.mp4', 'night-success-heal-stacked.mp4']);
});
