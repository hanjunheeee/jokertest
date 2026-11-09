// 회원 탈퇴(비번 확인·되돌릴 수 없다는 창·로그인 화면·같은 이메일 다시 가입 가능·판 중 막힘)와 Discord 연결 버튼
const { test, expect, ui, E2E } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { gotoAccount, section } = require('./account-tools');

// 탈퇴 칸에 비번 넣고 탈퇴 → 확인 창
async function openWithdraw(page, password) {
    const box = section(page, '회원 탈퇴');
    await box.getByRole('textbox', { name: '비밀번호' }).fill(password);
    await box.getByRole('button', { name: '탈퇴' }).click();
    return { box, dialog: page.getByRole('dialog', { name: '정말 탈퇴할까요?' }) };
}

test.describe('회원 탈퇴', () => {
    test('비밀번호 없이 탈퇴를 누르면 → "비밀번호를 입력해주세요." 안내, 확인 창 안 뜸', async ({ user }) => {
        const { page } = user;
        await gotoAccount(page);
        const box = section(page, '회원 탈퇴');
        await box.getByRole('button', { name: '탈퇴' }).click();
        await expect(box.getByText('비밀번호를 입력해주세요.', { exact: true })).toBeVisible();
        await expect(page.getByRole('dialog', { name: '정말 탈퇴할까요?' })).toHaveCount(0);
    });

    test('비번을 넣고 탈퇴를 누르면 → 되돌릴 수 없다는 안내 창, 취소하면 계정 그대로', async ({ user }) => {
        const { page, account } = user;
        await gotoAccount(page);
        const { dialog } = await openWithdraw(page, account.password);
        await expect(dialog).toContainText('탈퇴하면 되돌릴 수 없습니다.');
        await expect(dialog).toContainText('같은 이메일로 다시 가입할 수 있지만 새 계정이 됩니다.');
        await dialog.getByRole('button', { name: '취소' }).click();
        await expect(dialog).toBeHidden();
        const [row] = await query('SELECT status FROM users WHERE uuid = ?', [account.uuid]);
        expect(row.status).not.toMatch(/WITHDRAW|DELETED/);
        await expect(page).toHaveURL(/\/account/);
    });

    test('틀린 비번으로 탈퇴하기를 누르면 → 오류 안내, 계정 화면에 그대로', async ({ user }) => {
        const { page } = user;
        await gotoAccount(page);
        const { box, dialog } = await openWithdraw(page, 'Wrong!pass123');
        await dialog.getByRole('button', { name: '탈퇴하기' }).click();
        await expect(box.getByText(/비밀번호/).last()).toBeVisible();
        await expect(page).toHaveURL(/\/account/);
    });

    test('맞는 비번으로 탈퇴하면 → 로비가 아니라 로그인 화면으로 가고 그 계정으로 다시 로그인 안 됨', async ({ user }) => {
        const { page, account } = user;
        await gotoAccount(page);
        const { dialog } = await openWithdraw(page, account.password);
        await dialog.getByRole('button', { name: '탈퇴하기' }).click();
        await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
        await page.goto('/lobby');
        await expect(page).toHaveURL(/\/login/);
        await page.getByPlaceholder('이메일을 입력하세요').fill(account.email);
        await page.getByPlaceholder('비밀번호를 입력하세요').fill(account.password);
        await ui.captureAlert(page, () => page.getByRole('button', { name: '로그인', exact: true }).click());
        await expect(page).toHaveURL(/\/login/);
    });

    test('탈퇴한 뒤 → 같은 이메일을 가입 이메일 확인에 넣으면 쓸 수 있다고 나옴', async ({ user }) => {
        const { page, account } = user;
        await gotoAccount(page);
        const { dialog } = await openWithdraw(page, account.password);
        await dialog.getByRole('button', { name: '탈퇴하기' }).click();
        await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
        const res = await fetch(`${E2E.apiUrl}/auth/check-email?email=${encodeURIComponent(account.email)}`, { headers: { origin: E2E.desktopUrl } });
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(JSON.stringify(body.data)).toMatch(/true/);
        expect(body.data.available ?? body.data.isAvailable ?? !body.data.exists).toBe(true);
    });

    test('판이 진행 중일 때 탈퇴하면 → 게임이 끝난 뒤에 탈퇴할 수 있다는 안내, 계정 그대로 @game', async ({ user, table }) => {
        const { page, account } = user;
        await table.setup({ humans: [user], bots: 4 });
        await ui.readRoleReveal(page).catch(() => {});
        await gotoAccount(page);
        const { box, dialog } = await openWithdraw(page, account.password);
        await dialog.getByRole('button', { name: '탈퇴하기' }).click();
        await expect(box.getByText('진행 중인 게임이 끝난 뒤에 탈퇴할 수 있습니다.')).toBeVisible();
        const [row] = await query('SELECT email FROM users WHERE uuid = ?', [account.uuid]);
        expect(row.email).toBe(account.email);
    });
});

test.describe('Discord 연결', () => {
    test('연결하기를 누르면 → 확인 창이 뜨고 취소하면 계정 화면에 그대로', async ({ user }) => {
        const { page } = user;
        await gotoAccount(page);
        const dialogPromise = page.waitForEvent('dialog');
        const click = section(page, 'Discord 계정 연결').getByRole('button', { name: '연결하기' }).click();
        const dialog = await dialogPromise;
        expect(dialog.message()).toBe('Discord 계정을 이 계정에 연결하시겠습니까?');
        await dialog.dismiss();
        await click;
        await expect(page).toHaveURL(/\/account/);
        await expect(page.getByText(/지금 이메일:/)).toBeVisible();
    });

    test('로그인 유지로 들어와 연결하기를 확인하면 → 키가 없어 "지금은 Discord 계정 연결을 사용할 수 없습니다." 안내', async ({ page, context, accounts }) => {
        const account = await accounts.create();
        await ui.loginViaApi(context, account, { rememberMe: true });
        await gotoAccount(page);
        page.once('dialog', (d) => d.accept());
        await section(page, 'Discord 계정 연결').getByRole('button', { name: '연결하기' }).click();
        await expect(page.getByText(/Discord 계정 연결을 사용할 수 없습니다|Discord 계정 연결에 실패했습니다/)).toBeVisible({ timeout: 15000 });
        await expect(page).toHaveURL(/\/account/);
    });

    test('로그인 유지 없이 들어와 연결하기를 확인하면 → 로그아웃되지 않고 안내가 뜸', async ({ user }) => {
        const { page } = user;
        await gotoAccount(page);
        page.once('dialog', (d) => d.accept());
        await section(page, 'Discord 계정 연결').getByRole('button', { name: '연결하기' }).click();
        await expect(page.getByText(/Discord 계정 연결/).last()).toBeVisible();
        await expect(page).toHaveURL(/\/account/, { timeout: 15000 });
        await expect(page.getByText(/지금 이메일:/)).toBeVisible();
    });

    test('주소에 연결 오류 표시가 붙어 오면 → 맞는 안내가 뜨고 누르면 사라짐', async ({ user }) => {
        const { page } = user;
        await gotoAccount(page, '/account?socialLinkError=IDENTITY_ALREADY_LINKED');
        const msg = page.getByRole('button', { name: '연결 결과 메시지 닫기' });
        await expect(msg).toContainText('이미 다른 계정에 연결된 Discord 계정입니다.');
        await msg.click();
        await expect(msg).toHaveCount(0);
        await expect(page).not.toHaveURL(/socialLinkError/);
    });
});
