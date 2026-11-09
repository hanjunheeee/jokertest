// 모바일 로그인·가입·계정 찾기 화면 (375×812 세로): 칸·버튼·약관(전체 동의·14세)·이메일 인증 가입·비번 재설정 링크, 가로 넘침 없음
const crypto = require('node:crypto');
const { test, expect, ui, mail } = require('../../helpers/fixtures');
const { RUN_ID, EMAIL_DOMAIN } = require('../../helpers/accounts');
const { overflowX } = require('./_talk');

const newEmail = () => `e2e+${RUN_ID}-mo${crypto.randomBytes(5).toString('hex')}${EMAIL_DOMAIN}`;
const newNickname = () => `m${crypto.randomBytes(4).toString('hex')}`.slice(0, 8);
const newPassword = () => `Mo!${crypto.randomBytes(9).toString('base64url')}7z`;

const area = (page) => page.getByRole('region', { name: '회원가입 입력' });
const terms = (page) => page.getByRole('group', { name: '약관 동의' });
const signupButton = (page) => area(page).getByRole('button', { name: '회원가입', exact: true });

async function openSignup(page) {
    await page.goto('/login');
    await page.getByRole('button', { name: '회원가입' }).click();
    await expect(area(page)).toBeVisible();
}

// 이메일 칸 → 인증번호 받기 → 메일 속 번호 → 확인
async function verifyEmail(page, email) {
    await area(page).getByRole('textbox', { name: '이메일을 입력하세요' }).fill(email);
    const since = Date.now() - 1000;
    await page.getByTestId('signup-code-send').click();
    const code = await mail.waitForCode(email, 'SIGNUP_CODE', { since });
    await page.getByRole('textbox', { name: '인증번호를 입력하세요' }).fill(code);
    await page.getByTestId('signup-code-verify').click();
    await expect(page.getByTestId('signup-email-verification-notice')).toHaveText('이메일 인증이 완료되었습니다.');
}

async function fillRest(page, { password, nickname, birthDate = '2000-01-01' }) {
    await area(page).getByRole('textbox', { name: '비밀번호를 입력하세요' }).fill(password);
    await area(page).getByRole('textbox', { name: '비밀번호를 다시 입력하세요' }).fill(password);
    await area(page).getByRole('textbox', { name: /사용할 닉네임을 입력하세요/ }).fill(nickname);
    await area(page).getByRole('textbox', { name: '생일 날짜를 선택해주세요' }).fill(birthDate);
}

test.describe('모바일 로그인 화면', () => {
    test('모바일 로그인 화면은 → 이메일·비번 칸·로그인·소셜·회원가입 버튼이 보이고 가로로 안 넘침', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('textbox', { name: '이메일을 입력하세요' })).toBeVisible();
        await expect(page.getByRole('textbox', { name: '비밀번호를 입력하세요' })).toBeVisible();
        for (const name of ['로그인', 'Google 로그인', 'Discord 로그인', '회원가입']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
        expect(await overflowX(page)).toBeLessThanOrEqual(0);
    });

    test('모바일에서 맞는 계정으로 로그인하면 → 로비로 감', async ({ page, accounts }) => {
        const account = await accounts.create();
        await ui.loginViaUi(page, account);
        await ui.skipIntro(page);
        await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
    });

    test('모바일에서 비번을 틀리면 → 알림이 뜨고 로그인 화면에 그대로 있음', async ({ page, accounts }) => {
        const account = await accounts.create();
        await page.goto('/login');
        await page.getByRole('textbox', { name: '이메일을 입력하세요' }).fill(account.email);
        await page.getByRole('textbox', { name: '비밀번호를 입력하세요' }).fill(`${account.password}x`);
        const message = await ui.captureAlert(page, () => page.getByRole('button', { name: '로그인', exact: true }).click());
        expect(message).toBe('이메일 또는 비밀번호가 일치하지 않습니다.');
        await expect(page).toHaveURL(/\/login$/);
    });

    test('"비밀번호 보기"를 누르면 → 비번 칸 글자가 보이게 바뀜', async ({ page }) => {
        await page.goto('/login');
        const box = page.getByRole('textbox', { name: '비밀번호를 입력하세요' });
        await box.fill('Secret123!');
        await expect(box).toHaveAttribute('type', 'password');
        await page.getByRole('button', { name: '비밀번호 보기' }).click();
        await expect(box).toHaveAttribute('type', 'text');
    });

    test('"아이디 찾기"를 누르면 → 닉네임·생년월일로 찾는 화면으로 감', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('link', { name: '아이디 찾기' }).click();
        await expect(page).toHaveURL(/\/find-id$/);
        await expect(page.getByRole('textbox', { name: '닉네임' })).toBeVisible();
        await expect(page.getByRole('button', { name: '아이디 찾기' })).toBeVisible();
        expect(await overflowX(page)).toBeLessThanOrEqual(0);
    });

    test('"비밀번호 찾기"를 누르면 → 재설정 링크 보내기 화면으로 감', async ({ page }) => {
        await page.goto('/login');
        await page.getByRole('link', { name: '비밀번호 찾기' }).click();
        await expect(page).toHaveURL(/\/password-reset\/request$/);
        await expect(page.getByRole('button', { name: '재설정 링크 보내기' })).toBeVisible();
        expect(await overflowX(page)).toBeLessThanOrEqual(0);
    });

    test('재설정 링크를 받아 모바일에서 열면 → 새 비번을 넣고 바꾼 비번으로 로그인됨', async ({ page, accounts }) => {
        const account = await accounts.create();
        await page.goto('/password-reset/request');
        const since = Date.now() - 1000;
        await page.getByRole('textbox', { name: '이메일' }).fill(account.email);
        await page.getByRole('button', { name: '재설정 링크 보내기' }).click();
        const url = mail.toMobile(await mail.waitForResetUrl(account.email, { since }));
        await page.goto(url);
        const next = newPassword();
        await page.getByPlaceholder('8~64자 비밀번호').fill(next);
        await page.getByPlaceholder('비밀번호를 다시 입력하세요').fill(next);
        await page.getByRole('button', { name: '비밀번호 변경' }).click();
        await expect(page).toHaveURL(/\/login|\/password-reset/, { timeout: 15000 });
        page.on('dialog', (d) => d.accept().catch(() => {}));
        await ui.loginViaUi(page, { ...account, password: next });
    });
});

