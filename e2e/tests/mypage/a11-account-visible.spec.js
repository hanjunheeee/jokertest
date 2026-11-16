'use strict';

// 계정 관리 "보임" 브라우저 시험 (PC): 긴 오류 글이 잘리지 않음·비번 보기 눈 그림·현재 비번 틀림 글·남이 쓰는 주소 글·탈퇴 확인 창이 사람 눈에 읽힘
// 목록 A11b 브라우저 간단 A11-E-535·536·537·548·559 (쓰는 동안 안 돌림: npx playwright test --list tests/mypage/a11-account-visible.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('../auth/_a11b-kit');

test('A11-E-535 PC 창 폭 1280에서 5번 틀림 문구가 끝까지 화면 안, 가로로 잘리지 않음', async ({ user }) => {
    const { page, account } = user;
    await page.setViewportSize({ width: 1280, height: 800 });
    await k.gotoAccount(page);
    await k.failCurrentPassword(page, 5);
    expect(await k.changePasswordUi(page, { current: account.password, next: k.testPassword() })).toBe(429);
    const message = k.pwSection(page).getByText(k.TEXT.currentPwLocked, { exact: true });
    await expectReadable(message);
    await k.expectNotClipped(message);
});

test('A11-E-536 비번 바꾸기 칸 눈 그림 단추가 읽힘 (그림 단추 대비 3 이상) @smoke', async ({ user }) => {
    const { page } = user;
    await k.gotoAccount(page);
    await k.expectIconReadable(k.eyeButtonOf(k.currentPwBox(page)));
});

test('A11-E-537 현재 비번 틀림 문구가 읽힘', async ({ user }) => {
    const { page } = user;
    await k.gotoAccount(page);
    expect(await k.changePasswordUi(page, { current: k.WRONG_PASSWORD, next: k.testPassword() })).toBe(400);
    await expectReadable(k.pwSection(page).getByText(k.TEXT.currentPwWrong, { exact: true }));
});

test('A11-E-548 이메일 칸 "이미 사용 중인 이메일입니다." 문구가 읽힘', async ({ user, accounts }) => {
    const { page, account } = user;
    const someone = await accounts.create();
    await k.gotoAccount(page);
    expect(await k.sendEmailCode(page, { newEmail: someone.email, password: account.password })).toBe(409);
    await expectReadable(k.emailSection(page).getByText(k.TEXT.emailInUse, { exact: true }));
});

test('A11-E-559 탈퇴 확인 창 안내 글·"탈퇴하기"가 읽힘', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    const dialog = await k.openWithdrawConfirm(page, account.password);
    for (const line of k.WITHDRAW_NOTICE_LINES) await expectReadable(dialog.getByText(line, { exact: true }));
    await expectReadable(dialog.getByRole('button', { name: '탈퇴하기' }));
});
