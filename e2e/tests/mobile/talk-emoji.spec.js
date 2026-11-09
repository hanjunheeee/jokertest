// 모바일 카톡형 이모티콘: 내 칸 길게 누르기 → 팔레트 8칸 → 보내기, 받은 이모티콘은 띠 칸에 작게 + 채팅방에 큰 이모티콘 줄
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, botEmoji, BASIC_EMOJI, sleep } = require('./_talk');

// 길게 누르기 (앱은 0.45초 대고 있으면 실행)
async function longPress(page, locator, holdMs = 700) {
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await sleep(holdMs);
    await page.mouse.up();
}

async function dayGame(table, user, o = {}) {
    const t = await startTalkGame(table, user, { bots: 2, ...o });
    await toDay(t, user.page);
    return t;
}

const BASIC_NAMES = ['거절', '눈물', '분노', '사랑', '씨익', '안녕', '항복', '헤롱'];

test.describe('이모티콘 팔레트', () => {
    test('내 칸을 길게 누르면 → 이모티콘 팔레트가 뜨고 기본 이모티콘 8칸이 들어 있음 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await longPress(user.page, talk.mySlot(user.page));
        const palette = talk.palette(user.page);
        await expect(palette).toBeVisible();
        for (const name of BASIC_NAMES) await expect(palette.getByRole('button', { name: `${name} 보내기` })).toBeEnabled();
    });

    test('남의 칸을 길게 누르면 → 이모티콘 팔레트가 안 뜸 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        await longPress(user.page, talk.slot(user.page, t.bots[0].nickname));
        await sleep(300);
        await expect(talk.palette(user.page)).toHaveCount(0);
    });

    test('내 칸을 짧게 탭하면 → 팔레트가 안 뜸 (길게 눌러야 뜸) @game', async ({ user, table }) => {
        await dayGame(table, user);
        await talk.mySlot(user.page).tap();
        await sleep(700);
        await expect(talk.palette(user.page)).toHaveCount(0);
    });

    test('내 칸에서 안드로이드 길게 누르기(contextmenu)가 오면 → 팔레트가 뜸 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await talk.mySlot(user.page).dispatchEvent('contextmenu');
        await expect(talk.palette(user.page)).toBeVisible();
    });

    test('팔레트 바깥을 누르면 → 팔레트가 닫힘 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await longPress(user.page, talk.mySlot(user.page));
        await expect(talk.palette(user.page)).toBeVisible();
        await user.page.getByRole('button', { name: '이모티콘 팔레트 닫기' }).dispatchEvent('pointerdown');
        await expect(talk.palette(user.page)).toHaveCount(0);
    });

    test('팔레트가 떠 있을 때 Esc를 누르면 → 팔레트가 닫힘 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await longPress(user.page, talk.mySlot(user.page));
        await expect(talk.palette(user.page)).toBeVisible();
        await user.page.keyboard.press('Escape');
        await expect(talk.palette(user.page)).toHaveCount(0);
    });

    test('팔레트는 → 375 폭 화면 가운데 안에 다 들어오고 칸이 손가락 크기(40px 이상) @game', async ({ user, table }) => {
        await dayGame(table, user);
        await longPress(user.page, talk.mySlot(user.page));
        const box = await talk.palette(user.page).boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(375);
        const slot = await talk.palette(user.page).getByRole('button', { name: '안녕 보내기' }).boundingBox();
        expect(slot.width).toBeGreaterThanOrEqual(40);
    });

    test('펼친 카드 판에서 내 카드를 길게 눌러도 → 팔레트가 뜸 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await user.page.getByRole('button', { name: '카드 판 크게 보기' }).click();
        await longPress(user.page, talk.boardSlot(user.page, user.account.nickname));
        await expect(talk.palette(user.page)).toBeVisible();
    });
});

