// 모바일 다시 접속: 판 도중 새로 고침·로비로 나갔다 오기·다른 기기 로그인 → 카톡형 인게임으로 이어지는지
const { test, expect, ui } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, toNight, getExecuted, say, botSay, clearOverlays } = require('./_talk');

const citizenMe = (user) => ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' });

async function reloadIngame(page) {
    await page.reload();
    await expect(page).toHaveURL(/\/ingame/, { timeout: 20000 });
    await expect(talk.layout(page)).toBeVisible({ timeout: 20000 });
    await clearOverlays(page);
}

test.describe('다시 접속', () => {
    test('낮 토론 중 새로 고침하면 → 다시 카톡형 인게임이고 단계 줄이 "제 1일 · 낮 토론" @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toDay(t, user.page);
        await reloadIngame(user.page);
        await expect(talk.phaseLine(user.page)).toContainText('제 1일');
        await expect(talk.phaseLine(user.page)).toContainText('낮 토론');
        await expect(talk.strip(user.page).locator('[data-strip-slot]')).toHaveCount(3);
    });

    test('새로 고침하면 → 그 전에 오간 낮 말이 채팅방에 다시 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toDay(t, user.page);
        await say(user.page, '새로고침 전 내 말');
        await botSay(t, 0, '새로고침 전 봇 말');
        await reloadIngame(user.page);
        await expect(talk.mine(user.page).filter({ hasText: '새로고침 전 내 말' })).toBeVisible({ timeout: 15000 });
        await expect(talk.others(user.page).filter({ hasText: '새로고침 전 봇 말' })).toBeVisible();
    });

    test('새로 고침한 뒤에도 → 바로 말을 보낼 수 있음 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toDay(t, user.page);
        await reloadIngame(user.page);
        await say(user.page, '새로고침 뒤 말');
    });

    test('밤에 새로 고침해도 → "밤 · 같은 직업끼리" 띠가 그대로 보임 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3, roles: { [user.account.uuid]: 'JOKER' } });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toNight(t, user.page);
        await reloadIngame(user.page);
        await expect(talk.nightBanner(user.page)).toBeVisible();
    });

    test('죽은 뒤 새로 고침해도 → "죽은 사람끼리" 띠와 내 칸 "사망"이 그대로 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, roles: citizenMe(user) });
        await getExecuted(t, user.account.uuid, { pages: [user.page] });
        await reloadIngame(user.page);
        await expect(talk.deadBanner(user.page)).toBeVisible();
        await expect(talk.mySlot(user.page)).toHaveAccessibleName(/사망/);
    });

    test('판 도중 로비 주소로 가도 → 판이 남아 있어 인게임 화면으로 돌아옴 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toDay(t, user.page);
        await user.page.goto('/lobby');
        await expect(user.page).toHaveURL(/\/ingame/, { timeout: 20000 });
    });

    test('같은 계정으로 다른 폰에서 로그인해 들어오면 → 그 폰도 진행 중인 판 인게임으로 이어짐 @game', async ({ user, players, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ readyForVote: false, dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toDay(t, user.page);
        const second = await players.add({ mobile: true, account: user.account, lobby: false });
        await second.page.goto('/ingame');
        await expect(second.page).toHaveURL(/\/ingame/, { timeout: 20000 });
        await expect(talk.layout(second.page)).toBeVisible({ timeout: 20000 });
        await clearOverlays(second.page);
        await expect(talk.phaseLine(second.page)).toContainText('제 1일');
    });
});
