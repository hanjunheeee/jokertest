// 게임 초대 받기 시험: 친구(봇)가 대기방에서 나를 초대 → 게임 초대 탭·알림, 거절·수락, 설정으로 알림 숨김
// 봇은 소켓 봇(방 만들기), 친구 맺기·초대 보내기는 봇 쿠키로 API
const crypto = require('node:crypto');
const { test, expect, e2e } = require('../../helpers/fixtures');
const L = require('./lobbyHelpers');

// 봇과 나를 친구로 만들고 봇이 방을 만들어 나를 초대 → 초대 data
async function inviteFromBot(bots, me) {
    const [bot] = await bots.spawn(1);
    await L.botApi(bot, 'POST', '/friends/requests', { receiverId: me.account.uuid });
    const incoming = await L.api(me, 'GET', '/friends/requests/incoming');
    const req = incoming.find((r) => r.id === bot.uuid);
    await L.api(me, 'PUT', `/friends/requests/${req.request_id}/accept`);
    await bot.createRoom();
    const invite = await L.botApi(bot, 'POST', '/friends/invites', { receiverId: me.account.uuid, creationKey: crypto.randomUUID() });
    return { bot, invite };
}

test.describe('게임 초대 받기', () => {
    test('친구가 대기방에서 나를 초대하면 → 게임 초대 탭 이름에 1이 붙고 보낸 사람 줄이 보임', async ({ players, bots }) => {
        const me = await players.add();
        const { bot } = await inviteFromBot(bots, me);
        const panel = await L.openFriendPanel(me.page);
        await expect(panel.getByRole('tab', { name: '게임 초대 1' })).toBeVisible({ timeout: 15000 });
        await L.openTab(me.page, '게임 초대');
        const list = me.page.getByRole('list', { name: '받은 게임 초대' });
        await expect(list).toContainText(bot.nickname);
        await expect(list.getByRole('button', { name: '초대 수락' })).toBeVisible();
    });

    test('초대를 받으면 → 알림 창에 "게임 초대"가 오고 초대 보러 가기를 누르면 게임 초대 탭이 열림', async ({ players, bots }) => {
        const me = await players.add();
        const { bot } = await inviteFromBot(bots, me);
        await expect(me.page.getByRole('button', { name: /^알림 \(읽지 않음 [2-9]개/ })).toBeVisible({ timeout: 15000 });
        const dialog = await L.openNotifications(me.page);
        const item = dialog.getByRole('listitem').filter({ hasText: '게임 초대' });
        await expect(item).toContainText(`${bot.nickname} 님이 대기방으로 초대했습니다.`);
        await L.clickItemAction(item, '초대 보러 가기');
        await expect(me.page.getByRole('dialog', { name: '게임 초대' })).toBeVisible();
        await expect(me.page.locator('[data-notification-target="true"]')).toContainText(bot.nickname);
    });

    test('초대 거절을 누르면 → 수락 버튼이 사라지고 끝난 초대로 바뀜', async ({ players, bots }) => {
        const me = await players.add();
        await inviteFromBot(bots, me);
        const panel = await L.openFriendPanel(me.page);
        await L.openTab(me.page, '게임 초대');
        const list = me.page.getByRole('list', { name: '받은 게임 초대' });
        await list.getByRole('button', { name: '초대 거절' }).click();
        await expect(list.getByRole('button', { name: '초대 수락' })).toHaveCount(0);
        await expect(panel.getByRole('tab', { name: '게임 초대' })).toBeVisible();
    });

    test('초대 수락을 누르면 → 그 친구 대기방으로 들어감', async ({ players, bots }) => {
        const me = await players.add();
        const { bot } = await inviteFromBot(bots, me);
        await L.openFriendPanel(me.page);
        await L.openTab(me.page, '게임 초대');
        await me.page.getByRole('list', { name: '받은 게임 초대' }).getByRole('button', { name: '초대 수락' }).click();
        await expect(me.page).toHaveURL(/\/game-matching/);
        await expect.poll(async () => (await e2e.roomOf(me.account.uuid))?.hostUuid).toBe(bot.uuid);
    });

    test('받은 초대가 없으면 → "받은 게임 초대가 없습니다"', async ({ players }) => {
        const me = await players.add();
        await L.openFriendPanel(me.page);
        await L.openTab(me.page, '게임 초대');
        await expect(me.page.getByText('받은 게임 초대가 없습니다.')).toBeVisible();
    });

    test('설정에서 게임 초대 알림을 끄면 → 초대가 와도 알림 창엔 안 보이지만 친구 패널 초대 탭엔 있음', async ({ players, bots }) => {
        const me = await players.add();
        await me.page.goto('/setting');
        await me.page.getByRole('checkbox', { name: '게임 초대' }).click();
        await me.page.goto('/lobby');
        const { bot } = await inviteFromBot(bots, me);
        const panel = await L.openFriendPanel(me.page);
        await expect(panel.getByRole('tab', { name: '게임 초대 1' })).toBeVisible({ timeout: 15000 });
        await me.page.keyboard.press('Escape');
        const dialog = await L.openNotifications(me.page);
        await expect(dialog.getByText(`${bot.nickname} 님이 대기방으로 초대했습니다.`)).toHaveCount(0);
    });
});
