// 내 차례 아닐 때 막힘 시험 파일, 화면(카드 메뉴·건너뛰기·밤 종료 버튼)과 서버 거절 코드(NOT_YOUR_TURN·NOT_ELIGIBLE·INVALID_PHASE·ACTOR_NOT_ALIVE·ACTIONS_PENDING)
// 봇은 밤에 아무것도 안 냄(skip), 거절 확인은 봇 하나로 submit_night_action을 직접 보냄
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

const FULL = n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 });

test('의사인 내가 광대 차례에 카드를 누르면 → 행동 메뉴가 안 열리고 건너뛰기·밤 종료 버튼도 없음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: FULL, humanRoles: ['DOCTOR'], botRoles: ['JOKER', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.expectNoCardMenu(user.page, t.bots[2].nickname);
    await expect(n.skipButton(user.page)).toHaveCount(0);
    await expect(user.page.locator('[data-ingame-phase-action="nightResolve"]')).toHaveCount(0);
});

test('의사인 나에게 의사 차례가 오면 → 같은 카드 메뉴에 보호가 눌리고 건너뛰기·밤 종료 버튼이 생김 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: FULL, humanRoles: ['DOCTOR'], botRoles: ['JOKER', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'DOCTOR');
    const menu = await n.openCardMenu(user.page, t.bots[2].nickname);
    await expect(menu.getByRole('menuitem', { name: '보호', exact: true })).toBeEnabled();
    await expect(n.skipButton(user.page)).toBeVisible();
    await expect(user.page.locator('[data-ingame-phase-action="nightResolve"]')).toBeVisible();
});

test('경비원인 나는 광대·의사 차례 동안 → 메뉴가 안 열리고, 경비원 차례가 되면 조사 항목이 생김 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: FULL, humanRoles: ['GUARD'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.expectNoCardMenu(user.page, t.bots[2].nickname);
    await n.toTurn(t, 'DOCTOR');
    await n.expectNoCardMenu(user.page, t.bots[2].nickname);
    await n.toTurn(t, 'GUARD');
    const menu = await n.openCardMenu(user.page, t.bots[2].nickname);
    await expect(menu.getByRole('menuitem', { name: '조사', exact: true })).toBeEnabled();
});

test('광대인 내 차례가 끝나 의사 차례가 되면 → 카드 메뉴·건너뛰기 버튼이 없어져 대상을 못 바꿈 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: FULL, humanRoles: ['JOKER'], botRoles: ['DOCTOR', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'DOCTOR');
    await n.expectNoCardMenu(user.page, t.bots[2].nickname);
    await expect(n.skipButton(user.page)).toHaveCount(0);
});

test('시민인 나는 밤 내내 → 광대·의사·경비원 어느 차례에도 카드 메뉴와 건너뛰기 버튼이 없음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: FULL, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    for (const role of ['JOKER', 'DOCTOR', 'GUARD']) {
        await n.toTurn(t, role);
        await n.expectNoCardMenu(user.page, t.bots[3].nickname);
        await expect(n.skipButton(user.page)).toHaveCount(0);
    }
});

test('마녀사냥꾼인 나는 첫 밤에 → 카드 메뉴·건너뛰기 버튼이 없고 마녀사냥꾼 차례도 안 열림 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, WITCH_HUNTER: 1 }), humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'DOCTOR');
    await n.expectNoCardMenu(user.page, t.bots[2].nickname);
    await expect(n.skipButton(user.page)).toHaveCount(0);
    await n.toDay(t, { dayIndex: 2 });
    expect(n.turnOrder(t.bots[0], 1)).not.toContain('WITCH_HUNTER');
});

test('광대 두 명 중 내가 먼저 한 사람을 고른 뒤 다른 사람으로 바꾸면 → 마지막에 고른 사람이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['JOKER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const first = t.bots[1];
    const second = t.bots[2];
    await n.nightActUi(user.page, first.nickname, '암살');
    // 고른 카드 다시 열면 취소하기
    const menu = await n.openCardMenu(user.page, first.nickname);
    await menu.getByRole('menuitem', { name: '취소하기' }).click();
    await n.nightActUi(user.page, second.nickname, '암살');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, second.account.uuid).alive).toBe(false);
    expect(n.rowOf(s, first.account.uuid).alive).toBe(true);
});