test.describe('모바일 회원가입', () => {
    test('"회원가입"을 누르면 → 가입 칸·약관 동의(필수 셋)가 보이고 가로로 안 넘침', async ({ page }) => {
        await openSignup(page);
        for (const name of ['전체 동의', '(필수) 개인정보 처리방침 동의', '(필수) 이용약관 동의', '(필수) 만 14세 이상입니다']) {
            await expect(terms(page).getByRole('checkbox', { name })).toBeVisible();
        }
        expect(await overflowX(page)).toBeLessThanOrEqual(0);
    });

    test('이메일 인증 전엔 → 회원가입 버튼이 꺼져 있고 "이메일 인증을 완료해야" 안내가 보임', async ({ page }) => {
        await openSignup(page);
        await expect(signupButton(page)).toBeDisabled();
        await expect(area(page).getByText('이메일 인증을 완료해야 가입할 수 있습니다.')).toBeVisible();
    });

    test('"전체 동의"를 누르면 → 필수 셋이 다 체크되고 다시 누르면 다 풀림', async ({ page }) => {
        await openSignup(page);
        const all = terms(page).getByRole('checkbox', { name: '전체 동의' });
        await all.click();
        for (const name of ['(필수) 개인정보 처리방침 동의', '(필수) 이용약관 동의', '(필수) 만 14세 이상입니다']) {
            await expect(terms(page).getByRole('checkbox', { name })).toHaveAttribute('aria-checked', 'true');
        }
        await all.click();
        await expect(terms(page).getByRole('checkbox', { name: '(필수) 만 14세 이상입니다' })).toHaveAttribute('aria-checked', 'false');
    });

    test('전체 동의 뒤 "만 14세 이상"만 끄면 → 전체 동의도 꺼짐', async ({ page }) => {
        await openSignup(page);
        await terms(page).getByRole('checkbox', { name: '전체 동의' }).click();
        await terms(page).getByRole('checkbox', { name: '(필수) 만 14세 이상입니다' }).click();
        await expect(terms(page).getByRole('checkbox', { name: '전체 동의' })).toHaveAttribute('aria-checked', 'false');
    });

    test('이용약관 "보기"를 누르면 → 약관 글 창이 뜨고 닫을 수 있음', async ({ page }) => {
        await openSignup(page);
        await terms(page).getByRole('button', { name: '보기' }).nth(1).click();
        const dialog = page.getByRole('dialog').last();
        await expect(dialog).toBeVisible();
        const box = await dialog.boundingBox();
        expect(box.x + box.width).toBeLessThanOrEqual(375);
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
    });

    test('이메일 인증·칸·약관을 다 채워 가입하면 → 가입 완료 알림이 뜨고 그 계정으로 로그인됨', async ({ page }) => {
        const email = newEmail();
        const password = newPassword();
        await openSignup(page);
        await verifyEmail(page, email);
        await fillRest(page, { password, nickname: newNickname() });
        await terms(page).getByRole('checkbox', { name: '전체 동의' }).click();
        await expect(signupButton(page)).toBeEnabled();
        const message = await ui.captureAlert(page, () => signupButton(page).click());
        expect(message).toMatch(/가입|완료/);
        await ui.loginViaUi(page, { email, password });
    });

    test('이메일 인증·칸은 다 채웠지만 "만 14세 이상"을 안 누르고 가입하면 → 안내 창이 뜨고 가입 칸에 그대로 있음', async ({ page }) => {
        await openSignup(page);
        await verifyEmail(page, newEmail());
        await fillRest(page, { password: newPassword(), nickname: newNickname() });
        await terms(page).getByRole('checkbox', { name: '(필수) 개인정보 처리방침 동의' }).click();
        await terms(page).getByRole('checkbox', { name: '(필수) 이용약관 동의' }).click();
        await signupButton(page).click();
        // 모바일은 window.alert 대신 양피지 안내 창(alertdialog)
        await expect(page.getByRole('alertdialog')).toBeVisible();
        await expect(area(page)).toBeVisible();
    });

    test('"로그인하기"를 누르면 → 가입 칸이 닫히고 로그인 칸으로 돌아옴', async ({ page }) => {
        await openSignup(page);
        await page.getByRole('button', { name: '로그인하기' }).click();
        await expect(area(page)).toHaveCount(0);
        await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible();
    });
});
