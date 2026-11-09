// 가입 이메일 확인 시험: 중복 확인·인증번호 받기·다시 보내기 쿨타임·틀림·만료·잠김·주소 바꿈
// 메일은 파일 발송기(.runtime/mail)에서 읽음, 만료·쿨타임은 기다리지 않고 DB 시각을 앞당김
const { test, expect, mail } = require('../../helpers/fixtures');
const db = require('../../helpers/db');
const h = require('./authHelpers');

// 그 주소 인증 줄의 시각을 과거로 (만료·다시 보내기 대기 끝내기)
const ageVerification = (email, column, seconds) => db.query(
    `UPDATE signup_email_verifications SET ${column} = DATE_SUB(${column}, INTERVAL ? SECOND) WHERE email = ? AND purpose = 'SIGNUP'`,
    [seconds, email.toLowerCase()],
);

test.describe('가입 이메일 중복 확인', () => {
    test('새 이메일로 중복확인을 누르면 → "사용할 수 있는 이메일입니다"', async ({ page }) => {
        await h.openSignup(page);
        await h.fillSignup(page, { email: h.newEmail() });
        await page.getByRole('button', { name: '이메일 중복확인' }).click();
        await expect(page.getByText('사용할 수 있는 이메일입니다.')).toBeVisible();
    });

    test('이미 가입된 이메일로 중복확인을 누르면 → "이미 사용 중인 이메일입니다"', async ({ page, accounts }) => {
        const account = await accounts.create();
        await h.openSignup(page);
        await h.fillSignup(page, { email: account.email });
        await page.getByRole('button', { name: '이메일 중복확인' }).click();
        await expect(page.getByText('이미 사용 중인 이메일입니다.')).toBeVisible();
    });

    test('중복확인 뒤 이메일을 고치면 → 확인 결과 문구가 사라짐', async ({ page }) => {
        await h.openSignup(page);
        const email = h.newEmail();
        await h.fillSignup(page, { email });
        await page.getByRole('button', { name: '이메일 중복확인' }).click();
        await expect(page.getByText('사용할 수 있는 이메일입니다.')).toBeVisible();
        await h.fillSignup(page, { email: `x${email}` });
        await expect(page.getByText('사용할 수 있는 이메일입니다.')).toHaveCount(0);
    });

    test('이메일 모양이 아닌 글자로 중복확인을 누르면 → 확인 실패 문구', async ({ page }) => {
        await h.openSignup(page);
        await h.fillSignup(page, { email: 'not-an-email' });
        await page.getByRole('button', { name: '이메일 중복확인' }).click();
        await expect(page.getByText('중복 확인에 실패했습니다. 다시 시도해주세요.')).toBeVisible();
    });

    test('이메일을 비운 채 중복확인을 누르면 → 아무 문구도 안 뜨고 요청도 안 감', async ({ page }) => {
        await h.openSignup(page);
        let asked = false;
        page.on('request', (r) => { if (r.url().includes('/auth/check-email') || r.url().includes('check')) asked = true; });
        await page.getByRole('button', { name: '이메일 중복확인' }).click();
        await expect(page.getByText(/사용할 수 있는|이미 사용 중|확인 중|실패했습니다/)).toHaveCount(0);
        expect(asked).toBe(false);
    });
});