test('광대 두 명 중 내가 고른 카드를 다시 누르면 → 메뉴에 암살 대신 취소하기가 보임 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['JOKER'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    await n.nightActUi(user.page, t.bots[1].nickname, '암살');
    const menu = await n.openCardMenu(user.page, t.bots[1].nickname);
    await expect(menu.getByRole('menuitem', { name: '취소하기' })).toBeEnabled();
    await expect(menu.getByRole('menuitem', { name: '암살', exact: true })).toHaveCount(0);
    // 다른 사람 카드는 여전히 암살
    await user.page.keyboard.press('Escape');
    const other = await n.openCardMenu(user.page, t.bots[2].nickname);
    await expect(other.getByRole('menuitem', { name: '암살', exact: true })).toBeEnabled();
});

test('밤에 죽은 의사인 내게 다음 밤 의사 차례가 와도 → 보호 항목이 잠기고 "사망한 플레이어는 행동할 수 없습니다" 이유가 붙음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    const me = user.account.uuid;
    await ui.readRoleReveal(user.page);
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 ? me : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    expect((await t.player(me)).alive).toBe(false);
    await n.toTurn(t, 'DOCTOR', { dayIndex: 2 });
    const menu = await n.openCardMenu(user.page, t.bots[2].nickname);
    const item = menu.getByRole('menuitem', { name: '보호', exact: true });
    await expect(item).toBeDisabled();
    await expect(item).toHaveAttribute('title', '사망한 플레이어는 행동할 수 없습니다');
});

// 서버 거절: 차례 아닌 직업
const NOT_YOUR_TURN = [
    { actor: 'DOCTOR', during: 'JOKER' },
    { actor: 'GUARD', during: 'JOKER' },
    { actor: 'GUARD', during: 'DOCTOR' },
    { actor: 'JOKER', during: 'DOCTOR' },
    { actor: 'JOKER', during: 'GUARD' },
    { actor: 'DOCTOR', during: 'GUARD' },
];

for (const c of NOT_YOUR_TURN) {
    test(`${n.ROLE_NAMES[c.during]} 차례에 ${n.josa(n.ROLE_NAMES[c.actor], '이', '가')} 밤 행동을 보내면 → NOT_YOUR_TURN으로 거절되고 차례는 그대로 @game`, async ({ user, table }) => {
        const t = await n.setup(table, { humans: [user], bots: 4, settings: FULL, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
        await ui.readRoleReveal(user.page);
        t.playBots({ dayVote: 'abstain', night: 'skip' });
        await n.toTurn(t, c.during);
        const actor = t.bots[['JOKER', 'DOCTOR', 'GUARD'].indexOf(c.actor)];
        const reply = await n.botNight(t, actor, t.bots[3].account.uuid);
        expect(reply.ok).toBe(false);
        expect(reply.code).toBe('NOT_YOUR_TURN');
        expect((await t.state()).nightTurnRole).toBe(c.during);
    });
}

test('시민 봇이 광대 차례에 밤 행동을 보내면 → NOT_ELIGIBLE로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['DOCTOR'], botRoles: ['JOKER', 'CITIZEN', 'CITIZEN'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const reply = await n.botNight(t, t.bots[1], t.bots[2].account.uuid);
    expect(reply).toMatchObject({ ok: false, code: 'NOT_ELIGIBLE' });
});

test('마녀사냥꾼 봇이 첫 밤에 밤 행동을 보내면 → NOT_ELIGIBLE로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, WITCH_HUNTER: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'WITCH_HUNTER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const reply = await n.botNight(t, t.bots[1], t.bots[2].account.uuid);
    expect(reply).toMatchObject({ ok: false, code: 'NOT_ELIGIBLE' });
});

test('낮 토론 중에 광대 봇이 밤 행동을 보내면 → INVALID_PHASE로 거절되고 아무도 안 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    await n.toDay(t, { dayIndex: 1 });
    const reply = await n.botNight(t, t.bots[0], user.account.uuid);
    expect(reply).toMatchObject({ ok: false, code: 'INVALID_PHASE' });
    expect((await t.player(user.account.uuid)).alive).toBe(true);
});

test('낮 투표 중에 의사 봇이 밤 행동을 보내면 → INVALID_PHASE로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    await n.advanceUntilSettled(t, (s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE');
    const reply = await n.botNight(t, t.bots[1], user.account.uuid);
    expect(reply).toMatchObject({ ok: false, code: 'INVALID_PHASE' });
});

test('재판 중에 광대 봇이 밤 행동을 보내면 → INVALID_PHASE로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    const defendant = t.bots[3].account.uuid;
    t.playBots({ dayVote: defendant, tribunal: 'skip', night: 'skip' });
    await n.advanceUntilSettled(t, (s) => s.phase === 'TRIBUNAL');
    const reply = await n.botNight(t, t.bots[0], user.account.uuid);
    expect(reply).toMatchObject({ ok: false, code: 'INVALID_PHASE' });
});

