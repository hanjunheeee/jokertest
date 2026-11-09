// 여러 직업이 같은 밤에 함께 움직이는 시험 파일, 암살·보호·조사·확인이 겹칠 때 결과(죽음·살림·개인 결과)가 서로 맞는지
// 사람 1명은 시민으로 구경하며 카드 상태를 보고, 봇마다 밤 대상을 정해 둠
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

const uuid = (bot) => bot.account.uuid;
/** 봇마다 날짜별 밤 대상 (없으면 안 냄), 낮은 dayAll 날짜별 투표·유죄 */
function playNights(t, nights, { dayAll = {} } = {}) {
    t.playBots((bot, i) => ({
        dayVote: (ctx) => dayAll[ctx.snapshot.dayIndex] ?? null,
        tribunal: 'GUILTY',
        night: (ctx) => (nights[i] ?? {})[ctx.snapshot.dayIndex],
    }));
}

test('같은 밤에 의사가 광대 대상을 살리고 경비원이 광대를 조사하면 → 아무도 안 죽고 경비원은 광대 결과를 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, d, g, c] = t.bots;
    playNights(t, [{ 1: uuid(c) }, { 1: uuid(c) }, { 1: uuid(j) }]);
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.aliveCount(s)).toBe(5);
    expect(n.eventsOf(g, 'night_action_result')).toEqual([expect.objectContaining({ actionType: 'INVESTIGATE', role: 'JOKER' })]);
    expect(n.eventsOf(j, 'night_action_result')).toEqual([expect.objectContaining({ actionType: 'ASSASSINATE', success: false })]);
    await n.expectCard(user.page, c.nickname, 'alive');
    expect(n.eventsOf(d, 'night_action_result')).toEqual([]);
});

test('같은 밤에 광대가 의사를 죽이고 경비원이 그 의사를 조사하면 → 의사가 죽고 경비원은 "의사" 결과를 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    const [j, d, g] = t.bots;
    playNights(t, [{ 1: uuid(d) }, {}, { 1: uuid(d) }]);
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, uuid(d)).alive).toBe(false);
    expect(n.eventsOf(g, 'night_action_result')).toEqual([expect.objectContaining({ role: 'DOCTOR', targetId: uuid(d) })]);
    await n.expectCard(user.page, d.nickname, 'dead');
    expect(j).toBeTruthy();
});

test('광대가 노린 의사가 다른 사람을 보호하면 → 의사는 죽고 보호받은 사람은 그대로 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [, d, c] = t.bots;
    playNights(t, [{ 1: uuid(d) }, { 1: uuid(c) }]);
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, uuid(d)).alive).toBe(false);
    expect(n.rowOf(s, uuid(c)).alive).toBe(true);
    await n.expectCard(user.page, d.nickname, 'dead');
});

test('마녀사냥꾼은 그 밤 광대가 노렸지만 아직 안 죽은 사람을 확인하려 하면 → TARGET_NOT_DEAD로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, WITCH_HUNTER: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'WITCH_HUNTER', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, wh, c] = t.bots;
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? (ctx) => (ctx.snapshot.dayIndex === 2 ? uuid(c) : undefined) : 'skip' }));
    await n.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    expect(await n.botNight(t, wh, uuid(c))).toMatchObject({ ok: false, code: 'TARGET_NOT_DEAD' });
    const s = await n.toDay(t, { dayIndex: 3 });
    expect(n.rowOf(s, uuid(c)).alive).toBe(false);
    expect(j).toBeTruthy();
});

