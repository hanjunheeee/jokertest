// 이모티콘: 내 카드 우클릭 → 8칸 팔레트, 고르면 내 카드 위 말풍선 3초 (판 전체에 보임), 죽은 사람·너무 빠름·안 가진 것은 거절
// 기본 팔레트 = 기본 이모티콘 8개 (거절·눈물·분노·사랑·씨익·안녕·항복·헤롱)
const { test, expect } = require('../../../helpers/fixtures');
const c = require('./_lib');
const { E2E } = require('../../../helpers/env');

const BASIC = ['거절', '눈물', '분노', '사랑', '씨익', '안녕', '항복', '헤롱'];
const palette = (page) => page.getByRole('group', { name: '이모티콘 팔레트' });
const bubbleOn = (page, nickname) => page.locator(`[data-ingame-player-nickname="${nickname}"]`).locator('xpath=ancestor::*[@role="button"][1]').locator('[data-ingame-emoji-bubble]');

async function solo({ user, table, phase = 'DAY', bots = 3, role = 'CITIZEN' }) {
    const t = await c.startGame(table, { humans: [user], bots, roles: ({ bots: b }) => (role === 'JOKER' ? { [user.account.uuid]: 'JOKER' } : { [user.account.uuid]: role, [b[0].account.uuid]: 'JOKER' }) });
    await c.phaseTo(t, phase);
    await c.readyToChat(user.page);
    return t;
}
async function openPalette(page, nickname) {
    await c.selfCard(page, nickname).click({ button: 'right' });
    await expect(palette(page)).toBeVisible();
}
// 팔레트 칸 바꾸기 (판 시작 전에 해야 판에 실림)
async function savePalette(context, slots) {
    const headers = { origin: E2E.desktopUrl };
    const cur = await (await context.request.get(`${E2E.apiUrl}/user/me/emoji-palette`, { headers })).json();
    const res = await context.request.put(`${E2E.apiUrl}/user/me/emoji-palette`, { headers, data: { slots, expectedRevision: cur.revision } });
    expect(res.ok()).toBe(true);
}
const botEmoji = (t, i, itemId) => t.bots[i].request('send_emoji', { gameId: t.gameId, itemId });

test.describe('팔레트 열고 닫기', () => {
    test('낮에 내 카드를 우클릭하면 → 이모티콘 팔레트가 뜨고 기본 8개가 보임 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openPalette(user.page, user.account.nickname);
        for (const name of BASIC) await expect(palette(user.page).getByRole('button', { name: `${name} 보내기` })).toBeVisible();
    });

    test('다른 사람 카드를 우클릭하면 → 팔레트가 안 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await c.card(user.page, t.bots[1].nickname).click({ button: 'right' });
        await c.sleep(500);
        await expect(palette(user.page)).toHaveCount(0);
    });

    test('팔레트가 뜬 채 Esc를 누르면 → 팔레트가 닫힘 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openPalette(user.page, user.account.nickname);
        await user.page.keyboard.press('Escape');
        await expect(palette(user.page)).toHaveCount(0);
    });

    test('팔레트 바깥(채팅 칸)을 누르면 → 팔레트가 닫힘 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openPalette(user.page, user.account.nickname);
        await user.page.getByRole('timer').first().click({ force: true });
        await expect(palette(user.page)).toHaveCount(0);
    });

    test('팔레트에서 하나 고르면 → 팔레트가 바로 닫힘 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openPalette(user.page, user.account.nickname);
        await palette(user.page).getByRole('button', { name: '사랑 보내기' }).click();
        await expect(palette(user.page)).toHaveCount(0);
    });

    test('팔레트 칸 하나를 비워 두고 판을 시작하면 → 그 칸은 "1번 칸 비어 있음"으로 눌리지 않음 @game', async ({ user, table }) => {
        await savePalette(user.context, [null, 'emoji-basic-tears', 'emoji-basic-anger', 'emoji-basic-love', 'emoji-basic-grin', 'emoji-basic-hello', 'emoji-basic-surrender', 'emoji-basic-dizzy']);
        await solo({ user, table });
        await openPalette(user.page, user.account.nickname);
        await expect(palette(user.page).getByRole('button', { name: '1번 칸 비어 있음' })).toBeDisabled();
        await expect(palette(user.page).getByRole('button', { name: '거절 보내기' })).toHaveCount(0);
    });

    test('팔레트 순서를 바꿔 두면 → 판 팔레트 첫 칸에 바꾼 이모티콘이 옴 @game', async ({ user, table }) => {
        await savePalette(user.context, ['emoji-basic-dizzy', 'emoji-basic-tears', 'emoji-basic-anger', 'emoji-basic-love', 'emoji-basic-grin', 'emoji-basic-hello', 'emoji-basic-surrender', 'emoji-basic-reject']);
        await solo({ user, table });
        await openPalette(user.page, user.account.nickname);
        await expect(palette(user.page).getByRole('button').first()).toHaveAccessibleName('헤롱 보내기');
    });
});

