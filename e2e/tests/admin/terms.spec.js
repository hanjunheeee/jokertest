// 관리자 약관 브라우저 시험 (AD-243): 새 약관(곧 시행) 넣기 → 시행 시각이 지나면 플레이어 재동의 창에 그 약관
// 새 약관은 모든 플레이어에게 재동의 창을 띄우므로 @serial (다른 시험 다 끝난 뒤), 끝나면 그 버전·동의 줄 지움
// 시행 시각 기다리는 대신 DB 시행일을 1분 전으로 당김 (= 시간이 지난 것)
const crypto = require('node:crypto');
const { test, expect, E2E, ui } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');

// 한국 시각 datetime-local 칸 값 (예: 지금+10분 → '2026-11-10T12:40')
const kstInputAfter = (minutes) => new Date(Date.now() + 9 * 60 * 60 * 1000 + minutes * 60 * 1000).toISOString().slice(0, 16);

test.describe('관리자 약관', () => {
    test('AD-243: 새 약관(곧 시행) → 시행 뒤 플레이어 재동의 창 @serial', async ({ accounts, browser }) => {
        // 지금 약관에 동의한 플레이어 (새 버전 넣기 전에 만듦)
        const player = await accounts.create();
        const version = `e2e-${crypto.randomBytes(3).toString('hex')}`;
        const title = `시험 이용약관 ${version}`;
        // serial 프로젝트 주소는 데스크톱이라 관리자 주소로 따로 연 창을 씀
        const adminContext = await browser.newContext({ baseURL: E2E.adminUrl, viewport: { width: 1280, height: 800 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
        const page = await adminContext.newPage();
        try {
            await loginAsAdmin(page, await createAdmin());
            await page.goto('/terms');
            await page.getByLabel('종류').selectOption('TERMS');
            await page.getByLabel('버전').fill(version);
            await page.getByLabel('제목').fill(title);
            await page.getByLabel('시행일 (한국 시각)').fill(kstInputAfter(10));
            await page.getByLabel('본문').fill('시험으로 넣은 새 약관 본문');
            await page.getByRole('button', { name: '새 버전 넣기' }).click();
            const dialog = page.getByRole('dialog', { name: '약관 새 버전을 넣을까요?' });
            await expect(dialog).toContainText(`버전: ${version}`);
            await dialog.getByRole('button', { name: '넣기' }).click();
            await expect(page.getByRole('status')).toContainText('다시 동의해요');
            const row = page.getByRole('table', { name: '약관 버전 목록' }).getByRole('row').filter({ hasText: version });
            await expect(row).toContainText('0명');
            await expect(row).not.toContainText('지금 시행 중');

            // 시간이 지남 → 플레이어가 들어오면 재동의 창에 새 약관
            await query('UPDATE terms_versions SET effective_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE kind = ? AND version = ?', ['TERMS', version]);
            const context = await browser.newContext({ baseURL: E2E.desktopUrl, viewport: { width: 1280, height: 800 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
            try {
                const playerPage = await context.newPage();
                await ui.loginViaApi(context, player);
                await playerPage.goto('/lobby');
                const gate = playerPage.getByRole('dialog', { name: '약관이 바뀌었습니다' });
                await expect(gate).toBeVisible();
                await expect(gate.getByRole('listitem')).toHaveCount(1);
                await expect(gate).toContainText(`(버전 ${version})`);
            } finally {
                await context.close();
            }
        } finally {
            await adminContext.close();
            const rows = await query('SELECT id FROM terms_versions WHERE kind = ? AND version = ?', ['TERMS', version]);
            for (const { id } of rows) {
                await query('DELETE FROM user_terms_agreements WHERE terms_version_id = ?', [id]);
                await query('DELETE FROM terms_versions WHERE id = ?', [id]);
            }
        }
    });
});
