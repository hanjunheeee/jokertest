// 광대 밤 행동 시험 파일, 지목 화면(암살 메뉴)·동료 광대 지목 막힘(TARGET_IS_ALLY)·여러 광대 합의(최다표, 동률이면 없음)·의사에 막힌 암살 실패 알림
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

// 사람 광대가 직업별 대상 암살
const VICTIMS = [
    { role: 'CITIZEN', counts: { JOKER: 1 } },
    { role: 'DOCTOR', counts: { JOKER: 1, DOCTOR: 1 } },
    { role: 'GUARD', counts: { JOKER: 1, GUARD: 1 } },
    { role: 'WITCH_HUNTER', counts: { JOKER: 1, WITCH_HUNTER: 1 } },
];

for (const c of VICTIMS) {
    test(`광대인 내가 ${n.ROLE_NAMES[c.role]} 카드를 눌러 암살하면 → 아침에 그 사람이 죽고 카드가 사망 표시 @game`, async ({ user, table }) => {
        const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom(c.counts), humanRoles: ['JOKER'], botRoles: [c.role] });
        await ui.readRoleReveal(user.page);
        t.playBots({ dayVote: 'abstain', night: 'skip' });
        await n.toTurn(t, 'JOKER');
        const victim = t.bots[0];
        await n.nightActUi(user.page, victim.nickname, '암살');
        const s = await n.toDay(t, { dayIndex: 2 });
        expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
        expect(n.rowOf(s, victim.account.uuid).role).toBe(c.role);
        await n.expectCard(user.page, victim.nickname, 'dead');
    });
}

test('광대인 내 차례에 동료 광대 카드를 누르면 → 행동 메뉴가 안 열림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['JOKER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.expectNoCardMenu(user.page, t.bots[0].nickname);
    // 시민 카드는 열림
    const menu = await n.openCardMenu(user.page, t.bots[1].nickname);
    await expect(menu.getByRole('menuitem', { name: '암살', exact: true })).toBeEnabled();
});

test('광대인 내 차례에 내 카드를 누르면 → 행동 메뉴가 안 열림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.expectNoCardMenu(user.page, user.account.nickname);
});

test('광대인 내가 낮에 처형된 사람 카드를 누르면 → 암살 항목이 잠기고 "대상이 아닙니다" 이유가 붙음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, humanRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[3];
    t.playBots({ dayVote: dead.account.uuid, tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'JOKER', { dayIndex: 1 });
    expect((await t.player(dead.account.uuid)).alive).toBe(false);
    const menu = await n.openCardMenu(user.page, dead.nickname);
    const item = menu.getByRole('menuitem', { name: '암살', exact: true });
    await expect(item).toBeDisabled();
    await expect(item).toHaveAttribute('title', '대상이 아닙니다');
});

test('광대인 내가 건너뛰기를 누르면 → 광대 차례가 바로 끝나 의사 차례가 되고 아침에 아무도 안 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['JOKER'], botRoles: ['DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.nightSkipUi(user.page);
    await expect.poll(async () => (await t.state()).nightTurnRole, { timeout: 8000 }).toBe('DOCTOR');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.aliveCount(s)).toBe(4);
});

test('광대 혼자인 내가 암살하면 → 광대 차례가 마감 시간을 안 기다리고 바로 닫힘 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['JOKER'], botRoles: ['DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.nightActUi(user.page, t.bots[1].nickname, '암살');
    await expect.poll(() => n.eventsOf(t.bots[0], 'night_turn_ended').some((p) => p.role === 'JOKER'), { timeout: 5000 }).toBe(true);
    expect((await t.state()).nightTurnRole).not.toBe('JOKER');
});

test('광대인 내가 암살하면 → 내 화면에 밤 성공 연출(암살 영상)이 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page, { autoConfirm: false });
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.nightActUi(user.page, t.bots[0].nickname, '암살');
    await expect.poll(async () => (await n.readUi(user.page)).videos, { timeout: 10000 }).toContain('night-success-kill-user-stacked.mp4');
    // 광대에게 간 성공 사건은 USER 시점 + 대상 id
    const success = n.eventsOf(t.bots[0], 'night_action_success').find((p) => p.type === 'KILL');
    expect(success.perspectives).toEqual(['TARGET']);
});