test.describe('말풍선', () => {
    test('거절을 고르면 → 내 카드 위에 거절 말풍선이 뜸 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openPalette(user.page, user.account.nickname);
        await palette(user.page).getByRole('button', { name: '거절 보내기' }).click();
        await expect(user.page.locator('[data-ingame-emoji-bubble="emoji-basic-reject"]')).toBeVisible();
    });

    test('말풍선은 → 3초쯤 지나면 사라짐 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openPalette(user.page, user.account.nickname);
        await palette(user.page).getByRole('button', { name: '눈물 보내기' }).click();
        const bubble = user.page.locator('[data-ingame-emoji-bubble="emoji-basic-tears"]');
        await expect(bubble).toBeVisible();
        await c.sleep(2000);
        await expect(bubble).toBeVisible();
        await expect(bubble).toHaveCount(0, { timeout: 4000 });
    });

    test('내가 이모티콘을 보내면 → 같은 판 p2 화면의 내 카드 위에도 뜸 @game', async ({ user, players, table }) => {
        const p2 = await players.add();
        const t = await c.startGame(table, { humans: [user, p2], bots: 3, roles: ({ bots: b }) => ({ [user.account.uuid]: 'CITIZEN', [p2.account.uuid]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
        await c.phaseTo(t, 'DAY');
        await c.readyToChat(user.page);
        await c.readyToChat(p2.page);
        await openPalette(user.page, user.account.nickname);
        await palette(user.page).getByRole('button', { name: '안녕 보내기' }).click();
        await expect(p2.page.getByRole('button', { name: new RegExp(`^${user.account.nickname}.*안녕`) })).toBeVisible();
    });

    test('봇이 이모티콘을 보내면 → 내 화면의 그 봇 카드 이름에 이모티콘 이름이 붙음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        expect((await botEmoji(t, 1, 'emoji-basic-grin'))?.ok).toBe(true);
        await expect(user.page.getByRole('button', { name: new RegExp(`^${t.bots[1].nickname}.*씨익`) })).toBeVisible();
    });

    test('내 이모티콘이 뜨면 → 봇들이 emoji_shown 사건을 받음 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await openPalette(user.page, user.account.nickname);
        await palette(user.page).getByRole('button', { name: '분노 보내기' }).click();
        await expect.poll(() => t.bots[1].events.some((r) => r.event === 'emoji_shown' && r.payload?.uuid === user.account.uuid && r.payload?.itemId === 'emoji-basic-anger')).toBe(true);
    });

    test('1초 지나 다른 이모티콘을 보내면 → 말풍선이 새 것으로 바뀜 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openPalette(user.page, user.account.nickname);
        await palette(user.page).getByRole('button', { name: '거절 보내기' }).click();
        await expect(user.page.locator('[data-ingame-emoji-bubble="emoji-basic-reject"]')).toBeVisible();
        await c.sleep(1200);
        await openPalette(user.page, user.account.nickname);
        await palette(user.page).getByRole('button', { name: '사랑 보내기' }).click();
        await expect(user.page.locator('[data-ingame-emoji-bubble="emoji-basic-love"]')).toBeVisible();
        await expect(user.page.locator('[data-ingame-emoji-bubble="emoji-basic-reject"]')).toHaveCount(0);
    });

    test('1초 안에 두 번 보내면 → 두 번째는 거절되고 첫 말풍선이 그대로 @game', async ({ user, table }) => {
        await solo({ user, table });
        await openPalette(user.page, user.account.nickname);
        await palette(user.page).getByRole('button', { name: '거절 보내기' }).click();
        await openPalette(user.page, user.account.nickname);
        await palette(user.page).getByRole('button', { name: '헤롱 보내기' }).click();
        await c.sleep(500);
        await expect(user.page.locator('[data-ingame-emoji-bubble="emoji-basic-reject"]')).toBeVisible();
        await expect(user.page.locator('[data-ingame-emoji-bubble="emoji-basic-dizzy"]')).toHaveCount(0);
    });

    test('봇이 1초 안에 두 번 보내면 → 두 번째 응답은 거절 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        expect((await botEmoji(t, 1, 'emoji-basic-grin'))?.ok).toBe(true);
        expect((await botEmoji(t, 1, 'emoji-basic-love'))?.ok).toBe(false);
    });

    test('봇이 안 가진 상점 이모티콘을 보내면 → 거절되고 말풍선이 안 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        expect((await botEmoji(t, 1, 'emoji-shush'))?.ok).toBe(false);
        await c.sleep(800);
        await expect(user.page.locator('[data-ingame-emoji-bubble]')).toHaveCount(0);
    });

    test('봇이 없는 id를 보내면 → 거절 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        expect((await botEmoji(t, 1, 'emoji-basic-없는것'))?.ok).toBe(false);
    });

    test('밤에도 이모티콘을 보내면 → 다른 직업(광대 봇)에게도 보임 @game', async ({ user, table }) => {
        const t = await solo({ user, table, phase: 'NIGHT' });
        await openPalette(user.page, user.account.nickname);
        await palette(user.page).getByRole('button', { name: '항복 보내기' }).click();
        await expect.poll(() => t.bots[0].events.some((r) => r.event === 'emoji_shown' && r.payload?.uuid === user.account.uuid)).toBe(true);
    });

    test('두 봇이 동시에 보내면 → 두 카드에 각각 말풍선이 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table });
        await Promise.all([botEmoji(t, 1, 'emoji-basic-reject'), botEmoji(t, 2, 'emoji-basic-tears')]);
        await expect(user.page.getByRole('button', { name: new RegExp(`^${t.bots[1].nickname}.*거절`) })).toBeVisible();
        await expect(user.page.getByRole('button', { name: new RegExp(`^${t.bots[2].nickname}.*눈물`) })).toBeVisible();
    });
});

