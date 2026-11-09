// 관리자 운영 현황 휴대폰 브라우저 시험 (AD-116): 375폭에서 카드가 한 줄에 하나, 가로 넘침 없음, 메뉴 서랍으로 다시 옴
// 프로젝트 admin-phone (375×812)
const { test, expect } = require('../../../helpers/fixtures');
const { createAdmin, loginAsAdmin } = require('../../../helpers/adminAccounts');

const CARD_TITLES = ['새 신고', '새 문의', '전체 가입자', '오늘 총 판 수', '지금 진행 중 판', '지금 접속', '점검'];

test.describe('관리자 운영 현황 (휴대폰)', () => {
    test('AD-116: 카드 일곱 개 세로로, 화면 밖으로 안 넘침, 누르는 카드 44px 이상', async ({ page }) => {
        await loginAsAdmin(page, await createAdmin());
        await page.goto('/dashboard');
        await expect(page.getByRole('heading', { name: '운영 현황', level: 1 })).toBeVisible();

        const boxes = [];
        for (const title of CARD_TITLES) {
            const heading = page.getByRole('heading', { name: title, exact: true });
            await expect(heading).toBeVisible();
            boxes.push(await heading.locator('xpath=ancestor::li[1]').boundingBox());
        }
        // 한 줄에 하나: 왼쪽 끝이 다 같고 위에서 아래로
        const lefts = new Set(boxes.map((box) => Math.round(box.x)));
        expect(lefts.size).toBe(1);
        for (let i = 1; i < boxes.length; i += 1) expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y);
        for (const box of boxes) {
            expect(box.x + box.width).toBeLessThanOrEqual(375);
            expect(box.height).toBeGreaterThanOrEqual(44);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        await page.screenshot({ path: test.info().outputPath('dashboard-phone.png'), fullPage: true });
    });
});
