'use strict';

// 닉네임 바꾸기 브라우저 시험 (PC 계정 관리): 바꾸면 로비 배너도 새 이름·남이 쓰는 이름·9자 거절
// 목록 A11b 브라우저 간단 A11-E-568~570 (쓰는 동안 안 돌림: npx playwright test --list tests/mypage/a11-nickname.spec.js)
const { test, expect, ui } = require('../../helpers/fixtures');
const k = require('../auth/_a11b-kit');

test('A11-E-568 새 닉네임 → 성공 문구 → 로비 배너에 새 닉네임 @smoke', async ({ user }) => {
    const { page } = user;
    await k.gotoAccount(page);
    const next = k.freshNickname();
    expect(await k.changeNicknameUi(page, next)).toBe(200);
    await expect(k.nicknameSection(page).getByText(k.TEXT.nicknameChanged, { exact: true })).toBeVisible();
    await ui.gotoLobby(page);
    await expect(k.banner(page)).toContainText(next);
});

test('A11-E-569 남이 쓰는 닉네임 → "이미 사용 중인 닉네임입니다."', async ({ user, accounts }) => {
    const { page } = user;
    const someone = await accounts.create();
    await k.gotoAccount(page);
    expect(await k.changeNicknameUi(page, someone.nickname)).toBe(409);
    await expect(k.nicknameSection(page).getByText(k.TEXT.nicknameInUse, { exact: true })).toBeVisible();
});

test('A11-E-570 9자 닉네임 → "닉네임은 2~8자여야 합니다."', async ({ user }) => {
    const { page, account } = user;
    await k.gotoAccount(page);
    expect(await k.changeNicknameUi(page, 'nick12345')).toBe(400); // 9자
    await expect(k.nicknameSection(page).getByText(k.TEXT.nicknameLength, { exact: true })).toBeVisible();
    // 이름은 그대로
    await ui.gotoLobby(page);
    await expect(k.banner(page)).toContainText(account.nickname);
});
