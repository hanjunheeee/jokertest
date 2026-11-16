'use strict';

// 모바일 고객센터 문의 브라우저 시험 — 문의 시트에서 쓰면 내 목록에 "답 기다림", 연달아 세 번째는 안내 글
// 목록 A13-친구-알림-초대.md 번호 A13-E-099·100 (AD-273·275), 쓰는 동안 안 돌림 — npx playwright test --list tests/mobile/a13-inquiry.spec.js
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('../social/_a13-kit');

const { TEXT } = K;

const freshTitle = (head = '문의') => `${head} ${crypto.randomBytes(3).toString('hex')}`;

/** 문의 하나 쓰고 내 문의 목록에 그 줄이 보일 때까지 → 줄 */
async function writeAndSee(page, title) {
    await K.writeInquiry(page, { title });
    await page.getByTestId('inquiry-tab-list').click();
    const row = K.inquiryRows(page).filter({ hasText: title });
    await expect(row).toHaveCount(1);
    return row;
}

test('A13-E-099 모바일 고객센터 문의 시트에서 쓰기 → 내 목록 "답 기다림" @smoke', async ({ user }) => {
    const page = user.page;
    await K.openInquiry(page);
    const row = await writeAndSee(page, freshTitle());
    await expect(row).toContainText(TEXT.inquiryWaiting);
});

test('A13-E-100 모바일 연달아 세 번째 문의 → 안내 글("잠시 뒤 다시") 읽힘', async ({ user }) => {
    const page = user.page;
    await K.openInquiry(page);
    await writeAndSee(page, freshTitle('첫째'));
    await writeAndSee(page, freshTitle('둘째'));

    await K.writeInquiry(page, { title: freshTitle('셋째') });
    const message = page.getByTestId('inquiry-message');
    await expect(message).toHaveText(/잠시 뒤에? 다시/);
    await expectReadable(message);
});
