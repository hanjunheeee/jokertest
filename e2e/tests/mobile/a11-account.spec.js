'use strict';

// 모바일 계정 관리 브라우저 시험: 칸 글자 크기·비번 바꾸기·현재 비번 틀림·이메일 바꾸기·탈퇴·소셜 전용 칸·닉네임·판 중 탈퇴 409(7명)·긴 오류 글 줄바꿈
// 목록 A11b 브라우저 간단 A11-E-591·594~603·605 (쓰는 동안 안 돌림: npx playwright test --list tests/mobile/a11-account.spec.js)
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('../auth/_a11b-kit');

test('A11-E-591 모바일 계정 관리 현재 비번 칸 글자 크기 16px 이상, autocomplete="current-password"', async ({ user }) => {
    const { page } = user;
    await k.gotoAccount(page);
    const box = k.currentPwBox(page);
    const size = await box.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
    await expect(box).toHaveAttribute('autocomplete', 'current-password');
});

test('A11-E-594 모바일 비번 바꾸기 성공 → 로그인 화면 @smoke', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    expect(await k.changePasswordUi(page, { current: account.password, next: k.testPassword() })).toBe(200);
    await expect(k.pwSection(page).getByText(k.TEXT.pwChanged, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
});

test('A11-E-595 모바일 현재 비번 틀림 → 문구, 계정 화면 그대로', async ({ user }) => {
    const { page } = user;
    await k.gotoAccount(page);
    expect(await k.changePasswordUi(page, { current: k.WRONG_PASSWORD, next: k.testPassword() })).toBe(400);
    await expect(k.pwSection(page).getByText(k.TEXT.currentPwWrong, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);
});

test('A11-E-596 모바일 현재 비번 틀림 문구가 읽힘', async ({ user }) => {
    const { page } = user;
    await k.gotoAccount(page);
    await k.changePasswordUi(page, { current: k.WRONG_PASSWORD, next: k.testPassword() });
    await expectReadable(k.pwSection(page).getByText(k.TEXT.currentPwWrong, { exact: true }));
});

test('A11-E-597 모바일 이메일 바꾸기: 번호 받기 → 확인 → 바뀜', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    const next = await k.changeEmailUi(page, { password: account.password });
    await expect(k.emailSection(page).getByText(`지금 이메일: ${next}`, { exact: true })).toBeVisible();
});

test('A11-E-598 모바일 이메일 바꾸기 현재 비번 틀림 → 문구, 메일 0통', async ({ user }) => {
    const { page } = user;
    await k.gotoAccount(page);
    const to = k.freshEmail('ec');
    expect(await k.sendEmailCode(page, { newEmail: to, password: k.WRONG_PASSWORD })).toBe(400);
    await expect(k.emailSection(page).getByText(k.TEXT.currentPwWrong, { exact: true })).toBeVisible();
    await k.expectNoMail(to);
});

test('A11-E-599 모바일 탈퇴: 확인 창 안내 보임 → 탈퇴 → 로그인 화면', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    const dialog = await k.openWithdrawConfirm(page, account.password);
    for (const line of k.WITHDRAW_NOTICE_LINES) await expect(dialog.getByText(line, { exact: true })).toBeVisible();
    // 응답 전에 소켓 "탈퇴 완료"로 화면이 떠나 브라우저 응답이 버려짐 → 서버 상태는 가로채서 받음
    const { status } = await k.watchWithdrawStatus(page);
    await dialog.getByRole('button', { name: '탈퇴하기' }).click();
    expect(await status).toBe(200);
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
});

test('A11-E-600 모바일 탈퇴 틀린 비번 → "비밀번호가 올바르지 않습니다."', async ({ user }) => {
    const { page } = user;
    await k.gotoAccount(page);
    expect(await k.withdrawUi(page, k.WRONG_PASSWORD)).toBe(400);
    await expect(k.withdrawSection(page).getByText(k.TEXT.withdrawPwWrong, { exact: true })).toBeVisible();
});

test('A11-E-601 모바일 소셜 전용 계정: 탈퇴는 이메일 칸, 이메일 바꾸기에 비번 칸 없음', async ({ user }) => {
    const { page, account } = user;
    await k.makeSocialOnly(account.uuid);
    await k.gotoAccount(page);
    await expect(k.withdrawSection(page).locator('input[name="withdrawConfirmEmail"]')).toBeVisible();
    await expect(k.withdrawSection(page).locator('input[name="withdrawPassword"]')).toHaveCount(0);
    await expect(k.emailSection(page).getByPlaceholder('새 이메일', { exact: true })).toBeVisible();
    await expect(k.emailSection(page).locator('input[name="emailChangePassword"]')).toHaveCount(0);
});

test('A11-E-602 모바일 닉네임 바꾸기 → 로비 배너에 새 닉네임', async ({ user }) => {
    const { page } = user;
    await k.gotoAccount(page);
    const next = k.freshNickname();
    expect(await k.changeNicknameUi(page, next)).toBe(200);
    await expect(k.nicknameSection(page).getByText(k.TEXT.nicknameChanged, { exact: true })).toBeVisible();
    await ui.gotoLobby(page);
    await expect(k.banner(page)).toContainText(next);
});

test('A11-E-603 모바일 판 중 탈퇴 거절 (7명 판, 사람 1 + 봇 6): 탈퇴 요청 → 409, 판 화면 그대로 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await k.startCitizenGame(table, user, 7);
    await k.expectWithdrawBlockedInGame(t, user);
});

test('A11-E-605 모바일 5번 틀림 문구가 줄바꿈되어 끝까지 화면 안', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    await k.failCurrentPassword(page, 5);
    expect(await k.changePasswordUi(page, { current: account.password, next: k.testPassword() })).toBe(429);
    const message = k.pwSection(page).getByText(k.TEXT.currentPwLocked, { exact: true });
    await expectReadable(message);
    // 폰은 줄바꿈 허용: 글 높이가 글자 크기 2배 넘음(= 두 줄 이상, 한 줄이면 약 1.4배), 가로로 넘치지 않음
    const { height, fontSize } = await message.evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        fontSize: Number.parseFloat(getComputedStyle(el).fontSize),
    }));
    expect(height).toBeGreaterThan(fontSize * 2);
    await k.expectNotClipped(message);
});
