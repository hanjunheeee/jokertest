// 밤 시간 초과 시험 파일, 마감까지 안 내면 기권으로 채우고 차례 닫힘·빈 차례(행동할 사람 없음)는 무작위로 짧게·실제 시계로 마감
// 대부분 단계 넘기기(t.advance)로 마감 타이머를 바로 돌리고, 실제 시간 확인은 두 개만 기다림
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

test('광대가 마감까지 아무도 안 고르면 → 기권으로 채워져 광대 차례가 닫히고 아침에 아무도 안 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const r = await t.advance();
    expect(r.fired).toBe('NIGHT_TURN');
    await expect.poll(() => n.eventsOf(t.bots[0], 'night_turn_ended').map((p) => p.role)).toContain('JOKER');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.aliveCount(s)).toBe(4);
});

test('모든 직업이 마감까지 아무것도 안 하면 → 네 차례가 모두 시간 초과로 닫히고 둘째 밤도 아무도 안 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }), humanRoles: ['CITIZEN'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    const s = await n.toDay(t, { dayIndex: 3 });
    expect(n.aliveCount(s)).toBe(6);
    expect(n.eventsOf(t.bots[0], 'night_turn_ended').filter((p) => p.dayIndex === 2).map((p) => p.role)).toEqual(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']);
    for (const bot of t.bots) expect(n.eventsOf(bot, 'night_action_result')).toEqual([]);
});

test('광대인 내가 마감까지 안 고르면 → 차례가 닫힌 뒤 카드 메뉴·건너뛰기 버튼이 사라짐 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['JOKER'], botRoles: ['DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await expect(async () => {
        await n.closeNotices(user.page);
        await expect(n.skipButton(user.page)).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20000 });
    await n.toTurn(t, 'DOCTOR');
    await expect(n.skipButton(user.page)).toHaveCount(0, { timeout: 10000 });
    await n.expectNoCardMenu(user.page, t.bots[1].nickname);
});

test('광대 차례가 시간 초과로 닫힌 뒤 광대 봇이 늦게 보내면 → NOT_YOUR_TURN으로 거절되고 아무도 안 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'DOCTOR');
    expect(await n.botNight(t, t.bots[0], user.account.uuid)).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, user.account.uuid).alive).toBe(true);
});

test('광대 둘 중 하나만 내고 마감되면 → 안 낸 광대는 기권으로 채워져 낸 광대 대상이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.botNight(t, t.bots[0], t.bots[3].account.uuid);
    // 한 명이 아직이라 차례는 열려 있음
    expect((await t.state()).nightTurnRole).toBe('JOKER');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, t.bots[3].account.uuid).alive).toBe(false);
});

test('광대 차례에 아무것도 안 하고 진짜 시간을 기다리면 → 30초쯤 뒤 서버가 스스로 차례를 닫음 @game', async ({ user, table }) => {
    test.setTimeout(150_000);
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const started = t.bots[0].events.find((r) => r.event === 'night_turn_started' && r.payload.role === 'JOKER');
    const ended = await t.bots[0].waitForEvent('night_turn_ended', { match: (p) => p.role === 'JOKER', timeoutMs: 45000 });
    expect(ended.role).toBe('JOKER');
    const endedRow = t.bots[0].events.find((r) => r.event === 'night_turn_ended' && r.payload.role === 'JOKER');
    expect(endedRow.at - started.at).toBeGreaterThan(27000);
    expect(endedRow.at - started.at).toBeLessThan(36000);
});

test('의사가 죽어 행동할 사람이 없는 의사 차례는 → 30초를 다 안 기다리고 6~18초 사이에 저절로 닫힘 @game', async ({ user, table }) => {
    test.setTimeout(150_000);
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const doctor = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? (ctx) => (ctx.snapshot.dayIndex === 1 ? doctor.account.uuid : undefined) : 'skip' }));
    await n.toTurn(t, 'DOCTOR', { dayIndex: 2 });
    const started = t.bots[0].events.find((r) => r.event === 'night_turn_started' && r.payload.role === 'DOCTOR' && r.payload.dayIndex === 2);
    await t.bots[0].waitForEvent('night_turn_ended', { match: (p) => p.role === 'DOCTOR' && p.dayIndex === 2, timeoutMs: 30000 });
    const endedRow = t.bots[0].events.find((r) => r.event === 'night_turn_ended' && r.payload.role === 'DOCTOR' && r.payload.dayIndex === 2);
    const took = endedRow.at - started.at;
    expect(took).toBeGreaterThan(5000);
    expect(took).toBeLessThan(19500);
});

test('밤 차례 동안 화면 타이머를 보면 → 남은 시간이 30초 안쪽에서 줄어듦 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.closeNotices(user.page);
    const timer = user.page.getByRole('timer').first();
    const read = async () => {
        const text = await timer.innerText();
        const m = text.match(/(\d{1,2}):(\d{2})/);
        return m ? Number(m[1]) * 60 + Number(m[2]) : Number(text.match(/\d+/)?.[0]);
    };
    await expect.poll(read, { timeout: 10000 }).toBeLessThanOrEqual(30);
    const a = await read();
    await n.sleep(2500);
    const b = await read();
    expect(b).toBeLessThan(a);
});

test('의사 차례가 시간 초과로 닫히면 → 그 밤 치료도 마감되어 광대가 노린 사람이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[3];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toTurn(t, 'GUARD');
    // 경비원 차례에 의사가 늦게 보내도 안 받음
    expect(await n.botNight(t, t.bots[1], victim.account.uuid)).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
});