test.describe('죽은 사람', () => {
    test('죽은 봇이 이모티콘을 보내면 → 거절되고 말풍선이 안 뜸 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, t.bots[1].account.uuid);
        await t.stopBots();
        expect((await botEmoji(t, 1, 'emoji-basic-reject'))?.ok).toBe(false);
        await c.sleep(800);
        await expect(user.page.locator('[data-ingame-emoji-bubble]')).toHaveCount(0);
    });

    test('죽은 내가 팔레트에서 골라도 → 봇들은 emoji_shown을 못 받음 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        await c.executeByBots(t, user.account.uuid);
        await t.stopBots();
        await c.readyToChat(user.page);
        await c.selfCard(user.page, user.account.nickname).click({ button: 'right' });
        if (await palette(user.page).isVisible().catch(() => false)) {
            await palette(user.page).getByRole('button', { name: '거절 보내기' }).click();
        }
        await c.sleep(1200);
        expect(t.bots[1].events.some((r) => r.event === 'emoji_shown' && r.payload?.uuid === user.account.uuid)).toBe(false);
    });

    test('나간 봇이 이모티콘을 보내면 → 거절 @game', async ({ user, table }) => {
        const t = await solo({ user, table, bots: 4 });
        const left = await t.bots[1].request('leave_game_session', { gameId: t.gameId });
        expect(left?.ok).toBe(true);
        expect((await botEmoji(t, 1, 'emoji-basic-reject'))?.ok).toBe(false);
    });
});

test('내 카드를 우클릭한 채 칸 위로 끌어 떼면 → 그 이모티콘이 보내짐 @game', async ({ user, table }) => {
    await solo({ user, table });
    const cardBox = await c.selfCard(user.page, user.account.nickname).boundingBox();
    await user.page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await user.page.mouse.down({ button: 'right' });
    await expect(palette(user.page)).toBeVisible();
    const slot = await palette(user.page).getByRole('button', { name: '씨익 보내기' }).boundingBox();
    await user.page.mouse.move(slot.x + slot.width / 2, slot.y + slot.height / 2, { steps: 5 });
    await user.page.mouse.up({ button: 'right' });
    await expect(user.page.locator('[data-ingame-emoji-bubble="emoji-basic-grin"]')).toBeVisible();
});

test('말풍선 그림에는 → 이모티콘 이름(alt)이 붙어 있음 @game', async ({ user, table }) => {
    await solo({ user, table });
    await openPalette(user.page, user.account.nickname);
    await palette(user.page).getByRole('button', { name: '헤롱 보내기' }).click();
    await expect(user.page.locator('[data-ingame-emoji-bubble="emoji-basic-dizzy"]').getByRole('img', { name: '헤롱' })).toBeVisible();
});
