// 관리자 제재 이상한 순서·동시 화면 시험: 관리자 둘이 각자 창에서 같은 회원을 같은 순간 정지, 남이 푼 뒤 먼저 열어 둔 창에서 또 해제
// 프로젝트 admin (1280×800), 서버 규칙은 backend tests/admin/sanctions.odd.integration.test.js 몫
const { test, expect, E2E } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');

// 둘째 관리자 창 (따로 쿠키) → page, 끝나면 닫힘
async function secondAdminPage(browser) {
    const context = await browser.newContext({ baseURL: E2E.adminUrl, viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await loginAsAdmin(page, await createAdmin());
    return { page, close: () => context.close() };
}

// 회원 상세에서 기간 정지 창 열고 값 채움 (누르기 전까지)
async function openPeriodBan(page, uuid, reason) {
    await page.goto(`/members/${uuid}`);
    await page.getByRole('button', { name: '기간 정지' }).click();
    const dialog = page.getByRole('dialog', { name: '기간 정지' });
    await dialog.getByLabel('정지 일수').fill('3');
    await dialog.getByLabel(/정지 사유/).fill(reason);
    return dialog;
}

test.describe('관리자 제재 이상한 순서·동시', () => {
    test('[동시] 관리자 둘이 각자 창에서 같은 회원 기간 정지를 같은 순간 누르면 → 한 창은 "정지했어요", 다른 창은 확인 창에 "이미 정지 중" 안내, 정지 줄 하나', async ({ page, browser, accounts }) => {
        const member = await accounts.create();
        await loginAsAdmin(page, await createAdmin());
        const other = await secondAdminPage(browser);
        try {
            const dialogA = await openPeriodBan(page, member.uuid, '욕설');
            const dialogB = await openPeriodBan(other.page, member.uuid, '도배');
            await Promise.all([
                dialogA.getByRole('button', { name: '정지하기' }).click(),
                dialogB.getByRole('button', { name: '정지하기' }).click(),
            ]);
            // 이긴 창: 안내 문구 / 진 창: 확인 창 안 알림
            const wonA = page.getByText('정지했어요', { exact: false }).first();
            const wonB = other.page.getByText('정지했어요', { exact: false }).first();
            await expect.poll(async () => (await wonA.isVisible()) || (await wonB.isVisible())).toBe(true);
            const loserDialog = (await wonA.isVisible()) ? dialogB : dialogA;
            await expect(loserDialog.getByRole('alert')).toContainText('이미 정지 중');
            const bans = await query('SELECT id FROM user_bans WHERE user_id = ?', [member.uuid]);
            expect(bans).toHaveLength(1);
        } finally {
            await other.close();
        }
    });

    test('[이상한 순서] 관리자 A가 해제한 뒤, 먼저 열어 둔 관리자 B 창에서 해제를 누르면 → "정지 중이 아니에요" 안내, 해제 기록 하나', async ({ page, browser, accounts }) => {
        const member = await accounts.create();
        await query('INSERT INTO user_bans (user_id, reason, is_permanent, start_at, created_at) VALUES (?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [member.uuid, '도배']);
        await loginAsAdmin(page, await createAdmin());
        const other = await secondAdminPage(browser);
        try {
            // B가 먼저 상세를 열고 해제 창까지 띄워 둠 (화면엔 아직 정지 중)
            await other.page.goto(`/members/${member.uuid}`);
            await expect(other.page.getByText('정지 중').first()).toBeVisible();
            await other.page.getByRole('button', { name: '제재 해제' }).click();
            const staleDialog = other.page.getByRole('dialog', { name: '제재 해제' });
            await staleDialog.getByLabel('해제 사유').fill('늦게 누름');

            // 그사이 A가 해제
            await page.goto(`/members/${member.uuid}`);
            await page.getByRole('button', { name: '제재 해제' }).click();
            const dialog = page.getByRole('dialog', { name: '제재 해제' });
            await dialog.getByLabel('해제 사유').fill('이의 신청');
            await dialog.getByRole('button', { name: '해제하기' }).click();
            await expect(page.getByText('정지 1건을 풀었어요', { exact: false }).first()).toBeVisible();

            await staleDialog.getByRole('button', { name: '해제하기' }).click();
            await expect(staleDialog.getByRole('alert')).toContainText('정지 중이 아니');
            const logs = await query("SELECT id FROM admin_audit_logs WHERE action = 'UNBAN' AND target_id = ?", [member.uuid]);
            expect(logs).toHaveLength(1);
            const [ban] = await query('SELECT lift_reason FROM user_bans WHERE user_id = ?', [member.uuid]);
            expect(ban.lift_reason).toBe('이의 신청');
        } finally {
            await other.close();
        }
    });
});