test('둘째 밤에 네 직업이 다 움직이면 → 광대 대상 죽음·의사 보호 대상 생존·경비원 조사 결과·마녀사냥꾼 확인 결과가 한꺼번에 맞게 나옴 @game', async ({ user, table }) => {
    test.setTimeout(150_000);
    const t = await n.setup(table, { humans: [user], bots: 6, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, d, g, wh, c1, c2] = t.bots;
    // 1낮 c2 처형 → 2밤: 광대 c1, 의사 경비원, 경비원 광대, 마녀사냥꾼 c2
    playNights(t, [{ 2: uuid(c1) }, { 2: uuid(g) }, { 2: uuid(j) }, { 2: uuid(c2) }], { dayAll: { 1: uuid(c2) } });
    const s = await n.toDay(t, { dayIndex: 3 });
    expect(n.rowOf(s, uuid(c1)).alive).toBe(false);
    expect(n.rowOf(s, uuid(g)).alive).toBe(true);
    expect(n.eventsOf(g, 'night_action_result')).toEqual([expect.objectContaining({ actionType: 'INVESTIGATE', role: 'JOKER', dayIndex: 2 })]);
    expect(n.eventsOf(wh, 'night_action_result')).toEqual([expect.objectContaining({ actionType: 'CONFIRM', role: 'CITIZEN', targetId: uuid(c2) })]);
    expect(n.turnOrder(j, 2)).toEqual(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']);
    await n.expectCard(user.page, c1.nickname, 'dead');
    await n.expectCard(user.page, c2.nickname, 'dead');
    expect(d).toBeTruthy();
});

test('경비원 둘 중 하나가 광대에게 찍혀 못 살면 → 남은 경비원 혼자 고른 대상으로 결과를 받고 찍힌 경비원은 못 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, GUARD: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'GUARD', 'GUARD', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, ga, gb, c] = t.bots;
    // ga는 찍혀서 c를, gb는 광대를 조사 → ga 빠지고 gb 혼자 광대
    playNights(t, [{ 1: uuid(ga) }, { 1: uuid(c) }, { 1: uuid(j) }]);
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, uuid(ga)).alive).toBe(false);
    expect(n.eventsOf(gb, 'night_action_result')).toEqual([expect.objectContaining({ role: 'JOKER', targetId: uuid(j) })]);
    expect(n.eventsOf(ga, 'night_action_result')).toEqual([]);
});

test('광대에게 찍힌 경비원 봇을 의사가 살리면 → 경비원 봇이 조사 결과를 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    const [j, , g] = t.bots;
    playNights(t, [{ 1: uuid(g) }, { 1: uuid(g) }, { 1: uuid(j) }]);
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, uuid(g)).alive).toBe(true);
    expect(n.eventsOf(g, 'night_action_result')).toEqual([expect.objectContaining({ role: 'JOKER' })]);
});

test('광대 둘이 동률로 갈린 밤에 의사가 보호해도 → 아무도 안 죽고 광대들에게 암살 실패 알림도 안 감 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [ja, jb, , c1, c2] = t.bots;
    playNights(t, [{ 1: uuid(c1) }, { 1: uuid(c2) }, { 1: uuid(c1) }]);
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.aliveCount(s)).toBe(6);
    expect(n.eventsOf(ja, 'night_action_result')).toEqual([]);
    expect(n.eventsOf(jb, 'night_action_result')).toEqual([]);
});

test('8인 판(광대 2·의사 2·경비원 2)에서 광대 둘이 같은 사람, 의사 둘이 같은 사람을 고르면 → 살아남고 경비원 둘이 결과를 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 7, settings: n.custom({ JOKER: 2, DOCTOR: 2, GUARD: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER', 'DOCTOR', 'DOCTOR', 'GUARD', 'GUARD', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [ja, jb, da, db, ga, gb, c] = t.bots;
    playNights(t, [{ 1: uuid(c) }, { 1: uuid(c) }, { 1: uuid(c) }, { 1: uuid(c) }, { 1: uuid(jb) }, { 1: uuid(jb) }]);
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.aliveCount(s)).toBe(8);
    for (const g of [ga, gb]) expect(n.eventsOf(g, 'night_action_result')).toEqual([expect.objectContaining({ role: 'JOKER', targetId: uuid(jb) })]);
    for (const j of [ja, jb]) expect(n.eventsOf(j, 'night_action_result')).toEqual([expect.objectContaining({ success: false })]);
    expect([da, db].every(Boolean)).toBe(true);
});

test('낮에 처형된 사람은 그날 밤 → 광대·의사·경비원 누구도 대상으로 못 고름 (전부 TARGET_NOT_ALIVE) @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, d, g, dead] = t.bots;
    t.playBots({ dayVote: (ctx) => (ctx.snapshot.dayIndex === 1 ? uuid(dead) : null), tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'JOKER', { dayIndex: 1 });
    expect(await n.botNight(t, j, uuid(dead))).toMatchObject({ code: 'TARGET_NOT_ALIVE' });
    await n.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    expect(await n.botNight(t, d, uuid(dead))).toMatchObject({ code: 'TARGET_NOT_ALIVE' });
    await n.toTurn(t, 'GUARD', { dayIndex: 1 });
    expect(await n.botNight(t, g, uuid(dead))).toMatchObject({ code: 'TARGET_NOT_ALIVE' });
});

