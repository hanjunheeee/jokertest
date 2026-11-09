// 관리자 통계 브라우저 시험 (AD-224): 기간 고르면 막대 넷 + 날짜별 숫자, 오늘 가입한 사람이 오늘 가입 수에 들어감
// 프로젝트 admin (1280×800), 다른 시험이 같이 돌아 숫자는 "1 이상"으로 봄
const { test, expect } = require('../../helpers/fixtures');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');

// 한국 오늘 날짜 글자 (예: '2026-11-10')
const kstToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

test.describe('관리자 통계', () => {
    test('AD-224: 기간 고르기 → 그래프 넷 + 오늘 줄 가입 1 이상', async ({ page, accounts }) => {
        await accounts.create();
        await loginAsAdmin(page, await createAdmin());
        await page.goto('/stats');
        await expect(page.getByRole('heading', { name: '통계', level: 1 })).toBeVisible();

        const today = kstToday();
        await page.getByLabel('시작 날짜').fill(today);
        await page.getByLabel('끝 날짜').fill(today);
        await page.getByRole('button', { name: '보기' }).click();

        await expect(page.getByRole('img', { name: /날짜별 막대/ })).toHaveCount(4);
        const row = page.getByRole('table', { name: '날짜별 통계' }).getByRole('row').filter({ hasText: today });
        await expect(row).toHaveCount(1);
        const signups = Number(await row.getByRole('cell').nth(1).innerText());
        expect(signups).toBeGreaterThanOrEqual(1);
        await expect(page.locator('svg[aria-label="가입 수 날짜별 막대"] rect[data-date]')).toHaveCount(1);
    });
});
