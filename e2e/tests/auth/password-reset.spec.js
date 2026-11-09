// 비번 재설정 시험: 요청 화면 문구·입력 규칙·다시 보내기, 메일 링크로 새 비번, 만료·사용됨·잘못된 링크, 바꾼 뒤 로그인·옛 세션
const { test, expect, mail, ui, E2E } = require('../../helpers/fixtures');
const db = require('../../helpers/db');
const h = require('./authHelpers');

const SENT = /재설정 요청을 접수했어요/;
const emailBox = (page) => page.getByRole('textbox', { name: '가입할 때 등록한 이메일을 입력하세요' });
const sendButton = (page) => page.getByRole('button', { name: '재설정 링크 보내기' });
const newPw = (page) => page.getByRole('textbox', { name: '8~64자 비밀번호' });
const newPwConfirm = (page) => page.getByRole('textbox', { name: '비밀번호를 다시 입력하세요' });
const changeButton = (page) => page.getByRole('button', { name: '비밀번호 변경' });

async function requestReset(page, email) {
    await page.goto('/password-reset/request');
    await emailBox(page).fill(email);
    await sendButton(page).click();
}

// 요청 → 메일 링크
async function resetLink(page, email) {
    const since = Date.now() - 500;
    await requestReset(page, email);
    await expect(page.getByRole('status')).toHaveText(SENT);
    return mail.waitForResetUrl(email, { since });
}

async function setNewPassword(page, url, password, confirm = password) {
    await page.goto(url);
    await newPw(page).fill(password);
    await newPwConfirm(page).fill(confirm);
    await changeButton(page).click();
}

test.describe('비번 재설정 요청', () => {
    test('가입된 이메일로 요청하면 → 접수 안내가 뜨고 링크 메일이 옴', async ({ page, accounts }) => {
        const account = await accounts.create();
        const url = await resetLink(page, account.email);
        expect(url).toMatch(/\/password-reset\?token=/);
        await expect(page.getByRole('button', { name: '다시 보내기' })).toBeVisible();
    });

    test('가입 안 된 이메일로 요청해도 → 같은 접수 안내 (메일은 안 감)', async ({ page }) => {
        const email = h.newEmail('nr');
        await requestReset(page, email);
        await expect(page.getByRole('status')).toHaveText(SENT);
        await expect.poll(() => mail.readMails(email).length, { timeout: 2500 }).toBe(0);
    });

    test('이메일을 비우고 보내면 → "이메일을 입력해주세요" 알림', async ({ page }) => {
        await requestReset(page, '');
        await expect(page.getByRole('alert')).toHaveText('이메일을 입력해주세요.');
    });

    test('@ 뒤 도메인에 점이 없으면 → 형식이 올바르지 않다는 알림', async ({ page }) => {
        await requestReset(page, 'someone@localhost');
        await expect(page.getByRole('alert')).toHaveText('이메일 형식이 올바르지 않습니다.');
    });

    test('다시 보내기를 누르면 → 새 메일이 오고 먼저 받은 링크는 못 씀', async ({ page, accounts }) => {
        const account = await accounts.create();
        const first = await resetLink(page, account.email);
        const since = Date.now() + 1;
        await page.getByRole('button', { name: '다시 보내기' }).click();
        const second = await mail.waitForResetUrl(account.email, { since });
        expect(second).not.toBe(first);
        await page.goto(first);
        await expect(page.getByRole('alert')).toHaveText(/유효하지 않은 링크예요|이미 사용된 링크/);
    });

    test('뒤로 가기를 누르면 → 로그인 화면으로', async ({ page }) => {
        await page.goto('/password-reset/request');
        await page.getByRole('button', { name: '뒤로 가기' }).click();
        await expect(page).toHaveURL(/\/login$/);
    });
});