test('광대가 경비원을 노리고 경비원이 그 광대를 조사하면 → 경비원은 죽고 광대 결과도 못 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'GUARD', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [j, g] = t.bots;
    playNights(t, [{ 1: uuid(g) }, { 1: uuid(j) }]);
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, uuid(g)).alive).toBe(false);
    expect(n.eventsOf(g, 'night_action_result')).toEqual([]);
});

test('광대가 마녀사냥꾼을 노린 둘째 밤에 의사가 다른 사람을 지키면 → 마녀사냥꾼은 죽고 확인 결과를 못 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 1, DOCTOR: 1, WITCH_HUNTER: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'WITCH_HUNTER', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    const [, , wh, c1, dead] = t.bots;
    playNights(t, [{ 2: uuid(wh) }, { 2: uuid(c1) }, { 2: uuid(dead) }], { dayAll: { 1: uuid(dead) } });
    const s = await n.toDay(t, { dayIndex: 3 });
    expect(n.rowOf(s, uuid(wh)).alive).toBe(false);
    expect(n.eventsOf(wh, 'night_action_result')).toEqual([]);
});

test('사람 셋(광대·의사·시민)이 있는 판에서 광대가 시민을 노리고 의사가 살리면 → 셋 다 화면에서 그 시민 카드가 생존 표시 @game', async ({ user, players, table }) => {
    const p2 = await players.add();
    const p3 = await players.add();
    const t = await n.setup(table, { humans: [user, p2, p3], bots: 2, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['JOKER', 'DOCTOR', 'CITIZEN'] });
    for (const h of [user, p2, p3]) await ui.readRoleReveal(h.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.nightActUi(user.page, p3.account.nickname, '암살');
    await n.toTurn(t, 'DOCTOR');
    await n.nightActUi(p2.page, p3.account.nickname, '보호');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, p3.account.uuid).alive).toBe(true);
    for (const h of [user, p2, p3]) await n.expectCard(h.page, p3.account.nickname, 'alive');
});

test('사람 셋(광대·의사·시민)이 있는 판에서 의사가 다른 사람을 지키면 → 셋 다 화면에서 시민 카드가 사망 표시 @game', async ({ user, players, table }) => {
    const p2 = await players.add();
    const p3 = await players.add();
    const t = await n.setup(table, { humans: [user, p2, p3], bots: 2, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['JOKER', 'DOCTOR', 'CITIZEN'] });
    for (const h of [user, p2, p3]) await ui.readRoleReveal(h.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.nightActUi(user.page, p3.account.nickname, '암살');
    await n.toTurn(t, 'DOCTOR');
    await n.nightActUi(p2.page, t.bots[0].nickname, '보호');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, p3.account.uuid).alive).toBe(false);
    for (const h of [user, p2, p3]) await n.expectCard(h.page, p3.account.nickname, 'dead');
});

test('사람 경비원과 사람 광대가 있는 판에서 경비원이 그 광대를 조사하면 → 경비원 화면에만 광대 결과, 광대 화면엔 조사 결과 창이 없음 @game', async ({ user, players, table }) => {
    const p2 = await players.add();
    const t = await n.setup(table, { humans: [user, p2], bots: 2, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['GUARD', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    await ui.readRoleReveal(p2.page);
    await n.recordUi(p2.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'GUARD');
    await n.nightActUi(user.page, p2.account.nickname, '조사');
    await n.toDay(t, { dayIndex: 2 });
    await expect(async () => {
        await n.closeNotices(user.page, { names: ['단계 전환 안내'] });
        await expect(user.page.locator('[data-ingame-night-private-result="INVESTIGATE"]')).toContainText(`${p2.account.nickname} 님의 역할은 광대입니다.`, { timeout: 1000 });
    }).toPass({ timeout: 30000 });
    await n.sleep(1500);
    expect((await n.readUi(p2.page)).privateResults).toEqual([]);
});
