'use strict';

// 이메일 바꾸기 브라우저 시험 (PC 계정 관리): 끝까지·새 주소 로그인·옛 주소 막힘·새 주소로 비번 찾기·현재 비번 틀림·남이 쓰는 주소·틀린 번호·바로 다시 받기·옛 주소 알림
// 목록 A11b 브라우저 간단 A11-E-539~547 (쓰는 동안 안 돌림: npx playwright test --list tests/mypage/a11-email-change.spec.js)
const { test, expect, ui, mail } = require('../../helpers/fixtures');
const k = require('../auth/_a11b-kit');

test('A11-E-539 현재 비번 + 새 주소 → "번호 받기" → 메일 번호 → "확인" → "이메일이 변경되었습니다." + 지금 이메일 새 값 @smoke', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    const next = await k.changeEmailUi(page, { password: account.password });
    await expect(k.emailSection(page).getByText(`지금 이메일: ${next}`, { exact: true })).toBeVisible();
});

test('A11-E-540 바꾼 뒤 새 주소로 로그인 됨', async ({ user, players }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    const next = await k.changeEmailUi(page, { password: account.password });
    const fresh = await k.freshBrowser(players, account);
    await ui.loginViaUi(fresh.page, { email: next, password: account.password });
    await expect(fresh.page).toHaveURL(/\/lobby$/);
});

test('A11-E-541 바꾼 뒤 옛 주소 로그인 → 실패 알림', async ({ user, players }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    await k.changeEmailUi(page, { password: account.password });
    const fresh = await k.freshBrowser(players, account);
    expect(await k.loginFailAlert(fresh.page, account.email, account.password)).toBe(k.TEXT.loginFailed);
    await expect(fresh.page).toHaveURL(/\/login$/);
});

test('A11-E-542 바꾼 뒤 새 주소로 비번 찾기 → 새 주소 메일 상자에 재설정 링크', async ({ user, players }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    const next = await k.changeEmailUi(page, { password: account.password });
    const fresh = await k.freshBrowser(players, account);
    expect(await k.requestResetUi(fresh.page, next)).toBe(200);
    const url = await k.resetLinkFor(next);
    expect(url).toContain('/password-reset?token=');
    expect(k.mailsOf(next, 'PASSWORD_RESET')).toHaveLength(1);
});

test('A11-E-543 현재 비번 틀림 → 문구 보임, 새 주소 메일 상자 0통', async ({ user }) => {
    const { page } = user;
    await k.gotoAccount(page);
    const to = k.freshEmail('ec');
    expect(await k.sendEmailCode(page, { newEmail: to, password: k.WRONG_PASSWORD })).toBe(400);
    await expect(k.emailSection(page).getByText(k.TEXT.currentPwWrong, { exact: true })).toBeVisible();
    await k.expectNoMail(to);
});

test('A11-E-544 남이 쓰는 주소 → "이미 사용 중인 이메일입니다."', async ({ user, accounts }) => {
    const { page, account } = user;
    const someone = await accounts.create();
    await k.gotoAccount(page);
    expect(await k.sendEmailCode(page, { newEmail: someone.email, password: account.password })).toBe(409);
    await expect(k.emailSection(page).getByText(k.TEXT.emailInUse, { exact: true })).toBeVisible();
});

test('A11-E-545 틀린 번호 → 문구 끝 "(남은 횟수 4)"', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    const to = k.freshEmail('ec');
    const since = Date.now() - 1000;
    expect(await k.sendEmailCode(page, { newEmail: to, password: account.password })).toBe(200);
    const real = await mail.waitForCode(to, 'EMAIL_CHANGE_CODE', { since });
    // 맞는 번호의 끝자리만 바꿈 → 자릿수는 같고 값은 틀림 (예: '123456' → '123457')
    const wrong = `${real.slice(0, -1)}${(Number(real.slice(-1)) + 1) % 10}`;
    expect(await k.confirmEmailCode(page, wrong)).toBe(400);
    await expect(k.emailSection(page).getByText(/\(남은 횟수 4\)$/)).toBeVisible();
});

test('A11-E-546 번호 받자마자 다시 받기 → "…(n초 뒤)" 문구', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    expect(await k.sendEmailCode(page, { newEmail: k.freshEmail('ec'), password: account.password })).toBe(200);
    expect(await k.resendEmailCode(page)).toBe(429);
    await expect(k.emailSection(page).getByText(/\(\d+초 뒤\)$/)).toBeVisible();
});

test('A11-E-547 바꾼 뒤 옛 주소 메일 상자에 "바뀌었음" 메일 1통', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    await k.changeEmailUi(page, { password: account.password });
    await mail.waitForMail(account.email, { template: 'EMAIL_CHANGED' });
    expect(k.mailsOf(account.email, 'EMAIL_CHANGED')).toHaveLength(1);
});
