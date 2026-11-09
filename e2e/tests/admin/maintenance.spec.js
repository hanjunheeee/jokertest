// 관리자 점검 브라우저 시험 (AD-164, @serial): 점검 예약 → 순서 안내 단계 바뀜 → 시작 시각 지남(판 강제 종료 결과) → 끄기
// serial 프로젝트(서버 전체 점검이라 한 번에 하나)라 주소는 관리자 화면(E2E.adminUrl)으로 바꿔 씀
const { test, expect, E2E } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');

test.use({ baseURL: E2E.adminUrl });

// 지금부터 분 뒤 시각 → 시각 칸 값(한국 시각), 예: 지금 03:00Z, 10 → '…T12:10'
const kstInput = (minutesFromNow) => new Date(Date.now() + minutesFromNow * 60_000 + 9 * 3_600_000).toISOString().slice(0, 16);

// 점검 끄고 다시 읽기 (실패해도 다음 시험이 점검에 걸리지 않게)
async function resetMaintenance(internal) {
    await query('UPDATE maintenance_state SET is_enabled = 0, starts_at = NULL, ends_at = NULL, message = NULL, updated_by_admin_id = NULL WHERE id = 1');
    await internal.reloadMaintenance();
}

test.describe('관리자 점검', () => {
    test('AD-164: 예약 → 3단계 예약됨·서버별 반영 → 시각 지남 → 강제 종료 결과·판 0개 → 끄기 → 1단계 @serial', async ({ page, internal }) => {
        try {
            await loginAsAdmin(page, await createAdmin());
            await page.goto('/maintenance');
            await expect(page.getByRole('heading', { name: '점검', level: 1 })).toBeVisible();
            const stage = page.getByTestId('maintenance-stage');
            await expect(stage).toHaveText(/1단계 · 예약 전/);
            await expect(page.getByRole('link', { name: '공지 화면으로' }).first()).toHaveAttribute('href', '/announcements');

            // 예약 (30분 뒤)
            await page.getByLabel('시작 시각 (한국 시각)').fill(kstInput(30));
            await page.getByLabel('안내 문구').fill('브라우저 시험 점검');
            await page.getByRole('button', { name: '점검 예약하기' }).click();
            const dialog = page.getByRole('dialog', { name: '점검을 예약할까요?' });
            await expect(dialog).toContainText('시작 시각에 진행 중인 판은 승패 없이 끝나고');
            await dialog.getByRole('button', { name: '예약하기' }).click();
            await expect(stage).toHaveText(/3단계 · 예약됨/);
            await expect(page.getByText(/반영됨$/).first()).toBeVisible();
            await expect(page.getByText(/반영 안 됨/)).toHaveCount(0);
            await expect(page.getByTestId('maintenance-state')).toHaveText('예약됨');

            // 시작 시각을 지난 시각으로 바꿈 → 바로 점검 중, 서버가 판·방을 끝내고 결과를 기록
            await page.getByLabel('시작 시각 (한국 시각)').fill(kstInput(-1));
            await page.getByRole('button', { name: '점검 바꾸기' }).click();
            await page.getByRole('dialog', { name: '점검을 바꿀까요?' }).getByRole('button', { name: '바꾸기' }).click();
            await expect(page.getByTestId('maintenance-state')).toHaveText('점검 중');
            await expect(async () => {
                await page.reload();
                await expect(page.getByText(/판 \d+개 끝냄 · 방 \d+개 닫음/).first()).toBeVisible({ timeout: 2_000 });
                await expect(stage).toHaveText(/5단계 · 점검 중 · 판 0개/, { timeout: 2_000 });
            }).toPass({ timeout: 20_000 });
            await page.screenshot({ path: test.info().outputPath('maintenance-active.png'), fullPage: true });

            // 끄기
            await page.getByRole('button', { name: '점검 끄기' }).click();
            await page.getByRole('dialog', { name: '점검을 끌까요?' }).getByRole('button', { name: '끄기' }).click();
            await expect(stage).toHaveText(/1단계 · 예약 전/);
            await expect(page.getByTestId('maintenance-state')).toHaveText('꺼짐');
        } finally {
            await resetMaintenance(internal);
        }
    });
});
