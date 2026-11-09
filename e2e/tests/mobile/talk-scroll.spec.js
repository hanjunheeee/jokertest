// 모바일 카톡형 채팅방 스크롤: 맨 아래 보던 중이면 새 말 따라 내려가고, 위로 올려 읽는 중이면 그대로 + "새 메시지 ↓" 단추
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, say, sleep, CHAT_GAP_MS } = require('./_talk');

// 봇 셋이 번갈아 n마디 (봇마다 0.5초 간격 지킴)
async function flood(t, n, prefix = '쌓이는 말') {
    const per = Math.ceil(n / t.bots.length);
    await Promise.all(t.bots.map(async (bot, b) => {
        for (let i = 0; i < per; i += 1) {
            await bot.request('submit_game_chat_message', { gameId: t.gameId, text: `${prefix} ${b}-${i}` });
            await sleep(CHAT_GAP_MS);
        }
    }));
}

const scrollState = (page) => talk.scroller(page).evaluate((el) => ({ top: el.scrollTop, gap: el.scrollHeight - el.scrollTop - el.clientHeight, height: el.scrollHeight }));
const scrollUp = (page) => talk.scroller(page).evaluate((el) => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });

async function chattyDay(table, user) {
    const t = await startTalkGame(table, user, { bots: 3 });
    t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
    await toDay(t, user.page);
    await flood(t, 24);
    await expect(talk.lines(user.page)).toHaveCount(24);
    return t;
}

test.describe('채팅방 스크롤', () => {
    test('말이 채팅방보다 많이 쌓이면 → 맨 아래 최신 말이 보이는 자리에 있음 @game', async ({ user, table }) => {
        await chattyDay(table, user);
        const s = await scrollState(user.page);
        expect(s.top).toBeGreaterThan(0);
        expect(s.gap).toBeLessThanOrEqual(48);
        await expect(talk.lines(user.page).last()).toBeInViewport();
    });

    test('맨 아래를 보던 중 새 말이 오면 → 따라 내려가서 새 말이 보임 @game', async ({ user, table }) => {
        const t = await chattyDay(table, user);
        await t.bots[0].request('submit_game_chat_message', { gameId: t.gameId, text: '따라 내려감' });
        await expect(talk.others(user.page).filter({ hasText: '따라 내려감' })).toBeInViewport();
        await expect(talk.newButton(user.page)).toHaveCount(0);
    });

    test('위로 올려 읽는 중 새 말이 오면 → 화면이 안 내려가고 "새 메시지 ↓" 단추가 뜸 @game', async ({ user, table }) => {
        const t = await chattyDay(table, user);
        await scrollUp(user.page);
        await sleep(200);
        await t.bots[1].request('submit_game_chat_message', { gameId: t.gameId, text: '안 보이는 새 말' });
        await expect(talk.newButton(user.page)).toBeVisible();
        expect((await scrollState(user.page)).top).toBeLessThan(10);
        await expect(talk.others(user.page).filter({ hasText: '안 보이는 새 말' })).not.toBeInViewport();
    });

    test('"새 메시지 ↓"를 누르면 → 맨 아래로 내려가고 단추가 사라짐 @game', async ({ user, table }) => {
        const t = await chattyDay(table, user);
        await scrollUp(user.page);
        await sleep(200);
        await t.bots[1].request('submit_game_chat_message', { gameId: t.gameId, text: '단추로 보기' });
        await talk.newButton(user.page).click();
        await expect(talk.newButton(user.page)).toHaveCount(0);
        await expect(talk.others(user.page).filter({ hasText: '단추로 보기' })).toBeInViewport();
    });

    test('"새 메시지 ↓"가 뜬 뒤 손으로 맨 아래까지 내리면 → 단추가 사라짐 @game', async ({ user, table }) => {
        const t = await chattyDay(table, user);
        await scrollUp(user.page);
        await sleep(200);
        await t.bots[1].request('submit_game_chat_message', { gameId: t.gameId, text: '손으로 내림' });
        await expect(talk.newButton(user.page)).toBeVisible();
        await talk.scroller(user.page).evaluate((el) => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
        await expect(talk.newButton(user.page)).toHaveCount(0);
    });

    test('"새 메시지 ↓" 단추는 → 손가락 누름 높이 44px 이상이고 채팅방 안 아래 가운데 @game', async ({ user, table }) => {
        const t = await chattyDay(table, user);
        await scrollUp(user.page);
        await sleep(200);
        await t.bots[1].request('submit_game_chat_message', { gameId: t.gameId, text: '단추 크기' });
        const btn = await talk.newButton(user.page).boundingBox();
        const panel = await talk.chat(user.page).boundingBox();
        expect(btn.height).toBeGreaterThanOrEqual(44);
        expect(Math.abs(btn.x + btn.width / 2 - (panel.x + panel.width / 2))).toBeLessThan(6);
        expect(btn.y + btn.height).toBeLessThanOrEqual(panel.y + panel.height);
    });

    test('채팅방을 위로 올려도 → 위 줄·초상 띠·입력칸은 제자리에 그대로 있음 @game', async ({ user, table }) => {
        await chattyDay(table, user);
        const before = await talk.strip(user.page).boundingBox();
        const inputBefore = await talk.input(user.page).boundingBox();
        await scrollUp(user.page);
        await sleep(200);
        expect((await talk.strip(user.page).boundingBox()).y).toBe(before.y);
        expect((await talk.input(user.page).boundingBox()).y).toBe(inputBefore.y);
        expect(await user.page.evaluate(() => window.scrollY)).toBe(0);
    });

    test('맨 아래를 보던 중 카드 판을 크게 펼쳐 채팅방이 줄어도 → 여전히 최신 말이 보임 @game', async ({ user, table }) => {
        await chattyDay(table, user);
        await user.page.getByRole('button', { name: '카드 판 크게 보기' }).click();
        await expect(talk.board(user.page)).toBeVisible();
        await expect.poll(async () => (await scrollState(user.page)).gap).toBeLessThanOrEqual(48);
        await expect(talk.lines(user.page).last()).toBeInViewport();
    });

    test('맨 아래를 보던 중 내가 말하면 → 내 말풍선이 바로 보임 @game', async ({ user, table }) => {
        await chattyDay(table, user);
        await say(user.page, '내 최신 말');
        await expect(talk.mine(user.page).filter({ hasText: '내 최신 말' })).toBeInViewport();
    });
});