test.describe('비번 재설정 링크', () => {
    test('비번 재설정 링크를 요청하면 → 메일이 오고 링크를 열면 새 비번 입력 화면이 보임', async ({ page, accounts }) => {
        const account = await accounts.create();
        const since = Date.now();
        await page.goto('/password-reset/request');
        await page.getByRole('textbox', { name: '가입할 때 등록한 이메일을 입력하세요' }).fill(account.email);
        await page.getByRole('button', { name: '재설정 링크 보내기' }).click();
        const resetUrl = await mail.waitForResetUrl(account.email, { since });
        expect(resetUrl).toContain('/password-reset');
        await page.goto(resetUrl);
        await expect(page.locator('input[type="password"]').first()).toBeVisible();
        await expect(page.getByText('새 비밀번호를 입력해주세요')).toBeVisible();
    });

    test('새 비번을 넣고 바꾸면 → 완료 안내 → 로그인으로 이동, 새 비번은 되고 옛 비번은 안 됨', async ({ page, accounts }) => {
        const account = await accounts.create();
        const url = await resetLink(page, account.email);
        const fresh = h.newPassword();
        await setNewPassword(page, url, fresh);
        await expect(page.getByRole('status')).toHaveText('비밀번호가 재설정되었어요. 새 비밀번호로 다시 로그인해주세요.');
        await page.getByRole('button', { name: '로그인으로 이동' }).click();
        await expect(page).toHaveURL(/\/login$/);
        expect(await h.loginAlert(page, account.email, account.password)).toBe('이메일 또는 비밀번호가 일치하지 않습니다.');
        await h.fillLogin(page, account.email, fresh);
        await h.loginButton(page).click();
        await expect(page).toHaveURL(/\/lobby$/);
    });

    test('새 비번이 8자보다 짧으면 → 칸 아래 8~64자 알림, 비번은 그대로', async ({ page, accounts }) => {
        const account = await accounts.create();
        const url = await resetLink(page, account.email);
        await setNewPassword(page, url, 'short1');
        await expect(page.getByRole('alert')).toHaveText('비밀번호는 8~64자여야 합니다.');
        const [row] = await db.query('SELECT used FROM password_reset_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 1', [account.uuid]);
        expect(Boolean(Number(row.used))).toBe(false);
    });

    test('새 비번 확인이 다르면 → 일치하지 않는다는 알림', async ({ page, accounts }) => {
        const account = await accounts.create();
        const url = await resetLink(page, account.email);
        await setNewPassword(page, url, 'NewPass!1234', 'NewPass!1235');
        await expect(page.getByRole('alert')).toHaveText('비밀번호 확인이 일치하지 않습니다.');
    });

    test('이미 쓴 링크를 다시 열면 → "이미 사용된 링크예요" 안내', async ({ page, accounts }) => {
        const account = await accounts.create();
        const url = await resetLink(page, account.email);
        await setNewPassword(page, url, h.newPassword());
        await expect(page.getByRole('status')).toContainText('재설정되었어요');
        await page.goto(url);
        await expect(page.getByRole('alert')).toHaveText('이미 사용된 링크예요. 비밀번호가 이미 재설정되었다면 새 비밀번호로 로그인해주세요.');
    });

    test('만료된 링크를 열면 → 만료 안내, 다시 요청하기를 누르면 요청 화면으로', async ({ page, accounts }) => {
        const account = await accounts.create();
        const url = await resetLink(page, account.email);
        await db.query('UPDATE password_reset_tokens SET expired_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?', [account.uuid]);
        await page.goto(url);
        await expect(page.getByRole('alert')).toHaveText('링크가 만료됐어요. 비밀번호 재설정을 다시 요청해주세요.');
        await page.getByRole('button', { name: '다시 요청하기' }).click();
        await expect(page).toHaveURL(/\/password-reset\/request$/);
    });

    test('링크를 열어 둔 사이 만료되면 → 바꾸기를 눌렀을 때 만료 안내', async ({ page, accounts }) => {
        const account = await accounts.create();
        const url = await resetLink(page, account.email);
        await page.goto(url);
        await expect(newPw(page)).toBeVisible();
        await db.query('UPDATE password_reset_tokens SET expired_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?', [account.uuid]);
        await newPw(page).fill('NewPass!1234');
        await newPwConfirm(page).fill('NewPass!1234');
        await changeButton(page).click();
        await expect(page.getByRole('alert')).toHaveText('링크가 만료됐어요. 비밀번호 재설정을 다시 요청해주세요.');
    });

    test('token 없이 재설정 주소를 열면 → 유효하지 않은 링크 안내', async ({ page }) => {
        await page.goto('/password-reset');
        await expect(page.getByRole('alert')).toHaveText('유효하지 않은 링크예요. 이메일에 있는 링크 주소를 다시 확인해주세요.');
    });

    test('아무 글자 token으로 열면 → 유효하지 않은 링크 안내', async ({ page }) => {
        await page.goto('/password-reset?token=not-a-real-token-1234567890');
        await expect(page.getByRole('alert')).toHaveText('유효하지 않은 링크예요. 이메일에 있는 링크 주소를 다시 확인해주세요.');
    });

    test('소셜로만 가입한 계정이 바꾸면 → 소셜 로그인으로 들어오라는 안내', async ({ page, accounts }) => {
        const account = await accounts.create();
        const url = await resetLink(page, account.email);
        await db.query('UPDATE users SET has_local_password = 0 WHERE uuid = ?', [account.uuid]);
        await setNewPassword(page, url, 'NewPass!1234');
        await expect(page.getByRole('alert')).toHaveText('소셜 로그인으로 가입한 계정이에요. 소셜 로그인 버튼으로 로그인해주세요.');
    });

    test('비번을 바꾸면 → 다른 브라우저에 로그인해 있던 세션이 끊겨 로그인 화면으로', async ({ page, accounts, players }) => {
        const account = await accounts.create();
        const other = await players.add({ account });
        const url = await resetLink(page, account.email);
        await setNewPassword(page, url, h.newPassword());
        await expect(page.getByRole('status')).toContainText('재설정되었어요');
        const me = await other.context.request.get(`${E2E.apiUrl}/auth/me`, { headers: { origin: E2E.desktopUrl } });
        expect(me.status()).toBe(401);
        await other.page.goto('/store');
        await expect(other.page).toHaveURL(/\/login$/);
        void ui;
    });
});
