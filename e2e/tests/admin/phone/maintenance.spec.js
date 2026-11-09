// 관리자 점검 휴대폰 브라우저 시험 (AD-165, @serial): 375폭에서 점검 켜고 끄기, 가로 넘침 없음, 순서 안내는 폼 아래로
// 프로젝트 admin-phone-serial (375×812, serial 끝난 뒤 한 번에 하나)
const { test, expect } = require('../../../helpers/fixtures');
const { query } = require('../../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../../helpers/adminAccounts');

// 지금부터 분 뒤 시각 → 시각 칸 값(한국 시각)
const kstInput = (minutesFromNow) => new Date(Date.now() + minutesFromNow * 60_000 + 9 * 3_600_000).toISOString().slice(0, 16);

test.describe('관리자 점검 (휴대폰)', () => {
    test('AD-165: 휴대폰 크기 점검 예약(켜기) → 3단계 → 끄기 → 1단계, 화면 밖으로 안 넘침 @serial', async ({ page, internal }) => {
        try {
            await loginAsAdmin(page, await createAdmin());
            await page.goto('/maintenance');
            await expect(page.getByRole('heading', { name: '점검', level: 1 })).toBeVisible();
            const stage = page.getByTestId('maintenance-stage');
            await expect(stage).toHaveText(/1단계 · 예약 전/);

            await page.getByLabel('시작 시각 (한국 시각)').fill(kstInput(45));
            await page.getByLabel('안내 문구').fill('휴대폰 시험 점검');
            const schedule = page.getByRole('button', { name: '점검 예약하기' });
            expect((await schedule.boundingBox()).height).toBeGreaterThanOrEqual(44);
            await schedule.click();
            await page.getByRole('dialog', { name: '점검을 예약할까요?' }).getByRole('button', { name: '예약하기' }).click();
            await expect(stage).toHaveText(/3단계 · 예약됨/);

            // 순서 안내는 폼 아래 (한 줄로 쌓임)
            const form = await page.getByRole('heading', { name: '점검 바꾸기', level: 2 }).boundingBox();
            const steps = await page.getByRole('heading', { name: '점검 순서', level: 2 }).boundingBox();
            expect(steps.y).toBeGreaterThan(form.y);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBeLessThanOrEqual(0);
            await page.screenshot({ path: test.info().outputPath('maintenance-phone.png'), fullPage: true });

            await page.getByRole('button', { name: '점검 끄기' }).click();
            await page.getByRole('dialog', { name: '점검을 끌까요?' }).getByRole('button', { name: '끄기' }).click();
            await expect(stage).toHaveText(/1단계 · 예약 전/);
        } finally {
            await query('UPDATE maintenance_state SET is_enabled = 0, starts_at = NULL, ends_at = NULL, message = NULL, updated_by_admin_id = NULL WHERE id = 1');
            await internal.reloadMaintenance();
        }
    });
});
