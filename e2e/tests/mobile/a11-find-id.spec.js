'use strict';

// 모바일 아이디(메일) 찾기 브라우저 시험: 찾으면 가린 이메일·못 찾으면 양피지 안내
// 목록 A11b 브라우저 간단 A11-E-592·593 (쓰는 동안 안 돌림: npx playwright test --list tests/mobile/a11-find-id.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const k = require('../auth/_a11b-kit');

test('A11-E-592 모바일 아이디 찾기 → 가린 이메일 보임 @smoke', async ({ page, accounts }) => {
    const acc = await accounts.create();
    expect(await k.findIdUi(page, { nickname: acc.nickname })).toBe(200);
    const shown = k.foundEmailText(page);
    await expectReadable(shown);
    const text = (await shown.innerText()).trim();
    expect(text).not.toBe(acc.email);
    await expect(page.locator('body')).not.toContainText(acc.email);
});

test('A11-E-593 모바일 아이디 찾기 실패 → 못 찾음 문구', async ({ page, accounts }) => {
    const acc = await accounts.create();
    expect(await k.findIdUi(page, { nickname: acc.nickname, birthDate: '1999-12-31' })).toBe(200);
    await expect(k.findFailText(page, k.TEXT.findNotFound, true)).toBeVisible();
});
