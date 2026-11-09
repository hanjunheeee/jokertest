// 모바일 카톡형 초상 띠: 참가자 작은 카드 한 줄(가로 넘기기)·상태 표시·내 칸·탭하면 카드 메뉴 시트·크게 보기
const { test, expect } = require('../../helpers/fixtures');
const { talk, startTalkGame, toDay, toVote, executeBot, clearOverlays, overflowX } = require('./_talk');

const DISCUSSION_NOTICE = '토론 중입니다. 투표는 아직 열리지 않았습니다.';

test.describe('초상 띠 칸', () => {
    test('5명 판에 들어가면 → 초상 띠에 참가자 수만큼 5칸이 있음 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 4 });
        await expect(talk.strip(user.page).locator('[data-strip-slot]')).toHaveCount(5);
    });

    test('초상 띠에서 → 내 칸만 이름에 "나"가 붙고 "나" 표시가 보임 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 2 });
        const mine = talk.mySlot(user.page);
        await expect(mine).toHaveCount(1);
        await expect(mine).toHaveAccessibleName(`${user.account.nickname}, 나`);
        await expect(mine.getByText('나', { exact: true })).toBeVisible();
    });

    test('봇이 처형되면 → 초상 띠 그 칸 이름에 "사망"이 붙음 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 4, roles: ({ bots }) => ({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' }) });
        const victim = t.bots[3];
        await executeBot(t, victim.account.uuid);
        await expect(talk.slot(user.page, victim.nickname)).toHaveAccessibleName(`${victim.nickname}, 사망`, { timeout: 15000 });
    });

    test('봇 연결이 끊기면 → 초상 띠 그 칸 이름에 "연결 끊김"이 붙음 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 3 });
        await toDay(t, user.page);
        const bot = t.bots[2];
        await bot.close();
        await expect(talk.slot(user.page, bot.nickname)).toHaveAccessibleName(`${bot.nickname}, 연결 끊김`, { timeout: 20000 });
    });

    test('10명 판이면 → 띠 칸 10개가 한 줄로 가로 넘겨 보이고 페이지는 가로로 안 넘침 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 9 });
        const row = talk.strip(user.page).locator('[data-strip-slot]').first().locator('xpath=..');
        await expect(talk.strip(user.page).locator('[data-strip-slot]')).toHaveCount(10);
        const { scrollWidth, clientWidth } = await row.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
        expect(scrollWidth).toBeGreaterThan(clientWidth);
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('10명 판 띠를 옆으로 넘기면 → 마지막 칸이 화면 안으로 들어옴 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 9 });
        const slots = talk.strip(user.page).locator('[data-strip-slot]');
        const last = slots.last();
        const row = slots.first().locator('xpath=..');
        await row.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
        await expect(last).toBeInViewport();
        const box = await last.boundingBox();
        expect(box.x + box.width).toBeLessThanOrEqual(375);
    });

});

test.describe('카드 판 크게 보기', () => {
    test('"카드 판 크게 보기"를 누르면 → 띠 대신 카드 판이 펼쳐지고 "카드 판 접기"가 보임 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 4 });
        const { page } = user;
        await page.getByRole('button', { name: '카드 판 크게 보기' }).click();
        await expect(talk.board(page)).toBeVisible();
        await expect(talk.board(page).locator('[data-board-slot]')).toHaveCount(5);
        await expect(talk.strip(page)).toHaveCount(0);
        await expect(page.getByRole('button', { name: '카드 판 접기' })).toHaveAttribute('aria-expanded', 'true');
    });

    test('펼친 카드 판에서 "카드 판 접기"를 누르면 → 다시 초상 띠 한 줄로 돌아옴 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 4 });
        const { page } = user;
        await page.getByRole('button', { name: '카드 판 크게 보기' }).click();
        await page.getByRole('button', { name: '카드 판 접기' }).click();
        await expect(talk.strip(page)).toBeVisible();
        await expect(talk.board(page)).toHaveCount(0);
    });

    test('10명 판 카드 판을 크게 펼쳐도 → 화면 높이 절반쯤(46%)만 쓰고 채팅방이 남음 @game', async ({ user, table }) => {
        await startTalkGame(table, user, { bots: 9 });
        const { page } = user;
        await page.getByRole('button', { name: '카드 판 크게 보기' }).click();
        const wrap = await talk.board(page).locator('xpath=..').boundingBox();
        expect(wrap.height).toBeLessThanOrEqual(812 * 0.46 + 2);
        await expect(talk.chat(page)).toBeVisible();
        expect((await talk.chat(page).boundingBox()).height).toBeGreaterThan(100);
    });

});

