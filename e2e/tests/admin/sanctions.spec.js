// 관리자 제재 브라우저 시험 (AD-081·082·083): 기간 정지 → 플레이어 튕김·로그인 막힘, 해제 → 다시 로그인·해제 사유, 강제 접속 종료 → 끊김 안내
// 프로젝트 admin (1280×800), 플레이어는 진짜 로그인해서 로비에 있음
const { test, expect, E2E } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const { captureAlert, loginViaUi } = require('../../helpers/ui');

// 플레이어 로그인 화면에서 로그인 눌러 뜬 알림 문구 (정지면 실패 알림)
async function tryPlayerLogin(page, account) {
    await page.goto('/login');
    await page.getByPlaceholder('이메일을 입력하세요').fill(account.email);
    await page.getByPlaceholder('비밀번호를 입력하세요').fill(account.password);
    return captureAlert(page, () => page.getByRole('button', { name: '로그인', exact: true }).click());
}

test.describe('관리자 제재', () => {
    test('AD-081: 기간 정지 → 확인 창에 대상·기간·사유 → 플레이어 창 튕김 안내 → 다시 로그인 막힘', async ({ page, players }) => {
        const target = await players.add();
        await loginAsAdmin(page, await createAdmin());
        await page.goto(`/members/${target.account.uuid}`);

        await page.getByRole('button', { name: '기간 정지' }).click();
        const dialog = page.getByRole('dialog', { name: '기간 정지' });
        await expect(dialog.getByRole('button', { name: '정지하기' })).toBeDisabled();
        await dialog.getByLabel('정지 일수').fill('3');
        await dialog.getByLabel(/정지 사유/).fill('욕설');
        await expect(dialog).toContainText(`대상: ${target.account.nickname}`);
        await expect(dialog).toContainText('기간: 3일');
        await expect(dialog).toContainText('사유: 욕설');
        await expect(dialog).toContainText('플레이어에게 보이는 사유');

        const notice = await captureAlert(target.page, () => dialog.getByRole('button', { name: '정지하기' }).click(), { timeoutMs: 15000 });
        expect(notice).toContain('정지된 계정');
        await expect(target.page).toHaveURL(/\/login/, { timeout: 15000 });
        await expect(page.getByText('정지했어요', { exact: false }).first()).toBeVisible();
        await expect(page.getByText('정지 중').first()).toBeVisible();

        const refused = await tryPlayerLogin(target.page, target.account);
        expect(refused).toContain('정지된 계정');
        expect(refused).toContain('욕설');
        const [ban] = await query('SELECT reason, is_permanent FROM user_bans WHERE user_id = ?', [target.account.uuid]);
        expect(ban.reason).toBe('욕설');
    });

    test('AD-082: 해제(사유) → 플레이어 바로 다시 로그인, 상세에 해제 사유', async ({ page, browser, accounts }) => {
        const member = await accounts.create();
        await query('INSERT INTO user_bans (user_id, reason, is_permanent, start_at, created_at) VALUES (?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [member.uuid, '도배']);
        await loginAsAdmin(page, await createAdmin());
        await page.goto(`/members/${member.uuid}`);
        await expect(page.getByText('정지 중').first()).toBeVisible();

        await page.getByRole('button', { name: '제재 해제' }).click();
        const dialog = page.getByRole('dialog', { name: '제재 해제' });
        await expect(dialog.getByRole('button', { name: '해제하기' })).toBeDisabled();
        await dialog.getByLabel('해제 사유').fill('이의 신청 받아들임');
        await dialog.getByRole('button', { name: '해제하기' }).click();
        await expect(page.getByText('정지 1건을 풀었어요', { exact: false }).first()).toBeVisible();
        await expect(page.getByRole('table', { name: '정지 기록' })).toContainText('이의 신청 받아들임');

        const context = await browser.newContext({ baseURL: E2E.desktopUrl });
        try {
            await loginViaUi(await context.newPage(), member);
        } finally {
            await context.close();
        }
    });

    test('AD-083: 강제 접속 종료 → 플레이어 끊김 안내, 정지는 아님', async ({ page, players }) => {
        const target = await players.add();
        await loginAsAdmin(page, await createAdmin());
        await page.goto(`/members/${target.account.uuid}`);

        await page.getByRole('button', { name: '강제 접속 종료' }).click();
        const dialog = page.getByRole('dialog', { name: '강제 접속 종료' });
        await dialog.getByLabel(/끊는 사유/).fill('게임 멈춤 신고');
        const notice = await captureAlert(target.page, () => dialog.getByRole('button', { name: '접속 끊기' }).click(), { timeoutMs: 15000 });
        expect(notice).toContain('운영자에 의해 연결이 종료');
        await expect(page.getByText('접속 1곳을 바로 끊었어요', { exact: false }).first()).toBeVisible();
        const bans = await query('SELECT id FROM user_bans WHERE user_id = ?', [target.account.uuid]);
        expect(bans).toHaveLength(0);
        await loginViaUi(target.page, target.account);
    });
});