test('광대인 내가 고른 사람을 의사가 지키면 → "이번 밤의 암살이 실패했습니다." 창이 뜨고 그 사람은 살아 있음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['JOKER'], botRoles: ['DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toTurn(t, 'JOKER');
    await n.nightActUi(user.page, victim.nickname, '암살');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(true);
    await expect(async () => {
        await n.closeNotices(user.page, { names: ['단계 전환 안내'] });
        await n.closeFinalStatus(user.page);
        await expect(user.page.locator('[data-ingame-night-private-result="ASSASSINATE"]')).toContainText('이번 밤의 암살이 실패했습니다.', { timeout: 1000 });
    }).toPass({ timeout: 25000 });
});

test('광대인 내 암살이 성공하면 → 암살 실패 창은 안 뜨고 낮이 됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['JOKER'], botRoles: ['DOCTOR'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.nightActUi(user.page, t.bots[1].nickname, '암살');
    await n.toDay(t, { dayIndex: 2 });
    await expect(user.page.getByText('제 2일')).toBeVisible();
    await n.sleep(2000);
    expect((await n.readUi(user.page)).privateResults).toEqual([]);
});

// 서버 규칙
test('광대 봇이 동료 광대를 지목하면 → TARGET_IS_ALLY로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    expect(await n.botNight(t, t.bots[0], t.bots[1].account.uuid)).toMatchObject({ ok: false, code: 'TARGET_IS_ALLY' });
    expect(await n.botNight(t, t.bots[1], t.bots[0].account.uuid)).toMatchObject({ ok: false, code: 'TARGET_IS_ALLY' });
});

test('광대 봇이 자기 자신을 지목하면 → TARGET_IS_ALLY로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    expect(await n.botNight(t, t.bots[0], t.bots[0].account.uuid)).toMatchObject({ ok: false, code: 'TARGET_IS_ALLY' });
});

test('동료 광대 지목이 거절된 광대가 시민을 다시 고르면 → 받아지고 그 시민이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const victim = t.bots[2];
    expect(await n.botNight(t, t.bots[0], t.bots[1].account.uuid)).toMatchObject({ code: 'TARGET_IS_ALLY' });
    expect(await n.botNight(t, t.bots[0], victim.account.uuid)).toMatchObject({ ok: true });
    expect(await n.botNight(t, t.bots[1], victim.account.uuid)).toMatchObject({ ok: true });
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
});

test('광대 봇이 낮에 처형된 사람을 지목하면 → TARGET_NOT_ALIVE로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const dead = t.bots[3];
    t.playBots({ dayVote: dead.account.uuid, tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'JOKER', { dayIndex: 1 });
    expect(await n.botNight(t, t.bots[0], dead.account.uuid)).toMatchObject({ ok: false, code: 'TARGET_NOT_ALIVE' });
});

test('광대 봇이 판에 없는 사람 id를 지목하면 → INVALID_TARGET으로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const reply = await n.botNight(t, t.bots[0], '11111111-2222-4333-8444-555555555555');
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('INVALID_TARGET');
});

test('광대 봇이 나(사람)를 지목하면 → 아침에 내가 죽고 내 카드도 사망 표시 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? me : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, me).alive).toBe(false);
    await n.expectCard(user.page, user.account.nickname, 'dead');
});

// 여러 광대 합의
test('광대 봇 둘이 같은 사람을 고르면 → 그 사람이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[3];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i < 2 ? victim.account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
    await n.expectCard(user.page, victim.nickname, 'dead');
});

test('광대 봇 둘이 서로 다른 사람을 고르면 → 동률이라 아무도 안 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    const [x, y] = [t.bots[2], t.bots[3]];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? x.account.uuid : i === 1 ? y.account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.aliveCount(s)).toBe(6);
    await n.expectCard(user.page, x.nickname, 'alive');
    await n.expectCard(user.page, y.nickname, 'alive');
});

test('광대 봇 둘 중 하나만 고르고 하나는 시간 초과면 → 고른 사람이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[2];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
});

test('광대 봇 둘 다 아무도 안 고르면 → 아무도 안 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.aliveCount(s)).toBe(6);
});

test('광대 봇 둘이 한 명은 대상, 한 명은 건너뛰기(null)를 내면 → 대상이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const victim = t.bots[3];
    expect(await n.botNight(t, t.bots[0], victim.account.uuid)).toMatchObject({ ok: true });
    expect(await n.botNight(t, t.bots[1], null)).toMatchObject({ ok: true });
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
});