test.describe('카드 메뉴 시트 (탭)', () => {
    test('토론 중 남의 칸을 누르면 → 그 닉네임 시트가 올라오고 "투표하기"가 꺼진 채 이유 글이 보임 (따로 취소 버튼 없음) @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        const bot = t.bots[1];
        await talk.slot(user.page, bot.nickname).click();
        const sheet = user.page.getByRole('dialog', { name: bot.nickname });
        await expect(sheet).toBeVisible();
        await expect(sheet.getByRole('menuitem', { name: '투표하기' })).toBeDisabled();
        await expect(sheet.getByText(DISCUSSION_NOTICE)).toBeVisible();
        await expect(sheet.getByRole('menuitem', { name: '취소' })).toHaveCount(0);
    });

    test('토론 중 내 칸을 누르면 → 할 행동이 없어서 시트가 안 올라옴 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await talk.mySlot(user.page).click();
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
    });

    test('카드 시트의 닫기 그림 버튼을 누르면 → 시트가 내려감 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await talk.slot(user.page, t.bots[1].nickname).click();
        await expect(talk.cardSheet(user.page)).toBeVisible();
        await talk.cardSheet(user.page).getByRole('button', { name: '닫기' }).click();
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
    });

    test('카드 시트 바깥 어두운 곳을 누르면 → 시트가 내려감 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await talk.slot(user.page, t.bots[1].nickname).click();
        await expect(talk.cardSheet(user.page)).toBeVisible();
        await user.page.mouse.click(187, 60);
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
    });

    test('카드 시트가 떠 있을 때 Esc를 누르면 → 시트가 내려감 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await talk.slot(user.page, t.bots[1].nickname).click();
        await expect(talk.cardSheet(user.page)).toBeVisible();
        await user.page.keyboard.press('Escape');
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
    });

    test('낮 투표 중 남의 칸을 누르면 → "투표하기"가 켜져 있고 따로 취소 버튼은 없음 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toVote(t, user.page);
        await talk.slot(user.page, t.bots[1].nickname).click();
        await expect(talk.cardSheet(user.page).getByRole('menuitem', { name: '투표하기' })).toBeEnabled();
        await expect(talk.cardSheet(user.page).getByRole('menuitem', { name: '취소' })).toHaveCount(0);
    });

    test('낮 투표 중 내 칸을 누르면 → 나에게는 투표할 수 없어 시트가 안 올라옴 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        t.playBots({ dayVote: 'skip', tribunal: 'skip', night: 'skip' });
        await toVote(t, user.page);
        await talk.mySlot(user.page).click();
        await expect(talk.cardSheet(user.page)).toHaveCount(0);
    });

    test('펼친 카드 판에서 남의 카드를 눌러도 → 띠와 같은 카드 메뉴 시트가 올라옴 @game', async ({ user, table }) => {
        const t = await startTalkGame(table, user, { bots: 2 });
        await toDay(t, user.page);
        await user.page.getByRole('button', { name: '카드 판 크게 보기' }).click();
        await talk.boardSlot(user.page, t.bots[1].nickname).click();
        await expect(user.page.getByRole('dialog', { name: t.bots[1].nickname })).toBeVisible();
        await expect(talk.cardSheet(user.page).getByRole('menuitem', { name: '투표하기' })).toBeDisabled();
        await clearOverlays(user.page);
    });
});
