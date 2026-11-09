// 죽은 사람끼리 채팅: 처형으로 죽은 뒤 표시·회색 줄·산 사람 못 봄·죽기 전 대화 그대로·낮/밤 모두 씀
// 판: 사람 둘(나·p2) + 봇 셋(봇0 광대), 봇들이 나를 처형 → 1광대 : 3시민이라 판 계속
const { test, expect, ui } = require('../../../helpers/fixtures');
const c = require('./_lib');

// 나 시민·p2 시민·봇0 광대로 판 차리고 낮까지
async function setupTwo({ user, players, table, p2Role = 'CITIZEN', bots = 3, settings = {} }) {
    const p2 = await players.add();
    const t = await c.startGame(table, {
        humans: [user, p2],
        bots,
        settings,
        roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [p2.account.uuid]: p2Role, [b[0].account.uuid]: 'JOKER' }),
    });
    await c.phaseTo(t, 'DAY');
    return { t, p2 };
}

test.describe('죽은 뒤 화면 표시', () => {
    test('봇들이 나를 처형하면 → 내 채팅 칸 위에 "죽은 사람끼리" 표시가 뜸 @game', async ({ user, players, table }) => {
        const { t } = await setupTwo({ user, players, table });
        await c.executeByBots(t, user.account.uuid);
        await c.readyToChat(user.page);
        await expect(c.deadBadge(user.page)).toBeVisible();
    });

    test('내가 처형되어도 → 산 p2 화면에는 "죽은 사람끼리" 표시가 안 뜸 @game', async ({ user, players, table }) => {
        const { t, p2 } = await setupTwo({ user, players, table });
        await c.executeByBots(t, user.account.uuid);
        await c.readyToChat(p2.page);
        await expect(c.deadBadge(user.page)).toBeVisible();
        await expect(c.deadBadge(p2.page)).toHaveCount(0);
    });

    test('처형되면 → 내 카드 이름이 "사망 본인 닉네임"으로 바뀜 @game', async ({ user, players, table }) => {
        const { t } = await setupTwo({ user, players, table });
        await c.executeByBots(t, user.account.uuid);
        await c.dismissOverlays(user.page);
        await expect(user.page.getByRole('button', { name: new RegExp(`^사망 본인 ${user.account.nickname}`) })).toBeVisible();
    });

    test('내가 처형되면 → p2 화면의 내 카드가 사망 상태로 바뀜 @game', async ({ user, players, table }) => {
        const { t, p2 } = await setupTwo({ user, players, table });
        await c.executeByBots(t, user.account.uuid);
        await c.dismissOverlays(p2.page);
        await expect(p2.page.locator(`[data-ingame-player-nickname="${user.account.nickname}"]`)).toHaveAttribute('data-ingame-player-status', 'dead', { timeout: 15000 });
    });
});

test.describe('죽기 전 대화', () => {
    test('살아 있을 때 내가 한 낮 채팅 → 처형된 뒤에도 내 채팅 내역에 그대로 보임 @game', async ({ user, players, table }) => {
        const { t } = await setupTwo({ user, players, table });
        const text = c.uniq('죽기전내말');
        await c.say(user.page, text);
        await c.expectLine(user.page, user.account.nickname, text);
        await c.executeByBots(t, user.account.uuid);
        await c.readyToChat(user.page);
        await expect(c.deadBadge(user.page)).toBeVisible();
        await c.expectLine(user.page, user.account.nickname, text);
    });

    test('살아 있을 때 p2가 한 낮 채팅 → 내가 처형된 뒤에도 보임 @game', async ({ user, players, table }) => {
        const { t, p2 } = await setupTwo({ user, players, table });
        const text = c.uniq('p2낮말');
        await c.say(p2.page, text);
        await c.expectLine(user.page, p2.account.nickname, text);
        await c.executeByBots(t, user.account.uuid);
        await c.readyToChat(user.page);
        await c.expectLine(user.page, p2.account.nickname, text);
    });

    test('죽기 전 낮 채팅 줄은 → 죽은 뒤에도 낮 줄(DAY)로 남고 회색이 아님 @game', async ({ user, players, table }) => {
        const { t, p2 } = await setupTwo({ user, players, table });
        const text = c.uniq('색확인');
        await c.say(p2.page, text);
        await c.executeByBots(t, user.account.uuid);
        await c.readyToChat(user.page);
        expect(await c.lineChannel(user.page, text)).toBe('DAY');
        expect(await c.lineColor(user.page, text)).not.toBe('rgb(169, 169, 169)');
    });
});

