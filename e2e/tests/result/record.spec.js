// 전적: 판이 끝나면 마이페이지 전체 판수·승률이 바뀜 (새 계정 0판 → 이김/짐 반영)
const { test, expect } = require('../../helpers/fixtures');
const h = require('../room/roomHelpers');

// 마이페이지 피의 기록 한 줄 값
async function stat(page, label) {
    const row = page.locator('div.flex.items-center.justify-between').filter({ hasText: label }).first();
    await expect(row).toBeVisible();
    return (await row.locator('span').last().innerText()).trim();
}

async function openMyPage(page) {
    await page.goto('/mypage');
    await expect(page.getByText('전체 판수')).toBeVisible({ timeout: 15000 });
}

// 서버에 결과가 저장될 때까지 마이페이지를 다시 열며 기다림
async function expectStats(page, games, rate) {
    await expect.poll(async () => {
        await openMyPage(page);
        return [await stat(page, '전체 판수'), await stat(page, '승률')].join(' ');
    }, { timeout: 20000 }).toBe(`${games} ${rate}`);
}

test.describe('전적', () => {
    test('새 계정 마이페이지는 → 전체 판수 0, 승률 0.0%', async ({ user }) => {
        await openMyPage(user.page);
        expect(await stat(user.page, '전체 판수')).toBe('0');
        expect(await stat(user.page, '승률')).toBe('0.0%');
    });

    test('한 판 이기고 마이페이지에 가면 → 전체 판수 1, 승률 100.0% @game', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerWin' });
        await expectStats(user.page, '1', '100.0%');
    });

    test('한 판 지고 마이페이지에 가면 → 전체 판수 1, 승률 0.0% @game', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerLose' });
        await expectStats(user.page, '1', '0.0%');
    });

    test('시민으로 이긴 판도 → 승리로 셈 (1판 100.0%) @game', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'citizenWin' });
        await expectStats(user.page, '1', '100.0%');
    });

    test('한 번 이기고 한 번 지면 → 전체 판수 2, 승률 50.0% @game', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerWin' });
        user.page.once('dialog', (d) => d.accept()); // 나가기 확인 창
        await user.page.getByRole('button', { name: '로비로' }).click();
        await expect(user.page).toHaveURL(/\/lobby$/);
        await h.playToResult({ user, table, kind: 'jokerLose' });
        await expectStats(user.page, '2', '50.0%');
    });

    test('같은 판의 상대(봇)도 → 전적이 1판으로 늘어남(DB) @game', async ({ user, table }) => {
        const { t } = await h.playToResult({ user, table, kind: 'jokerWin' });
        const db = require('../../helpers/db');
        await expect.poll(async () => (await db.query('SELECT COUNT(*) AS n FROM game_result_players WHERE user_id = ?', [t.bots[0].uuid]))[0].n, { timeout: 15000 }).toBe(1);
    });

    test('판이 끝나면 → DB 판 결과에 참가자 둘이 다 남음 @game', async ({ user, table }) => {
        const { t } = await h.playToResult({ user, table, kind: 'jokerWin' });
        const db = require('../../helpers/db');
        await expect.poll(async () => (await db.query('SELECT COUNT(*) AS n FROM game_result_players WHERE game_id = ?', [t.gameId]))[0].n, { timeout: 15000 }).toBe(2);
    });
});
