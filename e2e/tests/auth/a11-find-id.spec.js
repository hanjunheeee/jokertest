'use strict';

// 아이디(메일) 찾기 브라우저 시험 (PC): 로그인 화면에서 들어감·찾으면 가린 이메일만·못 찾음 글·같은 닉네임 6번째 막힘·다시 입력하면 값 남음
// 목록 A11b 브라우저 간단 A11-E-522~527 (쓰는 동안 안 돌림: npx playwright test --list tests/auth/a11-find-id.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('./_a11b-kit');

test('A11-E-522 로그인 화면 "아이디 찾기" → /find-id @smoke', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: '아이디 찾기' }).click();
    await expect(page).toHaveURL(/\/find-id$/);
    await expect(k.findNicknameBox(page)).toBeVisible();
});

test('A11-E-523 닉네임·생일 맞음 → 가린 이메일 보임, 원래 이메일 글자 없음', async ({ page, accounts }) => {
    const acc = await accounts.create({ birthDate: new Date(Date.UTC(2000, 0, 1)) });
    expect(await k.findIdUi(page, { nickname: acc.nickname, birthDate: '2000-01-01' })).toBe(200);
    const shown = k.foundEmailText(page);
    await expectReadable(shown);
    const text = (await shown.innerText()).trim();
    // 가렸으니 원래 주소와 다르고 원래 주소 앞쪽(@ 앞)도 통째로는 안 보임
    expect(text).not.toBe(acc.email);
    expect(text).not.toContain(acc.email.split('@')[0]);
    await expect(page.locator('body')).not.toContainText(acc.email);
});

test('A11-E-524 틀린 생일 → "입력한 정보와 일치하는 계정을 찾을 수 없습니다."', async ({ page, accounts }) => {
    const acc = await accounts.create();
    expect(await k.findIdUi(page, { nickname: acc.nickname, birthDate: '1999-12-31' })).toBe(200);
    await expect(page.getByText(k.TEXT.findNotFound, { exact: true })).toBeVisible();
});

test('A11-E-525 같은 닉네임으로 6번 → 6번째 "너무 많은 요청입니다…"', async ({ page, accounts }) => {
    const acc = await accounts.create();
    // 같은 닉네임 10분 5번까지 (틀린 생일로 다섯 번)
    expect(await k.findIdUi(page, { nickname: acc.nickname, birthDate: '1999-12-31' })).toBe(200);
    for (let i = 2; i <= 5; i += 1) expect(await k.submitFindId(page), `${i}번째`).toBe(200);
    expect(await k.submitFindId(page)).toBe(429);
    await expect(page.getByText(k.TEXT.rateLimited, { exact: true })).toBeVisible();
});

test('A11-E-526 못 찾은 뒤 "다시 입력" → 닉네임·생일 칸 값 남음', async ({ page, accounts }) => {
    const acc = await accounts.create();
    await k.findIdUi(page, { nickname: acc.nickname, birthDate: '1999-12-31' });
    await expect(page.getByText(k.TEXT.findNotFound, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '다시 입력' }).click();
    await expect(page.getByText(k.TEXT.findNotFound, { exact: true })).toHaveCount(0);
    await expect(k.findNicknameBox(page)).toHaveValue(acc.nickname);
    await expect(k.findBirthBox(page)).toHaveValue('1999-12-31');
});

test('A11-E-527 못 찾음 글이 읽힘', async ({ page, accounts }) => {
    const acc = await accounts.create();
    await k.findIdUi(page, { nickname: acc.nickname, birthDate: '1999-12-31' });
    await expectReadable(page.getByText(k.TEXT.findNotFound, { exact: true }));
});
