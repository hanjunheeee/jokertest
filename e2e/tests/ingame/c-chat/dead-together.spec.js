// 죽은 사람끼리 주고받기: 죽은 나 + 죽은 봇 (첫 낮 봇1 처형 → 첫 밤 광대 봇이 나를 죽임), 산 사람은 못 봄
// 판: 나·p2 시민 + 봇0 광대·봇1·봇2 시민 → 둘 죽은 뒤 1광대 : 2시민이라 판 계속
const { test, expect } = require('../../../helpers/fixtures');
const c = require('./_lib');

const DEAD_EVT = 'dead_chat_message_received';

// 첫 낮 봇1 처형 + 첫 밤 나 암살 → 둘째 낮까지
async function meAndBotDead({ user, players, table, withP2 = true }) {
    const p2 = withP2 ? await players.add() : null;
    const humans = p2 ? [user, p2] : [user];
    const t = await c.startGame(table, {
        humans, bots: p2 ? 3 : 4,
        roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER', ...(p2 ? { [p2.account.uuid]: 'CITIZEN' } : {}) }),
    });
    const victim = t.bots[1].account.uuid;
    await c.replan(t, (bot, i) => ({
        dayVote: i === 1 ? 'abstain' : victim,
        tribunal: 'GUILTY',
        night: i === 0 ? user.account.uuid : 'skip',
        pollMs: 200,
    }));
    await t.advanceUntil((s) => c.isDead(s, victim) && c.isDead(s, user.account.uuid), { stepDelayMs: 900, maxSteps: 40 });
    await t.stopBots();
    await c.readyToChat(user.page);
    return { t, p2 };
}

test('죽은 봇이 말하면 → 죽은 내 화면에 죽은 사람 줄(DEAD)로 보임 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table });
    const text = c.uniq('죽은봇');
    expect((await c.botSay(t, 1, text))?.ok).toBe(true);
    await c.expectLine(user.page, t.bots[1].nickname, text);
    expect(await c.lineChannel(user.page, text)).toBe('DEAD');
});

test('죽은 봇이 말하면 → 산 p2 화면엔 안 보임 @game', async ({ user, players, table }) => {
    const { t, p2 } = await meAndBotDead({ user, players, table });
    const text = c.uniq('p2못봄');
    await c.botSay(t, 1, text);
    await c.expectLine(user.page, t.bots[1].nickname, text);
    await c.readyToChat(p2.page);
    await c.expectNoText(p2.page, text);
});

test('죽은 내가 말하면 → 죽은 봇은 죽은 사람 채팅 사건으로 받음 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table });
    const text = c.uniq('봇아들려');
    await c.say(user.page, text);
    await expect.poll(() => c.botGot(t, 1, DEAD_EVT, text)).toBe(true);
});

test('죽은 내가 말하면 → 산 광대 봇·산 시민 봇은 못 받음 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table });
    const text = c.uniq('산봇못받음');
    await c.say(user.page, text);
    await expect.poll(() => c.botGot(t, 1, DEAD_EVT, text)).toBe(true);
    for (const i of [0, 2]) {
        expect(c.botGot(t, i, DEAD_EVT, text)).toBe(false);
        expect(c.botGot(t, i, 'day_chat_message_received', text)).toBe(false);
    }
});

test('죽은 봇이 말하면 → 산 봇들은 못 받음 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table });
    const text = c.uniq('봇끼리');
    await c.botSay(t, 1, text);
    await c.expectLine(user.page, t.bots[1].nickname, text);
    expect(c.botGot(t, 0, DEAD_EVT, text)).toBe(false);
    expect(c.botGot(t, 2, DEAD_EVT, text)).toBe(false);
});

test('죽은 봇과 내가 번갈아 말하면 → 내 화면에 시간 순서대로 쌓임 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table });
    const a = c.uniq('하나'); const b = c.uniq('둘'); const d = c.uniq('셋');
    await c.botSay(t, 1, a);
    await c.expectLine(user.page, t.bots[1].nickname, a);
    await c.say(user.page, b);
    await c.sleep(600);
    await c.botSay(t, 1, d);
    await c.expectLine(user.page, t.bots[1].nickname, d);
    const rows = await c.chatLog(user.page).getByRole('listitem').allInnerTexts();
    const idx = [a, b, d].map((x) => rows.findIndex((r) => r.includes(x)));
    expect(idx[0]).toBeLessThan(idx[1]);
    expect(idx[1]).toBeLessThan(idx[2]);
});

test('산 p2 낮 채팅과 죽은 사람 채팅이 섞여도 → 죽은 내 화면에 보낸 순서대로 보임 @game', async ({ user, players, table }) => {
    const { t, p2 } = await meAndBotDead({ user, players, table });
    const a = c.uniq('산말1'); const b = c.uniq('죽말'); const d = c.uniq('산말2');
    await c.say(p2.page, a);
    await c.expectLine(user.page, p2.account.nickname, a);
    await c.botSay(t, 1, b);
    await c.expectLine(user.page, t.bots[1].nickname, b);
    await c.say(p2.page, d);
    await c.expectLine(user.page, p2.account.nickname, d);
    const rows = await c.chatLog(user.page).getByRole('listitem').allInnerTexts();
    const idx = [a, b, d].map((x) => rows.findIndex((r) => r.includes(x)));
    expect(idx).toEqual([...idx].sort((x, y) => x - y));
});

