'use strict';

// 가입 이메일 인증번호 브라우저 시험 (PC) — 받기·틀린 번호·만료·다시 받기·다시 보내기 60초(진짜 시간)·인증 뒤 주소 바꿈·인증 칸 글이 보이는지
// 목록 A11a-가입-로그인-세션.md 번호 A11-E-022~032
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const mail = require('../../helpers/mail');
const { E2E } = require('../../helpers/env');
const K = require('./_a11a-kit');

const WRONG = '인증번호가 올바르지 않습니다.';
// 진짜 번호와 다른 6자리
const wrongOf = (code) => (code === '000000' ? '111111' : '000000');

// 가입 칸 열고 새 주소로 인증번호 받기 → { email, code }
async function codeSent(page) {
    const email = K.newEmail('ec');
    await K.openSignup(page);
    await K.fillSignup(page, { email });
    const code = await K.requestCode(page, email);
    return { email, code };
}

test('A11-E-022 인증번호 받기 (PC): 단추 "재발송 (60초)"·꺼짐, "남은 시간 …초" 줄, 메일함에 번호 메일 1통 @smoke', async ({ page }) => {
    const email = K.newEmail('ec');
    await K.openSignup(page);
    await K.fillSignup(page, { email });
    await K.codeSend(page).click();
    await expect(K.codeSend(page)).toHaveText('재발송 (60초)');
    await expect(K.codeSend(page)).toBeDisabled();
    await expect(K.codeNotice(page)).toHaveText(/^남은 시간 \d+초$/);
    await mail.waitForMail(email, { template: 'SIGNUP_CODE' });
    expect(mail.readMails(email).filter((m) => m.template === 'SIGNUP_CODE')).toHaveLength(1);
});

test('A11-E-023 틀린 번호 (PC): 틀린 번호 확인 → "인증번호가 올바르지 않습니다." + 남은 4번', async ({ page }) => {
    const { code } = await codeSent(page);
    await K.enterCode(page, wrongOf(code));
    await expect(K.codeNotice(page)).toContainText(WRONG);
    await expect(K.codeNotice(page)).toContainText('4회');
});

test('A11-E-024 틀린 번호 (PC): 5번 틀림 → "오입력 횟수를 초과했습니다. 다시 받아주세요." + 확인 단추 꺼짐', async ({ page }) => {
    const { code } = await codeSent(page);
    // 앞 4번은 남은 횟수가 하나씩 줄어드는 것까지 보고 다음으로 (확인 중에 또 누르지 않게)
    for (let i = 1; i <= 4; i += 1) {
        await K.enterCode(page, wrongOf(code));
        await expect(K.codeNotice(page)).toContainText(`${5 - i}회`);
    }
    await K.enterCode(page, wrongOf(code));
    await expect(K.codeNotice(page)).toHaveText('오입력 횟수를 초과했습니다. 다시 받아주세요.');
    await expect(K.codeVerify(page)).toBeDisabled();
});

test('A11-E-025 번호 만료 (PC): 받은 뒤 DB 끝 시각을 지난 시각으로 → 맞는 번호 → "인증번호가 만료되었습니다. 다시 받아주세요."', async ({ page }) => {
    const { email, code } = await codeSent(page);
    await K.expireSignupCode(email);
    await K.enterCode(page, code);
    await expect(K.codeNotice(page)).toHaveText('인증번호가 만료되었습니다. 다시 받아주세요.');
});

test('A11-E-026 다시 받은 뒤 옛 번호 (PC): 대기 끝(보낸 시각 61초 앞으로) → 다시 받기 → 첫 번호 틀림 / 새 번호 완료', async ({ page }) => {
    // 화면도 60초를 세서 화면 시계만 앞으로 돌림 (60초 규칙은 E-027이 진짜 시간으로 봄)
    await page.clock.install();
    const { email, code: first } = await codeSent(page);
    await K.shiftSignupSentAt(email, 61);
    await page.clock.fastForward(61_000);
    await expect(K.codeSend(page)).toHaveText('재발송');
    await expect(K.codeSend(page)).toBeEnabled();
    const second = await K.requestCode(page, email);
    expect(second).not.toBe(first);
    await K.enterCode(page, first);
    await expect(K.codeNotice(page)).toContainText(WRONG);
    await K.enterCode(page, second);
    await expect(K.codeNotice(page)).toHaveText('이메일 인증이 완료되었습니다.');
});

