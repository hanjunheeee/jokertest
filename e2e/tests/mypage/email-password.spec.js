// 계정 관리 이메일 바꾸기(번호 받기·확인·옛 주소 알림 메일)와 비밀번호 바꾸기(다시 로그인 안내 → 로그인 화면)
const crypto = require('node:crypto');
const { test, expect, ui, mail } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { gotoAccount, section } = require('./account-tools');

const freshEmail = () => `e2e+${process.env.E2E_RUN_ID || 'local'}-chg${crypto.randomBytes(3).toString('hex')}@example.test`;

// 새 이메일·현재 비번 넣고 번호 받기 → 칸
async function requestCode(page, newEmail, password) {
    const box = section(page, '이메일 변경');
    await box.getByRole('textbox', { name: '새 이메일' }).fill(newEmail);
    await box.getByRole('textbox', { name: '현재 비밀번호' }).fill(password);
    await box.getByRole('button', { name: '번호 받기' }).click();
    return box;
}

test.describe('이메일 바꾸기', () => {
    test('새 이메일 없이 번호 받기를 누르면 → "새 이메일을 입력해주세요." 안내', async ({ user }) => {
        const { page } = user;
        await gotoAccount(page);
        const box = section(page, '이메일 변경');
        await box.getByRole('button', { name: '번호 받기' }).click();
        await expect(box.getByText('새 이메일을 입력해주세요.')).toBeVisible();
    });

    test('현재 비밀번호를 틀리고 번호 받기를 누르면 → 오류 안내, 번호 칸이 안 나옴', async ({ user }) => {
        const { page } = user;
        await gotoAccount(page);
        const box = await requestCode(page, freshEmail(), 'Wrong!pass123');
        await expect(box.getByText(/비밀번호/).last()).toBeVisible();
        await expect(box.getByRole('textbox', { name: '새 이메일로 받은 인증번호' })).toHaveCount(0);
    });

    test('남이 쓰는 이메일로 번호 받기를 누르면 → 거절 안내', async ({ user, accounts }) => {
        const { page, account } = user;
        const other = await accounts.create();
        await gotoAccount(page);
        const box = await requestCode(page, other.email, account.password);
        await expect(box.getByRole('textbox', { name: '새 이메일로 받은 인증번호' })).toHaveCount(0);
        await expect(box.getByText(/이미|사용/).last()).toBeVisible();
    });

    test('맞게 번호를 받으면 → 보냈다는 안내와 번호 칸, 새 주소로 번호 메일이 옴', async ({ user }) => {
        const { page, account } = user;
        const target = freshEmail();
        await gotoAccount(page);
        const box = await requestCode(page, target, account.password);
        await expect(box.getByText(/인증번호를 보냈습니다\. \d+분 안에 입력해주세요\./)).toBeVisible();
        await expect(box.getByRole('textbox', { name: '새 이메일로 받은 인증번호' })).toBeVisible();
        await expect(box.getByRole('button', { name: '인증번호 다시 받기' })).toBeVisible();
        expect(await mail.waitForCode(target, 'EMAIL_CHANGE_CODE')).toMatch(/^\d{4,10}$/);
    });

    test('틀린 번호로 확인하면 → 인증 실패 안내(남은 횟수), 이메일 그대로', async ({ user }) => {
        const { page, account } = user;
        const target = freshEmail();
        await gotoAccount(page);
        const box = await requestCode(page, target, account.password);
        const code = await mail.waitForCode(target, 'EMAIL_CHANGE_CODE');
        const wrong = code === '000000' ? '111111' : '000000';
        await box.getByRole('textbox', { name: '새 이메일로 받은 인증번호' }).fill(wrong);
        await box.getByRole('button', { name: '확인' }).click();
        await expect(box.getByText(/남은 횟수/)).toBeVisible();
        const [row] = await query('SELECT email FROM users WHERE uuid = ?', [account.uuid]);
        expect(row.email).toBe(account.email);
    });

    test('받은 번호로 확인하면 → 변경 안내·지금 이메일이 바뀌고 옛 주소로 바뀜 알림 메일이 옴', async ({ user }) => {
        const { page, account } = user;
        const target = freshEmail();
        await gotoAccount(page);
        const box = await requestCode(page, target, account.password);
        const code = await mail.waitForCode(target, 'EMAIL_CHANGE_CODE');
        await box.getByRole('textbox', { name: '새 이메일로 받은 인증번호' }).fill(code);
        await box.getByRole('button', { name: '확인' }).click();
        await expect(box.getByText('이메일이 변경되었습니다.')).toBeVisible();
        await expect(page.getByText(`지금 이메일: ${target}`)).toBeVisible();
        const notice = await mail.waitForMail(account.email, { template: 'EMAIL_CHANGED' });
        expect(notice.to.toLowerCase()).toBe(account.email.toLowerCase());
    });

    test('이메일을 바꾼 뒤 → 새 이메일로는 로그인되고 옛 이메일로는 안 됨', async ({ user, browser }) => {
        const { page, account } = user;
        const target = freshEmail();
        await gotoAccount(page);
        const box = await requestCode(page, target, account.password);
        const code = await mail.waitForCode(target, 'EMAIL_CHANGE_CODE');
        await box.getByRole('textbox', { name: '새 이메일로 받은 인증번호' }).fill(code);
        await box.getByRole('button', { name: '확인' }).click();
        await expect(box.getByText('이메일이 변경되었습니다.')).toBeVisible();
        const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
        try {
            const p = await ctx.newPage();
            await p.goto('/login');
            await p.getByPlaceholder('이메일을 입력하세요').fill(account.email);
            await p.getByPlaceholder('비밀번호를 입력하세요').fill(account.password);
            await ui.captureAlert(p, () => p.getByRole('button', { name: '로그인', exact: true }).click());
            await expect(p).toHaveURL(/\/login/);
            await ui.loginViaUi(p, { email: target, password: account.password });
        } finally {
            await ctx.close();
        }
    });
});