test('산 p2 화면에는 → 산 사람 낮 채팅만 있고 죽은 사람 줄이 하나도 없음 @game', async ({ user, players, table }) => {
    const { t, p2 } = await meAndBotDead({ user, players, table });
    await c.botSay(t, 1, c.uniq('죽은봇말'));
    await c.say(user.page, c.uniq('죽은내말'));
    const live = c.uniq('산p2');
    await c.say(p2.page, live);
    await c.expectLine(p2.page, p2.account.nickname, live);
    await c.sleep(1000);
    await expect(c.chatLog(p2.page).locator('[data-chat-channel="DEAD"]')).toHaveCount(0);
});

test('밤 암살로 죽어도 → "죽은 사람끼리" 표시가 뜸 @game', async ({ user, players, table }) => {
    await meAndBotDead({ user, players, table });
    await expect(c.deadBadge(user.page)).toBeVisible();
});

test('밤에 죽은 봇이 말해도 → 죽은 나에게 보임 (밤에도 죽은 사람 채팅) @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table });
    await c.phaseTo(t, 'NIGHT');
    await c.readyToChat(user.page);
    const text = c.uniq('밤죽은봇');
    expect((await c.botSay(t, 1, text))?.ok).toBe(true);
    await c.expectLine(user.page, t.bots[1].nickname, text);
});

test('밤에 죽은 내가 말하면 → 죽은 봇이 받음 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table });
    await c.phaseTo(t, 'NIGHT');
    const text = c.uniq('밤죽은나');
    await c.say(user.page, text);
    await expect.poll(() => c.botGot(t, 1, DEAD_EVT, text)).toBe(true);
});

test('밤에 죽은 내가 말해도 → 시민 밤 채팅으로 안 가서 산 시민 봇이 못 받음 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table });
    await c.phaseTo(t, 'NIGHT');
    const text = c.uniq('시민채널아님');
    await c.say(user.page, text);
    await expect.poll(() => c.botGot(t, 1, DEAD_EVT, text)).toBe(true);
    expect(c.botGot(t, 2, 'joker_chat_message', text)).toBe(false);
});

test('밤에도 죽은 내 화면엔 → "죽은 사람끼리" 표시가 그대로 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table });
    await c.phaseTo(t, 'NIGHT');
    await c.readyToChat(user.page);
    await expect(c.deadBadge(user.page)).toBeVisible();
});

test('죽은 봇이 밤 같은 직업 채팅을 보내면 → 거절됨 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table });
    await c.phaseTo(t, 'NIGHT');
    expect((await c.botNightSay(t, 1, c.uniq('죽은시민밤')))?.ok).toBe(false);
});

test('나간 봇은 → 죽은 사람 채팅도 못 씀 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table });
    expect((await t.bots[1].request('leave_game_session', { gameId: t.gameId }))?.ok).toBe(true);
    const text = c.uniq('나간봇');
    expect((await c.botSay(t, 1, text))?.ok).toBe(false);
    await c.expectNoText(user.page, text);
});

test('죽은 사람이 빈 글을 보내면 → "메시지를 입력해주세요." 오류 @game', async ({ user, players, table }) => {
    await meAndBotDead({ user, players, table, withP2: false });
    await c.chatBox(user.page).fill('  ');
    await c.chatBox(user.page).press('Enter');
    await expect(user.page.getByRole('alert').filter({ hasText: '메시지를 입력해주세요.' })).toBeVisible();
});

test('죽은 사람이 151자를 보내면 → 150자 오류가 뜨고 죽은 봇은 못 받음 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table, withP2: false });
    const long = '라'.repeat(151);
    await c.say(user.page, long, { expectCleared: false });
    await expect(user.page.getByRole('alert').filter({ hasText: '메시지는 150자 이하로 입력해주세요.' })).toBeVisible();
    await c.sleep(500);
    expect(c.botGot(t, 1, DEAD_EVT, long)).toBe(false);
});

test('죽은 봇이 0.5초 안에 두 번 말하면 → 두 번째는 거절 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table, withP2: false });
    expect((await c.botSay(t, 1, c.uniq('죽빠1')))?.ok).toBe(true);
    expect((await c.botSay(t, 1, c.uniq('죽빠2')))?.ok).toBe(false);
});

test('죽은 사람 채팅 사건에는 → 보낸 사람 닉네임과 날짜(dayIndex)가 실림 @game', async ({ user, players, table }) => {
    const { t } = await meAndBotDead({ user, players, table, withP2: false });
    const text = c.uniq('실림');
    await c.say(user.page, text);
    await expect.poll(() => c.botGot(t, 1, DEAD_EVT, text)).toBe(true);
    const row = t.bots[1].events.find((r) => r.event === DEAD_EVT && r.payload.text === text);
    expect(row.payload.nickname).toBe(user.account.nickname);
    expect(row.payload.senderUuid).toBe(user.account.uuid);
    expect(row.payload.dayIndex).toBeGreaterThanOrEqual(1);
});