test.describe('가입 인증번호', () => {
    test('인증번호 받기를 누르면 → 메일이 오고 번호 칸·남은 시간·재발송 대기 초가 보임', async ({ page }) => {
        const email = h.newEmail();
        await h.openSignup(page);
        await h.fillSignup(page, { email });
        const code = await h.requestCode(page, email);
        expect(code).toMatch(/^\d{6}$/);
        await expect(h.codeBox(page)).toBeVisible();
        await expect(h.verifyNotice(page)).toHaveText(/남은 시간 \d+초/);
        await expect(h.sendCodeButton(page)).toHaveText(/재발송 \(\d+초\)/);
        await expect(h.sendCodeButton(page)).toBeDisabled();
    });

    test('맞는 번호를 넣으면 → 인증 완료 문구가 뜨고 회원가입 버튼이 풀림', async ({ page }) => {
        const email = h.newEmail();
        await h.openSignup(page);
        await expect(h.signupButton(page)).toBeDisabled();
        await h.verifyEmail(page, email);
        await expect(h.sendCodeButton(page)).toHaveCount(0);
        await expect(h.codeBox(page)).toHaveCount(0);
        await expect(h.signupButton(page)).toBeEnabled();
        await expect(page.getByText('이메일 인증을 완료해야 가입할 수 있습니다.')).toHaveCount(0);
    });

    test('틀린 번호를 넣으면 → 남은 시도 4회 문구', async ({ page }) => {
        const email = h.newEmail();
        await h.openSignup(page);
        await h.fillSignup(page, { email });
        const code = await h.requestCode(page, email);
        await h.enterCode(page, code === '000000' ? '111111' : '000000');
        await expect(h.verifyNotice(page)).toHaveText('인증번호가 올바르지 않습니다. (남은 시도 4회)');
        await expect(h.signupButton(page)).toBeDisabled();
    });

    test('틀린 뒤 맞는 번호를 넣으면 → 인증 완료', async ({ page }) => {
        const email = h.newEmail();
        await h.openSignup(page);
        await h.fillSignup(page, { email });
        const code = await h.requestCode(page, email);
        await h.enterCode(page, code === '000000' ? '111111' : '000000');
        await expect(h.verifyNotice(page)).toContainText('올바르지 않습니다');
        await h.enterCode(page, code);
        await expect(h.verifyNotice(page)).toHaveText('이메일 인증이 완료되었습니다.');
    });

    test('5번 틀리면 → 오입력 초과 문구가 뜨고 번호 칸이 잠기며 맞는 번호도 못 넣음', async ({ page }) => {
        const email = h.newEmail();
        await h.openSignup(page);
        await h.fillSignup(page, { email });
        const code = await h.requestCode(page, email);
        const wrong = code === '000000' ? '111111' : '000000';
        for (let i = 4; i >= 1; i -= 1) {
            await h.enterCode(page, wrong);
            await expect(h.verifyNotice(page)).toHaveText(`인증번호가 올바르지 않습니다. (남은 시도 ${i}회)`);
        }
        await h.enterCode(page, wrong);
        await expect(h.verifyNotice(page)).toHaveText('오입력 횟수를 초과했습니다. 다시 받아주세요.');
        await expect(h.codeBox(page)).toBeDisabled();
        await expect(h.verifyButton(page)).toBeDisabled();
    });

    test('숫자 아닌 글자를 넣으면 → 입력을 확인하라는 문구', async ({ page }) => {
        const email = h.newEmail();
        await h.openSignup(page);
        await h.fillSignup(page, { email });
        await h.requestCode(page, email);
        await h.enterCode(page, 'abcdef');
        await expect(h.verifyNotice(page)).toHaveText(/입력을 확인해주세요|올바르지 않습니다/);
        await expect(h.signupButton(page)).toBeDisabled();
    });

    test('번호 칸이 비어 있으면 → 확인 버튼이 잠겨 있음', async ({ page }) => {
        const email = h.newEmail();
        await h.openSignup(page);
        await h.fillSignup(page, { email });
        await h.requestCode(page, email);
        await expect(h.verifyButton(page)).toBeDisabled();
        await h.codeBox(page).fill('1');
        await expect(h.verifyButton(page)).toBeEnabled();
    });

    test('번호가 서버에서 만료된 뒤 넣으면 → 만료 문구가 뜨고 번호 칸이 잠김', async ({ page }) => {
        const email = h.newEmail();
        await h.openSignup(page);
        await h.fillSignup(page, { email });
        const code = await h.requestCode(page, email);
        await ageVerification(email, 'code_expires_at', 3600);
        await h.enterCode(page, code);
        await expect(h.verifyNotice(page)).toHaveText('인증번호가 만료되었습니다. 다시 받아주세요.');
        await expect(h.codeBox(page)).toBeDisabled();
    });

    test('화면 시계로 10분이 지나면 → 서버에 묻지 않고 만료로 바뀜', async ({ page }) => {
        await page.clock.install();
        const email = h.newEmail();
        await h.openSignup(page);
        await h.fillSignup(page, { email });
        await h.requestCode(page, email);
        await page.clock.fastForward('10:01');
        await expect(h.verifyNotice(page)).toHaveText('인증번호가 만료되었습니다. 다시 받아주세요.');
        await expect(h.codeBox(page)).toBeDisabled();
    });

    test('재발송 대기가 끝나면 → 재발송 버튼이 풀리고 새 번호가 오며 옛 번호는 안 먹음', async ({ page }) => {
        await page.clock.install();
        const email = h.newEmail();
        await h.openSignup(page);
        await h.fillSignup(page, { email });
        const oldCode = await h.requestCode(page, email);
        // 화면 대기 60초 넘기기 + 서버 쪽 보낸 시각도 앞당김
        await page.clock.fastForward('01:01');
        await ageVerification(email, 'sent_at', 61);
        await expect(h.sendCodeButton(page)).toHaveText('재발송');
        await expect(h.sendCodeButton(page)).toBeEnabled();
        const since = Date.now() - 500;
        await h.sendCodeButton(page).click();
        const newCode = await mail.waitForCode(email, 'SIGNUP_CODE', { since });
        expect(newCode).not.toBe(oldCode);
        await expect(h.codeBox(page)).toHaveValue('');
        await h.enterCode(page, oldCode);
        await expect(h.verifyNotice(page)).toContainText('올바르지 않습니다');
        await h.enterCode(page, newCode);
        await expect(h.verifyNotice(page)).toHaveText('이메일 인증이 완료되었습니다.');
    });

    test('화면 대기는 끝났지만 서버 대기가 남았으면 → "N초 후 재발송할 수 있습니다" 문구', async ({ page }) => {
        await page.clock.install();
        const email = h.newEmail();
        await h.openSignup(page);
        await h.fillSignup(page, { email });
        await h.requestCode(page, email);
        await page.clock.fastForward('01:01');
        await expect(h.sendCodeButton(page)).toBeEnabled();
        await h.sendCodeButton(page).click();
        await expect(h.verifyNotice(page)).toHaveText(/^\d+초 후 재발송할 수 있습니다\.$/);
    });

    test('잠긴 뒤 재발송으로 새 번호를 받으면 → 다시 인증할 수 있음', async ({ page }) => {
        await page.clock.install();
        const email = h.newEmail();
        await h.openSignup(page);
        await h.fillSignup(page, { email });
        const code = await h.requestCode(page, email);
        const wrong = code === '000000' ? '111111' : '000000';
        for (let i = 0; i < 5; i += 1) await h.enterCode(page, wrong);
        await expect(h.verifyNotice(page)).toHaveText('오입력 횟수를 초과했습니다. 다시 받아주세요.');
        await page.clock.fastForward('01:01');
        await ageVerification(email, 'sent_at', 61);
        const since = Date.now() - 500;
        await h.sendCodeButton(page).click();
        const fresh = await mail.waitForCode(email, 'SIGNUP_CODE', { since });
        await expect(h.codeBox(page)).toBeEnabled();
        await h.enterCode(page, fresh);
        await expect(h.verifyNotice(page)).toHaveText('이메일 인증이 완료되었습니다.');
    });

    test('이메일 모양이 틀리면 → 인증번호 받기를 눌러도 요청이 안 감', async ({ page }) => {
        await h.openSignup(page);
        await h.fillSignup(page, { email: 'bad@nodot' });
        let asked = false;
        page.on('request', (r) => { if (/signup.*code|email-verification/i.test(r.url())) asked = true; });
        await h.sendCodeButton(page).click();
        await expect(h.sendCodeButton(page)).toHaveText('인증번호 받기');
        await expect(h.codeBox(page)).toHaveCount(0);
        expect(asked).toBe(false);
    });

    test('이미 가입된 이메일로 인증번호를 받으면 → 화면은 똑같이 보냈다고 하지만 메일은 안 감', async ({ page, accounts }) => {
        const account = await accounts.create();
        await h.openSignup(page);
        await h.fillSignup(page, { email: account.email });
        await h.sendCodeButton(page).click();
        await expect(h.sendCodeButton(page)).toHaveText(/재발송/);
        await expect(h.codeBox(page)).toBeVisible();
        await expect.poll(() => mail.readMails(account.email).filter((m) => m.template === 'SIGNUP_CODE').length, { timeout: 2500 }).toBe(0);
    });

    test('인증 끝낸 뒤 이메일을 고치면 → 인증이 풀려 다시 받아야 하고 가입 버튼이 잠김', async ({ page }) => {
        const email = h.newEmail();
        await h.openSignup(page);
        await h.verifyEmail(page, email);
        await h.fillSignup(page, { email: h.newEmail() });
        await expect(h.sendCodeButton(page)).toHaveText('인증번호 받기');
        await expect(h.signupButton(page)).toBeDisabled();
        await expect(page.getByText('이메일 인증을 완료해야 가입할 수 있습니다.')).toBeVisible();
    });
});
