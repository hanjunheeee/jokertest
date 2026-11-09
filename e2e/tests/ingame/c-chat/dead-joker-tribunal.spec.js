// 죽은 광대: 밤 광대 채팅은 읽기만(죽은 사람 목록에 섞임), 쓰면 죽은 사람 채팅으로 감 / 재판 중 죽은 사람 채팅(재판 창 안)
// 죽은 광대 판: 광대 2(나·봇0) + 시민 3 → 나 처형 뒤 1:3
const { test, expect } = require('../../../helpers/fixtures');
const c = require('./_lib');

const JOKER_EVT = 'joker_chat_message';

// 나 광대·봇0 광대, 첫 낮에 나 처형 → 첫 밤까지
async function deadJoker({ user, table, players, withP2Joker = false }) {
    const p2 = withP2Joker ? await players.add() : null;
    const t = await c.startGame(table, {
        humans: p2 ? [user, p2] : [user], bots: p2 ? 3 : 4, settings: { jokerCount: 2 },
        roles: ({ bots: b }) => (p2 ? { [user.account.uuid]: 'JOKER', [p2.account.uuid]: 'JOKER' } : { [user.account.uuid]: 'JOKER', [b[0].account.uuid]: 'JOKER' }),
    });
    await c.phaseTo(t, 'DAY');
    await c.executeByBots(t, user.account.uuid);
    await t.stopBots();
    await c.phaseTo(t, 'NIGHT');
    await c.readyToChat(user.page);
    return { t, p2 };
}
const roleBot = async (t, role, aliveOnly = true) => {
    const s = await t.state();
    return t.bots.findIndex((b) => { const p = s.players.find((x) => x.uuid === b.account.uuid); return p.role === role && (!aliveOnly || p.alive); });
};

