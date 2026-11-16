'use strict';

// 비번 찾기 메일 요청 브라우저 시험 (PC): 로그인 화면에서 들어감·있는/없는/소셜 전용 주소 모두 같은 안내·같은 주소 4번째는 막힘
// 목록 A11b 브라우저 간단 A11-E-501~504·519 (쓰는 동안 안 돌림: npx playwright test --list tests/auth/a11-reset-request.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('./_a11b-kit');

test('A11-E-501 로그인 화면 "비밀번호 찾기" 누름 → /password-reset/request @smoke', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: '비밀번호 찾기' }).click();
    await expect(page).toHaveURL(/\/password-reset\/request$/);
    await expect(page.getByPlaceholder('가입할 때 등록한 이메일을 입력하세요')).toBeVisible();
});

test('A11-E-502 있는 이메일로 요청 → 접수 안내가 읽힘, 메일 상자에 재설정 링크 1통', async ({ page, accounts }) => {
    const acc = await accounts.create();
    expect(await k.requestResetUi(page, acc.email)).toBe(200);
    await expectReadable(k.requestSentNotice(page, false));
    const url = await k.resetLinkFor(acc.email);
    expect(url).toContain('/password-reset?token=');
    expect(k.mailsOf(acc.email, 'PASSWORD_RESET')).toHaveLength(1);
});

test('A11-E-503 없는 이메일로 요청 → 같은 접수 안내 글, 메일 상자 0통', async ({ page }) => {
    const nobody = k.freshEmail('nobody');
    expect(await k.requestResetUi(page, nobody)).toBe(200);
    // 가입 여부를 안 알려 주려고 있는 주소와 같은 글
    await expect(k.requestSentNotice(page, false)).toBeVisible();
    await k.expectNoMail(nobody);
});

test('A11-E-504 소셜 전용 이메일로 요청 → 같은 안내, 메일 상자에 소셜 안내 메일 1통', async ({ page, accounts, mail }) => {
    const acc = await accounts.create();
    await k.makeSocialOnly(acc.uuid);
    expect(await k.requestResetUi(page, acc.email)).toBe(200);
    await expect(k.requestSentNotice(page, false)).toBeVisible();
    await mail.waitForMail(acc.email, { template: 'SOCIAL_LOGIN_GUIDE' });
    expect(k.mailsOf(acc.email, 'SOCIAL_LOGIN_GUIDE')).toHaveLength(1);
    expect(k.mailsOf(acc.email, 'PASSWORD_RESET')).toHaveLength(0);
});

test('A11-E-519 같은 주소로 요청 4번 → 4번째에 "너무 많은 요청입니다…" 보임, 메일은 1통', async ({ page, accounts }) => {
    const acc = await accounts.create();
    expect(await k.requestResetUi(page, acc.email)).toBe(200);
    await expect(k.requestSentNotice(page, false)).toBeVisible();
    // 결정(2026-11-16): "다시 보내기"는 보낸 뒤 1분 꺼짐 + 남은 초 글 → 연달아 못 누름
    await expect(page.getByRole('button', { name: '다시 보내기', exact: true })).toBeDisabled();
    await expect(page.getByText(/^\d+초 뒤 다시 보낼 수 있습니다\.$/)).toBeVisible();
    // 2·3번째는 요청 화면을 새로 열어 같은 주소로 다시 — 서버는 1분 안이라 메일은 건너뛰지만 같은 접수 답, 1시간 3번 셈에는 들어감
    for (let i = 2; i <= 3; i += 1) {
        expect(await k.requestResetUi(page, acc.email), `${i}번째`).toBe(200);
        await expect(k.requestSentNotice(page, false)).toBeVisible();
    }
    expect(await k.requestResetUi(page, acc.email)).toBe(429);
    await expect(page.getByText(k.TEXT.rateLimited, { exact: true })).toBeVisible();
    // 1분 안 다시 요청은 메일을 안 보냄 → 첫 메일 1통만
    await k.resetLinkFor(acc.email);
    expect(k.mailsOf(acc.email, 'PASSWORD_RESET')).toHaveLength(1);
});
