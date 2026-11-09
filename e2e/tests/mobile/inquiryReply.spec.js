// 모바일 플레이어 문의 답 알림 브라우저 시험 (AD-288): 관리자 답 → 알림 시트 → 문의 답 보기 → 답·"답함"
// 프로젝트 mobile (375×812), 관리자는 따로 PC 크기 창(E2E.adminUrl)에서 답함
const crypto = require('node:crypto');
const { test, expect, E2E } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');

test('AD-288: 모바일 플레이어 알림 → 문의 답 보기 → 답 보임', async ({ browser, user }) => {
    const { page, account } = user;
    const title = `폰 버그 ${crypto.randomBytes(3).toString('hex')}`;
    await query(
        "INSERT INTO inquiries (user_id, category, title, body, status, created_at, updated_at) VALUES (?, 'BUG', ?, '밤에 화면이 멈춰요', 'OPEN', NOW(), NOW())",
        [account.uuid, title],
    );
    await expect(page.getByRole('button', { name: /^알림/ })).toHaveAccessibleName(/읽지 않음 1개/);

    const adminContext = await browser.newContext({ baseURL: E2E.adminUrl, viewport: { width: 1280, height: 800 } });
    try {
        const admin = await adminContext.newPage();
        await loginAsAdmin(admin, await createAdmin());
        await admin.goto('/inquiries');
        await admin.getByRole('link', { name: title }).click();
        await admin.getByLabel('답').fill('고쳤어요. 앱을 다시 켜 보세요.');
        await admin.getByRole('button', { name: '답 보내기' }).click();
        await expect(admin.getByRole('status').filter({ hasText: '답을 달았어요.' })).toBeVisible();
    } finally {
        await adminContext.close();
    }

    const bell = page.getByRole('button', { name: /^알림/ });
    await expect(bell).toHaveAccessibleName(/읽지 않음 2개/, { timeout: 15_000 });
    await bell.click();
    const sheet = page.getByRole('dialog', { name: '알림' });
    const item = sheet.getByRole('listitem').filter({ hasText: '문의에 답이 왔어요' });
    await expect(item).toContainText(title);
    await expect(item).toHaveAttribute('data-notification-read', 'true');
    const open = item.getByRole('button', { name: '문의 답 보기' });
    await expect(open).toBeEnabled();
    await open.click();

    const detail = page.getByRole('dialog', { name: '고객센터 문의' }).getByTestId('inquiry-detail');
    await expect(detail).toContainText('고쳤어요. 앱을 다시 켜 보세요.');
    await expect(detail).toContainText('운영팀');
    await expect(detail).toContainText('답함');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
});