test.describe('죽은 광대', () => {
    test('밤에 산 광대 봇이 광대 채팅을 쓰면 → 죽은 광대인 내 화면에 보임 @game', async ({ user, table, players }) => {
        const { t } = await deadJoker({ user, table, players });
        const text = c.uniq('동료밤말');
        expect((await c.botNightSay(t, 0, text))?.ok).toBe(true);
        await c.expectLine(user.page, t.bots[0].nickname, text);
    });

    test('죽은 광대가 받은 광대 채팅 줄은 → 광대 줄(JOKER)로 표시됨 @game', async ({ user, table, players }) => {
        const { t } = await deadJoker({ user, table, players });
        const text = c.uniq('광대줄');
        await c.botNightSay(t, 0, text);
        expect(await c.lineChannel(user.page, text)).toBe('JOKER');
    });

    test('죽은 광대가 밤에 쓰면 → 죽은 사람 줄(DEAD)로 들어감 @game', async ({ user, table, players }) => {
        const { t } = await deadJoker({ user, table, players });
        const text = c.uniq('죽광대말');
        await c.say(user.page, text);
        expect(await c.lineChannel(user.page, text)).toBe('DEAD');
        expect(t).toBeTruthy();
    });

    test('죽은 광대가 밤에 쓰면 → 산 광대 봇은 광대 채팅 사건을 못 받음 @game', async ({ user, table, players }) => {
        const { t } = await deadJoker({ user, table, players });
        const text = c.uniq('동료못받음');
        await c.say(user.page, text);
        await c.sleep(1000);
        expect(c.botGot(t, 0, JOKER_EVT, text)).toBe(false);
        expect(c.botGot(t, 0, 'dead_chat_message_received', text)).toBe(false);
    });

    test('죽은 광대가 밤에 쓰면 → 산 광대 p2 화면에도 안 보임 @game', async ({ user, table, players }) => {
        const { p2 } = await deadJoker({ user, table, players, withP2Joker: true });
        const text = c.uniq('p2광대못봄');
        await c.say(user.page, text);
        await c.readyToChat(p2.page);
        await c.expectNoText(p2.page, text);
    });

    test('산 광대 p2가 밤에 쓰면 → 죽은 광대인 나도 읽음 @game', async ({ user, table, players }) => {
        const { p2 } = await deadJoker({ user, table, players, withP2Joker: true });
        const text = c.uniq('p2가씀');
        await c.say(p2.page, text);
        await c.expectLine(user.page, p2.account.nickname, text);
    });

    test('죽은 광대 화면에도 밤엔 → "죽은 사람끼리" 표시가 뜸 @game', async ({ user, table, players }) => {
        await deadJoker({ user, table, players });
        await expect(c.deadBadge(user.page)).toBeVisible();
    });

    test('죽은 광대 봇이 밤 광대 채팅을 보내면 → 거절됨 @game', async ({ user, table }) => {
        const t = await c.startGame(table, { humans: [user], bots: 4, settings: { jokerCount: 2 }, roles: ({ bots: b }) => ({ [user.account.uuid]: 'JOKER', [b[1].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'DAY');
        await c.executeByBots(t, t.bots[1].account.uuid);
        await t.stopBots();
        await c.phaseTo(t, 'NIGHT');
        expect((await c.botNightSay(t, 1, c.uniq('죽은광대봇')))?.ok).toBe(false);
    });

    test('죽은 광대 봇이 밤에 낮 채팅 길로 보내면 → 죽은 사람 채팅이 되어 산 광대인 나는 못 봄 @game', async ({ user, table }) => {
        const t = await c.startGame(table, { humans: [user], bots: 4, settings: { jokerCount: 2 }, roles: ({ bots: b }) => ({ [user.account.uuid]: 'JOKER', [b[1].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'DAY');
        await c.executeByBots(t, t.bots[1].account.uuid);
        await t.stopBots();
        await c.phaseTo(t, 'NIGHT');
        const text = c.uniq('죽광봇');
        expect((await c.botSay(t, 1, text))?.ok).toBe(true);
        await c.readyToChat(user.page);
        await c.expectNoText(user.page, text);
    });

    test('다음 낮이 되면 → 죽은 광대 화면에서 밤 광대 줄이 빠지고 낮 줄만 남음 @game', async ({ user, table, players }) => {
        const { t } = await deadJoker({ user, table, players });
        const text = c.uniq('밤만광대');
        await c.botNightSay(t, 0, text);
        await c.expectLine(user.page, t.bots[0].nickname, text);
        await c.phaseTo(t, 'DAY');
        await c.readyToChat(user.page);
        await expect(c.chatLog(user.page)).not.toContainText(text);
    });

    test('죽은 시민은 → 밤 광대 채팅을 못 읽음 @game', async ({ user, table }) => {
        const t = await c.startGame(table, { humans: [user], bots: 4, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'DAY');
        await c.executeByBots(t, user.account.uuid);
        await t.stopBots();
        await c.phaseTo(t, 'NIGHT');
        const text = c.uniq('시민못읽음');
        expect((await c.botNightSay(t, 0, text))?.ok).toBe(true);
        await c.readyToChat(user.page);
        await c.expectNoText(user.page, text);
    });

    test('죽은 시민은 → 산 시민 봇의 밤 시민 채팅도 못 읽음 @game', async ({ user, table }) => {
        const t = await c.startGame(table, { humans: [user], bots: 4, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'DAY');
        await c.executeByBots(t, user.account.uuid);
        await t.stopBots();
        await c.phaseTo(t, 'NIGHT');
        const idx = await roleBot(t, 'CITIZEN');
        const text = c.uniq('시민밤못읽음');
        expect((await c.botNightSay(t, idx, text))?.ok).toBe(true);
        await c.readyToChat(user.page);
        await c.expectNoText(user.page, text);
    });
});

test.describe('재판 중 죽은 사람 채팅', () => {
    // 첫 낮 나 처형 → 둘째 낮 봇1 재판까지 (봇들이 봇1에게 투표, 재판 표는 안 냄)
    async function deadInTribunal({ user, players, table }) {
        const p2 = await players.add();
        const t = await c.startGame(table, { humans: [user, p2], bots: 4, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [p2.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'DAY');
        await c.executeByBots(t, user.account.uuid);
        const target = t.bots[1].account.uuid;
        await c.replan(t, (bot) => ({ dayVote: bot.account.uuid === target ? 'abstain' : target, tribunal: 'skip', night: 'skip', pollMs: 200 }));
        await t.advanceUntil((s) => s.phase === 'TRIBUNAL' && s.dayIndex === 2, { stepDelayMs: 900, maxSteps: 40 });
        await expect(user.page.getByRole('dialog', { name: '재판' })).toBeVisible({ timeout: 20000 });
        await c.readyToChat(user.page);
        return { t, p2 };
    }

    test('재판 중 죽은 나는 → 재판 창 채팅에 "죽은 사람끼리" 표시가 보임 @game', async ({ user, players, table }) => {
        await deadInTribunal({ user, players, table });
        await expect(user.page.getByRole('dialog', { name: '재판' }).getByText('죽은 사람끼리', { exact: true })).toBeVisible();
    });

    test('재판 중 죽은 나는 → "사망한 참가자는 투표할 수 없습니다." 안내가 보이고 유죄·무죄 버튼이 없음 @game', async ({ user, players, table }) => {
        await deadInTribunal({ user, players, table });
        const d = user.page.getByRole('dialog', { name: '재판' });
        await expect(d.getByText('사망한 참가자는 투표할 수 없습니다.')).toBeVisible();
        await expect(d.getByRole('button', { name: '유죄' })).toHaveCount(0);
    });

    test('재판 중 죽은 내가 쓰면 → 재판 창 내역에 죽은 사람 줄(DEAD)로 보임 @game', async ({ user, players, table }) => {
        await deadInTribunal({ user, players, table });
        const text = c.uniq('재판중죽은말');
        await c.say(user.page, text);
        const row = user.page.getByRole('dialog', { name: '재판' }).getByRole('listitem').filter({ hasText: text });
        await expect(row).toHaveAttribute('data-chat-channel', 'DEAD');
    });

    test('재판 중 죽은 내가 쓰면 → 산 p2의 재판 창에는 안 보임 @game', async ({ user, players, table }) => {
        const { p2 } = await deadInTribunal({ user, players, table });
        const text = c.uniq('재판비밀');
        await c.say(user.page, text);
        await c.readyToChat(p2.page);
        await c.expectNoText(p2.page, text);
    });

    test('재판 중 산 p2가 쓰면 → 죽은 나도 재판 창에서 읽음 @game', async ({ user, players, table }) => {
        const { p2 } = await deadInTribunal({ user, players, table });
        const text = c.uniq('최후변론');
        await c.say(p2.page, text);
        await c.expectLine(user.page, p2.account.nickname, text);
    });

    test('재판 중 피고 봇이 변론하면 → 죽은 나도 읽음 @game', async ({ user, players, table }) => {
        const { t } = await deadInTribunal({ user, players, table });
        const text = c.uniq('피고변론');
        expect((await c.botSay(t, 1, text))?.ok).toBe(true);
        await c.expectLine(user.page, t.bots[1].nickname, text);
    });
});