test.describe('비밀번호 바꾸기', () => {
    const fill = async (page, current, next) => {
        const box = section(page, '비밀번호 변경');
        await box.getByRole('textbox', { name: '현재 비밀번호' }).fill(current);
        await box.getByRole('textbox', { name: '새 비밀번호' }).fill(next);
        await box.getByRole('button', { name: '변경' }).click();
        return box;
    };

    test('현재 비밀번호를 틀리면 → 오류 안내가 뜨고 로그인 화면으로 안 튕김', async ({ user }) => {
        const { page } = user;
        await gotoAccount(page);
        const box = await fill(page, 'Wrong!pass123', 'New!pass12345');
        await expect(box.getByText(/비밀번호/).last()).toBeVisible();
        await expect(page).toHaveURL(/\/account/);
    });

    test('새 비밀번호가 규칙에 안 맞으면(짧음) → 규칙 안내, 비번 그대로', async ({ user }) => {
        const { page, account } = user;
        await gotoAccount(page);
        const box = await fill(page, account.password, 'abc');
        await expect(box.getByText('비밀번호가 변경되었습니다. 다시 로그인해 주세요.')).toHaveCount(0);
        await expect(box.locator('p').last()).not.toBeEmpty();
        await expect(page).toHaveURL(/\/account/);
    });

    test('맞게 바꾸면 → 다시 로그인 안내 뒤 로그인 화면으로 가고 새 비번으로 로그인됨', async ({ user }) => {
        const { page, account } = user;
        const next = `New!${crypto.randomBytes(6).toString('hex')}9a`;
        await gotoAccount(page);
        const box = await fill(page, account.password, next);
        await expect(box.getByText('비밀번호가 변경되었습니다. 다시 로그인해 주세요.')).toBeVisible();
        await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
        await ui.loginViaUi(page, { email: account.email, password: next });
    });

});