test('A11-E-027 다시 보내기 60초 진짜로: 59초엔 단추 꺼짐 → 60초(±1.5초) 지나 "재발송" 켜짐 @realtime', async ({ page }) => {
    test.setTimeout(150_000);
    const email = K.newEmail('ec');
    await K.openSignup(page);
    await K.fillSignup(page, { email });
    const sent = page.waitForResponse((r) => r.url() === `${E2E.apiUrl}/auth/signup/email-code` && r.request().method() === 'POST');
    await K.codeSend(page).click();
    await sent;
    // 서버 답이 온 때부터 셈 (화면은 답 받은 때 + 60초에 켬)
    const startedAt = Date.now();
    await expect(K.codeSend(page)).toHaveText('재발송 (60초)');
    // 진짜 시간 규칙이라 고정으로 기다림
    await page.waitForTimeout(59_000 - (Date.now() - startedAt));
    await expect(K.codeSend(page)).toBeDisabled();
    await expect(K.codeSend(page)).toBeEnabled({ timeout: 5_000 });
    await expect(K.codeSend(page)).toHaveText('재발송');
    const elapsed = Date.now() - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(58_500);
    expect(elapsed).toBeLessThanOrEqual(61_500);
});

test('A11-E-028 인증 뒤 이메일 바꿈 (PC): 완료 글 사라짐·"인증번호 받기" → 가입 단추 다시 꺼짐 + 안내 줄, 가입 요청 0번', async ({ page }) => {
    const signupCalls = K.trackRequests(page, '/auth/signup');
    const v = await K.prepareSignup(page);
    await expect(K.codeNotice(page)).toHaveText('이메일 인증이 완료되었습니다.');
    // 주소 한 글자 바꿈 (맨 앞 e → f)
    await K.fillSignup(page, { email: `f${v.email.slice(1)}` });
    await expect(K.codeNotice(page)).toHaveCount(0);
    await expect(K.codeSend(page)).toHaveText('인증번호 받기');
    // 출처(F-31 2-3a): 인증이 풀리면 가입 단추 다시 꺼짐 + 안내 줄
    await expect(K.signupSubmit(page)).toBeDisabled();
    await expectReadable(K.signupHint(page));
    // 꺼진 단추는 못 누르고 Enter 제출도 브라우저가 막음 → 알림 없이 그대로
    await K.nicknameBox(K.signupArea(page)).press('Enter');
    await expect(K.signupSubmit(page)).toBeDisabled();
    expect(signupCalls).toHaveLength(0);
});

test('A11-E-029 이미 가입한 이메일로 인증번호 (PC): 화면은 처음 주소와 같음("재발송 (60초)"), 메일함 0통', async ({ page, accounts }) => {
    const taken = await accounts.create();
    await K.openSignup(page);
    await K.fillSignup(page, { email: taken.email });
    const sent = page.waitForResponse((r) => r.url() === `${E2E.apiUrl}/auth/signup/email-code` && r.request().method() === 'POST');
    await K.codeSend(page).click();
    expect((await sent).status()).toBe(200);
    await expect(K.codeSend(page)).toHaveText('재발송 (60초)');
    await expect(K.codeNotice(page)).toHaveText(/^남은 시간 \d+초$/);
    // 서버는 메일을 보낸 뒤 답함 → 답이 온 뒤 0통이면 안 보낸 것
    expect(mail.readMails(taken.email)).toHaveLength(0);
});

test('A11-E-030 인증 칸 글이 보임 (PC): 완료 "이메일 인증이 완료되었습니다." → 읽힘', async ({ page }) => {
    await K.openSignup(page);
    await K.verifyEmail(page, K.newEmail('ec'));
    await expectReadable(K.codeNotice(page));
});

test('A11-E-031 인증 칸 글이 보임 (PC): 오류 "인증번호가 올바르지 않습니다." → 읽힘', async ({ page }) => {
    const { code } = await codeSent(page);
    await K.enterCode(page, wrongOf(code));
    await expect(K.codeNotice(page)).toContainText(WRONG);
    await expectReadable(K.codeNotice(page));
});

test('A11-E-032 인증 칸 글이 보임 (PC): "남은 시간 …초" → 읽힘', async ({ page }) => {
    await codeSent(page);
    await expect(K.codeNotice(page)).toHaveText(/^남은 시간 \d+초$/);
    await expectReadable(K.codeNotice(page));
});
