// 관리자 운영 현황 브라우저 시험 (AD-115): 판 하나 진행 중 → 진행 중·오늘 총 판 수 늘어남, 신고 하나 → 새 신고 +1
// 프로젝트 admin (1280×800), 다른 시험이 같이 돌아 숫자는 "처음보다 늘었는지"로 봄
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');

// 카드 제목 → 카드 안 큰 숫자 (예: '12,345명' → 12345, '지금 숫자 못 받음' → NaN)
async function cardNumber(page, title) {
    const card = page.getByRole('heading', { name: title, exact: true }).locator('xpath=..');
    const text = await card.locator('p').first().innerText();
    return Number(text.replace(/[^0-9]/g, '') || NaN);
}

// 화면 새로 열고 숫자 읽기 (30초 기다리지 않고 바로)
async function readCards(page) {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: '운영 현황', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: '새 신고' })).toBeVisible();
    return {
        inProgress: await cardNumber(page, '지금 진행 중 판'),
        total: await cardNumber(page, '오늘 총 판 수'),
        reports: await cardNumber(page, '새 신고'),
    };
}

test.describe('관리자 운영 현황', () => {
    test('AD-115: 판 하나 진행 중 → 진행 중·오늘 총 판 수 +1, 신고 하나 → 새 신고 +1', async ({ page, table }) => {
        const reportGameId = `e2e-dash-${crypto.randomBytes(4).toString('hex')}`;
        try {
            await loginAsAdmin(page, await createAdmin());
            const before = await readCards(page);
            expect(Number.isFinite(before.inProgress)).toBe(true);

            // 봇 넷이 판 하나 시작 (사람 화면 없이)
            const game = await table.setup({ bots: 4 });
            expect(game.gameId).toBeTruthy();
            await expect.poll(async () => (await readCards(page)).inProgress, { timeout: 15_000 }).toBeGreaterThanOrEqual(before.inProgress + 1);
            expect((await readCards(page)).total).toBeGreaterThanOrEqual(before.total + 1);

            // 신고 하나 (판 안 신고 단추와 같은 줄을 바로 넣음)
            const [reporter, target] = game.bots.map((bot) => bot.account.uuid);
            await query('INSERT INTO reports (reporter_id, target_id, game_id, reason_code, status, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [reporter, target, reportGameId, 'ABUSE', 'OPEN']);
            await expect.poll(async () => (await readCards(page)).reports, { timeout: 15_000 }).toBeGreaterThanOrEqual(before.reports + 1);
            await expect(page.getByText('지금 숫자 못 받음')).toHaveCount(0);

            // 새 신고 카드 → 신고 화면 길
            await page.getByRole('link', { name: /새 신고/ }).click();
            await expect(page).toHaveURL(/\/reports/);
        } finally {
            await query('DELETE FROM reports WHERE game_id = ?', [reportGameId]);
        }
    });
});