test.describe('죽은 사람이 쓰기', () => {
    test('죽은 내가 채팅하면 → 내 채팅 내역에 죽은 사람 줄(DEAD)로 보임 @game', async ({ user, players, table }) => {
        const { t } = await setupTwo({ user, players, table });
        await c.executeByBots(t, user.account.uuid);
        const text = c.uniq('죽은내말');
        await c.say(user.page, text);
        await c.expectLine(user.page, user.account.nickname, text);
        expect(await c.lineChannel(user.page, text)).toBe('DEAD');
    });

    test('죽은 내가 채팅하면 → 그 줄 글자가 회색(#a9a9a9)으로 보임 @game', async ({ user, players, table }) => {
        const { t } = await setupTwo({ user, players, table });
        await c.executeByBots(t, user.account.uuid);
        const text = c.uniq('회색');
        await c.say(user.page, text);
        expect(await c.lineColor(user.page, text)).toBe('rgb(169, 169, 169)');
    });

    test('죽은 내가 채팅하면 → 산 p2 화면에는 안 보임 @game', async ({ user, players, table }) => {
        const { t, p2 } = await setupTwo({ user, players, table });
        await c.executeByBots(t, user.account.uuid);
        const text = c.uniq('비밀');
        await c.say(user.page, text);
        await c.expectLine(user.page, user.account.nickname, text);
        await c.readyToChat(p2.page);
        await c.expectNoText(p2.page, text);
    });

    test('죽은 내가 채팅하면 → 산 봇들은 낮·죽은 사람 채팅 사건을 하나도 못 받음 @game', async ({ user, players, table }) => {
        const { t } = await setupTwo({ user, players, table });
        await c.executeByBots(t, user.account.uuid);
        const text = c.uniq('봇못받음');
        await c.say(user.page, text);
        await c.expectLine(user.page, user.account.nickname, text);
        await c.sleep(1500);
        const s = await t.state();
        t.bots.forEach((bot, i) => {
            if (!c.isDead(s, bot.account.uuid)) {
                expect(c.botGot(t, i, 'dead_chat_message_received', text)).toBe(false);
                expect(c.botGot(t, i, 'day_chat_message_received', text)).toBe(false);
            }
        });
    });

    test('죽은 내가 보내기 버튼으로 채팅해도 → 죽은 사람 줄로 들어감 @game', async ({ user, players, table }) => {
        const { t } = await setupTwo({ user, players, table });
        await c.executeByBots(t, user.account.uuid);
        const text = c.uniq('버튼');
        await c.say(user.page, text, { via: 'button' });
        expect(await c.lineChannel(user.page, text)).toBe('DEAD');
    });
});

test.describe('죽은 사람이 읽기', () => {
    test('산 p2가 낮에 말하면 → 죽은 나도 읽을 수 있음 @game', async ({ user, players, table }) => {
        const { t, p2 } = await setupTwo({ user, players, table });
        await c.executeByBots(t, user.account.uuid);
        // 처형 뒤 밤 → 다음 낮까지
        await c.phaseTo(t, 'DAY');
        const text = c.uniq('둘째낮');
        await c.say(p2.page, text);
        await c.expectLine(user.page, p2.account.nickname, text);
        expect(await c.lineChannel(user.page, text)).toBe('DAY');
    });

    test('산 봇이 낮에 말하면 → 죽은 내 화면엔 낮 줄로, 죽은 사람끼리 표시는 그대로 @game', async ({ user, players, table }) => {
        const { t } = await setupTwo({ user, players, table });
        await c.executeByBots(t, user.account.uuid);
        await c.phaseTo(t, 'DAY');
        await t.stopBots();
        const text = c.uniq('봇낮');
        const s = await t.state();
        const aliveBot = t.bots.findIndex((b) => !c.isDead(s, b.account.uuid));
        expect((await c.botSay(t, aliveBot, text))?.ok).toBe(true);
        await c.readyToChat(user.page);
        await c.expectLine(user.page, t.bots[aliveBot].nickname, text);
        await expect(c.deadBadge(user.page)).toBeVisible();
    });
});