test('광대인 나와 광대 봇이 같은 사람을 고르면 → 그 사람이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['JOKER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[2];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toTurn(t, 'JOKER');
    await n.nightActUi(user.page, victim.nickname, '암살');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
    await n.expectCard(user.page, victim.nickname, 'dead');
});

test('광대인 나와 광대 봇이 서로 다른 사람을 고르면 → 아무도 안 죽고 암살 실패 창도 안 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['JOKER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await n.recordUi(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? t.bots[2].account.uuid : 'skip' }));
    await n.toTurn(t, 'JOKER');
    await n.nightActUi(user.page, t.bots[3].nickname, '암살');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.aliveCount(s)).toBe(6);
    await n.sleep(2000);
    expect((await n.readUi(user.page)).privateResults).toEqual([]);
});

test('광대인 내가 고르고 광대 봇은 시간 초과면 → 내가 고른 사람이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['JOKER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const victim = t.bots[3];
    await n.nightActUi(user.page, victim.nickname, '암살');
    expect((await t.state()).nightTurnRole).toBe('JOKER');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
});

test('광대인 내가 건너뛰기를 누르고 광대 봇이 고르면 → 봇이 고른 사람이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['JOKER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : 'skip' }));
    await n.toTurn(t, 'JOKER');
    await n.nightSkipUi(user.page);
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
});

test('광대 둘 중 하나가 낮에 처형되면 → 그날 밤엔 남은 광대 혼자 고른 사람이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    const [dead, alive, victim] = [t.bots[0], t.bots[1], t.bots[4]];
    t.playBots((bot, i) => ({ dayVote: dead.account.uuid, tribunal: 'GUILTY', night: i === 1 ? victim.account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, dead.account.uuid).alive).toBe(false);
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
    expect(n.rowOf(s, alive.account.uuid).alive).toBe(true);
});

test('광대인 나와 광대 봇이 고른 사람을 의사가 지키면 → 광대 둘 다 암살 실패 결과를 받음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2, DOCTOR: 1 }), humanRoles: ['JOKER'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const victim = t.bots[3];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i <= 1 ? victim.account.uuid : 'skip' }));
    await n.toTurn(t, 'JOKER');
    await n.nightActUi(user.page, victim.nickname, '암살');
    await n.toDay(t, { dayIndex: 2 });
    await expect.poll(() => n.eventsOf(t.bots[0], 'night_action_result').map((p) => [p.actionType, p.success])).toEqual([['ASSASSINATE', false]]);
    await expect(async () => {
        await n.closeNotices(user.page, { names: ['단계 전환 안내'] });
        await n.closeFinalStatus(user.page);
        await expect(user.page.locator('[data-ingame-night-private-result="ASSASSINATE"]')).toContainText('암살이 실패', { timeout: 1000 });
    }).toPass({ timeout: 25000 });
    // 의사는 실패 결과를 안 받음
    expect(n.eventsOf(t.bots[1], 'night_action_result')).toEqual([]);
});

test('광대가 의사가 지키지 않은 사람을 고르면 → 의사가 다른 사람을 지켜도 암살이 성공함 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    const [victim, guarded] = [t.bots[2], t.bots[3]];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? victim.account.uuid : i === 1 ? guarded.account.uuid : 'skip' }));
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
    expect(n.rowOf(s, guarded.account.uuid).alive).toBe(true);
    expect(n.eventsOf(t.bots[0], 'night_action_result')).toEqual([]);
});

test('광대를 3명으로 방을 만들려 하면 → "광대 플레이어 수가 올바르지 않습니다."로 거절됨 (광대는 최대 2명) @game', async ({ bots }) => {
    const [host] = await bots.spawn(1);
    const reply = await host.request('create_room', { ...require('../../../helpers/bots').FAST_ROOM_SETTINGS, maxPlayers: 8, jokerCount: 3 });
    expect(reply.ok).toBe(false);
    expect(reply.message).toBe('광대 플레이어 수가 올바르지 않습니다.');
});

test('직접 구성에서 광대 수와 광대 설정이 다르면 → "광대 수 설정이 서로 어긋났습니다."로 거절됨 @game', async ({ bots }) => {
    const [host] = await bots.spawn(1);
    const reply = await host.request('create_room', {
        ...require('../../../helpers/bots').FAST_ROOM_SETTINGS,
        maxPlayers: 6, jokerCount: 1, roleCompositionMode: 'custom', roleCounts: { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0 },
    });
    expect(reply.ok).toBe(false);
    expect(reply.message).toBe('광대 수 설정이 서로 어긋났습니다.');
});
