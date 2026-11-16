'use strict';

// 비번 재설정 화면 "보임" 브라우저 시험 (PC): 비번 보기 단추가 보였다 숨었다·눈 그림 단추·오류 글·링크 안내 글이 사람 눈에 읽힘
// 목록 A11b 브라우저 간단 A11-E-514~517 (쓰는 동안 안 돌림: npx playwright test --list tests/auth/a11-reset-visible.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('./_a11b-kit');

// 재설정 링크 열어 새 비번 칸까지
async function openFreshLink(page, accounts) {
    const acc = await accounts.create();
    await k.requestResetApi(page.context(), acc.email);
    const url = await k.resetLinkFor(acc.email);
    await k.openResetLink(page, url);
    return { acc, url };
}

test('A11-E-514 비번 보기 단추: 누르면 친 글자가 보이고 다시 누르면 숨음 @smoke', async ({ page, accounts }) => {
    await openFreshLink(page, accounts);
    const box = k.newPasswordBox(page);
    const typed = k.testPassword();
    await box.fill(typed);
    await expect(box).toHaveAttribute('type', 'password');
    await k.eyeButtonOf(box).click();
    await expect(box).toHaveAttribute('type', 'text');
    await expect(box).toHaveValue(typed);
    await expect(k.eyeButtonOf(box)).toHaveAttribute('aria-label', '비밀번호 숨기기');
    await k.eyeButtonOf(box).click();
    await expect(box).toHaveAttribute('type', 'password');
});

test('A11-E-515 새 비번 칸 눈 그림 단추가 읽힘 (그림 단추 대비 3 이상)', async ({ page, accounts }) => {
    await openFreshLink(page, accounts);
    await k.expectIconReadable(k.eyeButtonOf(k.newPasswordBox(page)));
    await k.expectIconReadable(k.eyeButtonOf(k.newPasswordConfirmBox(page)));
});

test('A11-E-516 확인 다름 오류 글이 읽힘', async ({ page, accounts }) => {
    await openFreshLink(page, accounts);
    await k.submitNewPassword(page, k.testPassword(), k.testPassword());
    await expectReadable(page.getByText(k.TEXT.confirmMismatch, { exact: true }));
});

test('A11-E-517 링크 안내 글(만료·사용됨)이 읽힘', async ({ page, accounts }) => {
    // 만료 안내
    const first = await openFreshLink(page, accounts);
    await k.expireResetTokens(first.acc.uuid);
    await page.goto(first.url);
    await expectReadable(page.getByText(k.TEXT.linkExpired, { exact: true }));
    // 사용됨 안내 (다른 계정으로 한 번 쓴 링크)
    const acc = await accounts.create();
    const used = await k.resetPasswordVia(page, acc.email, k.testPassword());
    await page.goto(used);
    await expectReadable(page.getByText(k.TEXT.linkUsed, { exact: true }));
});