test('낮에 처형된 광대가 그날 밤 밤 행동을 보내면 → ACTOR_NOT_ALIVE로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    const executed = t.bots[0];
    t.playBots({ dayVote: executed.account.uuid, tribunal: 'GUILTY', night: 'skip' });
    await n.toTurn(t, 'JOKER', { dayIndex: 1 });
    expect((await t.player(executed.account.uuid)).alive).toBe(false);
    const reply = await n.botNight(t, executed, user.account.uuid);
    expect(reply).toMatchObject({ ok: false, code: 'ACTOR_NOT_ALIVE' });
});

test('밤에 죽은 경비원이 다음 밤 경비원 차례에 밤 행동을 보내면 → ACTOR_NOT_ALIVE로 거절됨 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, GUARD: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'GUARD'] });
    await ui.readRoleReveal(user.page);
    const guard = t.bots[1];
    t.playBots((bot, i) => ({ dayVote: 'abstain', night: i === 0 && bot ? guard.account.uuid : 'skip' }));
    await n.toDay(t, { dayIndex: 2 });
    expect((await t.player(guard.account.uuid)).alive).toBe(false);
    await n.toTurn(t, 'GUARD', { dayIndex: 2 });
    const reply = await n.botNight(t, guard, t.bots[0].account.uuid);
    expect(reply).toMatchObject({ ok: false, code: 'ACTOR_NOT_ALIVE' });
});

test('광대가 고른 뒤 연출 대기 중에 의사가 미리 보내면 → ACTIONS_PENDING으로 거절되고, 나(구경하는 시민)에게 "진행을 기다리는 중입니다." 창이 뜸 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    expect(await n.botNight(t, t.bots[0], t.bots[2].account.uuid)).toMatchObject({ ok: true });
    // 광대 차례가 닫히고 대기 단계 (차례 역할 비어 있음)
    await expect.poll(async () => (await t.state()).nightTurnRole, { timeout: 5000 }).toBeNull();
    const reply = await n.botNight(t, t.bots[1], t.bots[2].account.uuid);
    expect(reply).toMatchObject({ ok: false, code: 'ACTIONS_PENDING' });
    await expect(user.page.getByText('진행을 기다리는 중입니다.')).toBeVisible({ timeout: 8000 });
});

test('다른 판 id로 밤 행동을 보내면 → 거절되고 이 판 밤 행동으로 안 셈 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const reply = await t.bots[0].request('submit_night_action', { gameId: '00000000-0000-4000-8000-000000000000', targetId: user.account.uuid });
    expect(reply.ok).toBe(false);
    expect((await t.state()).nightTurnRole).toBe('JOKER');
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, user.account.uuid).alive).toBe(true);
});

test('광대 봇 둘 중 하나가 대상을 바꿔 다시 보내면 → 나중 대상으로 덮어써져 그 사람이 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 5, settings: n.custom({ JOKER: 2 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    const [a, b, x, y] = [t.bots[0], t.bots[1], t.bots[2], t.bots[3]];
    expect(await n.botNight(t, a, x.account.uuid)).toMatchObject({ ok: true });
    expect(await n.botNight(t, a, y.account.uuid)).toMatchObject({ ok: true });
    expect(await n.botNight(t, b, y.account.uuid)).toMatchObject({ ok: true });
    const s = await n.toDay(t, { dayIndex: 2 });
    expect(n.rowOf(s, y.account.uuid).alive).toBe(false);
    expect(n.rowOf(s, x.account.uuid).alive).toBe(true);
});

test('내 차례가 아닌 의사 봇이 낸 행동이 거절된 뒤 의사 차례에 다시 내면 → 그때는 받아짐 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, settings: n.custom({ JOKER: 1, DOCTOR: 1 }), humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toTurn(t, 'JOKER');
    expect(await n.botNight(t, t.bots[1], user.account.uuid)).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    await n.toTurn(t, 'DOCTOR');
    expect(await n.botNight(t, t.bots[1], user.account.uuid)).toMatchObject({ ok: true });
});

test('밤이 끝나 낮이 된 뒤 광대 봇이 늦게 보내면 → INVALID_PHASE로 거절되고 아무도 더 안 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 3, humanRoles: ['CITIZEN'], botRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    await n.toDay(t, { dayIndex: 2 });
    const reply = await n.botNight(t, t.bots[0], user.account.uuid);
    expect(reply).toMatchObject({ ok: false, code: 'INVALID_PHASE' });
    const s = await t.state();
    expect(n.aliveCount(s)).toBe(4);
});