test.describe('이모티콘 보내기·받기', () => {
    test('팔레트에서 "안녕"을 고르면 → 팔레트가 닫히고 내 띠 칸에 안녕 이모티콘이 뜸 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await longPress(user.page, talk.mySlot(user.page));
        await talk.palette(user.page).getByRole('button', { name: '안녕 보내기' }).click();
        await expect(talk.palette(user.page)).toHaveCount(0);
        await expect(talk.mySlot(user.page).locator(`[data-ingame-emoji-bubble="${BASIC_EMOJI.hello.id}"]`)).toBeVisible();
    });

    test('내가 이모티콘을 보내면 → 채팅방 오른쪽에 말풍선 틀 없이 큰 이모티콘 줄이 생김 @game', async ({ user, table }) => {
        await dayGame(table, user);
        await longPress(user.page, talk.mySlot(user.page));
        await talk.palette(user.page).getByRole('button', { name: '사랑 보내기' }).click();
        const line = talk.mine(user.page).filter({ has: user.page.locator(`[data-talk-emoji="${BASIC_EMOJI.love.id}"]`) });
        await expect(line).toBeVisible();
        await expect(line.locator('p.whitespace-pre-wrap')).toHaveCount(0);
    });

    test('봇이 이모티콘을 보내면 → 그 봇 띠 칸 오른쪽 위에 작은 이모티콘이 뜸 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        const reply = await botEmoji(t, 0, BASIC_EMOJI.tears.id);
        expect(reply.ok).toBe(true);
        await expect(talk.slot(user.page, t.bots[0].nickname).locator(`[data-ingame-emoji-bubble="${BASIC_EMOJI.tears.id}"]`)).toBeVisible();
    });

    test('봇이 이모티콘을 보내면 → 채팅방 왼쪽에 그 봇 닉네임과 이모티콘 줄이 생김 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        await botEmoji(t, 0, BASIC_EMOJI.reject.id);
        const line = talk.others(user.page).filter({ has: user.page.locator(`[data-talk-emoji="${BASIC_EMOJI.reject.id}"]`) });
        await expect(line).toBeVisible();
        await expect(line.locator('p.truncate')).toHaveText(t.bots[0].nickname);
    });

    test('띠 칸 이모티콘은 잠시 뒤 사라져도 → 채팅방 이모티콘 줄은 그대로 남음 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        await botEmoji(t, 0, BASIC_EMOJI.hello.id);
        const onSlot = talk.slot(user.page, t.bots[0].nickname).locator('[data-ingame-emoji-bubble]');
        await expect(onSlot).toBeVisible();
        await expect(onSlot).toHaveCount(0, { timeout: 10000 });
        await expect(talk.log(user.page).locator(`[data-talk-emoji="${BASIC_EMOJI.hello.id}"]`)).toBeVisible();
    });

    test('1초 안에 이모티콘을 두 번 보내면 → 둘째는 막혀서 하나만 보임 @game', async ({ user, table }) => {
        const t = await dayGame(table, user);
        const first = await t.bots[0].request('send_emoji', { gameId: t.gameId, itemId: BASIC_EMOJI.hello.id });
        const second = await t.bots[0].request('send_emoji', { gameId: t.gameId, itemId: BASIC_EMOJI.tears.id });
        expect(first.ok).toBe(true);
        expect(second.ok).not.toBe(true);
        await expect(talk.log(user.page).locator(`[data-talk-emoji="${BASIC_EMOJI.hello.id}"]`)).toBeVisible();
        await sleep(800);
        await expect(talk.log(user.page).locator(`[data-talk-emoji="${BASIC_EMOJI.tears.id}"]`)).toHaveCount(0);
    });

    test('같은 판 두 번째 사람이 이모티콘을 보내면 → 내 화면 그 사람 띠 칸과 채팅방에 보임 @game', async ({ user, players, table }) => {
        const p2 = await players.add({ mobile: true });
        const t = await startTalkGame(table, [user, p2], { bots: 1 });
        await toDay(t, [user.page, p2.page]);
        await longPress(p2.page, talk.mySlot(p2.page));
        await talk.palette(p2.page).getByRole('button', { name: '씨익 보내기' }).click();
        await expect(talk.slot(user.page, p2.account.nickname).locator('[data-ingame-emoji-bubble="emoji-basic-grin"]')).toBeVisible();
        await expect(talk.others(user.page).locator('[data-talk-emoji="emoji-basic-grin"]')).toBeVisible();
    });
});
