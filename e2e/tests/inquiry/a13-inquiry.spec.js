'use strict';

// 고객센터 문의 브라우저 시험 (PC) — 로비 고객센터에서 문의 쓰면 내 목록에 "답 기다림", 1분 세 번째 안내, 금지어는 가려짐, 답 기다림 5개면 막힘
// 목록 A13-친구-알림-초대.md 번호 A13-E-067~070 (관리자 답하기는 A14, 쓰는 동안 안 돌림 — npx playwright test --list tests/inquiry/a13-inquiry.spec.js)
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const bannedWords = require('../../helpers/bannedWords');
const K = require('../social/_a13-kit');

const { U, TEXT } = K;

// 시험마다 다른 제목 (목록에서 그 줄을 찾게)
const freshTitle = (head = '문의') => `${head} ${crypto.randomBytes(3).toString('hex')}`;

/** 문의 하나 쓰고 내 문의 목록에 그 줄이 보일 때까지 → 줄 */
async function writeAndSee(page, title) {
    await K.writeInquiry(page, { title });
    await page.getByTestId('inquiry-tab-list').click();
    const row = K.inquiryRows(page).filter({ hasText: title });
    await expect(row).toHaveCount(1);
    return row;
}

test('A13-E-067 로비 고객센터 → 문의 쓰기 → 내 목록에 그 문의 "답 기다림" @smoke', async ({ user }) => {
    const page = user.page;
    await K.openInquiry(page);
    const row = await writeAndSee(page, freshTitle());
    await expect(row).toContainText(TEXT.inquiryWaiting);
});

test('A13-E-068 1분 안에 연달아 세 번째 문의 → 안내 글("잠시 뒤 다시") 읽힘', async ({ user }) => {
    const page = user.page;
    await K.openInquiry(page);
    await writeAndSee(page, freshTitle('첫째'));
    await writeAndSee(page, freshTitle('둘째'));

    await K.writeInquiry(page, { title: freshTitle('셋째') });
    const message = page.getByTestId('inquiry-message');
    await expect(message).toHaveText(/잠시 뒤에? 다시/);
    await expectReadable(message);
});

test('A13-E-069 금지어 든 문의 → 내 목록에서 그 낱말이 가려짐', async ({ user }) => {
    const page = user.page;
    // 다른 시험 글에 안 걸리게 무작위 낱말
    const word = `zq${crypto.randomBytes(3).toString('hex').replace(/[0-9]/g, 'k')}`;
    await bannedWords.addBannedWords([word]);
    try {
        await K.openInquiry(page);
        const head = freshTitle('금지어');
        await K.writeInquiry(page, { title: `${head} ${word}`, body: `내용 ${word} 들어감` });
        await page.getByTestId('inquiry-tab-list').click();
        const row = K.inquiryRows(page).filter({ hasText: head });
        await expect(row).toHaveCount(1);
        await expect(row).not.toContainText(word);
        await expect(row).toContainText('*');
    } finally {
        await bannedWords.removeBannedWords([word]);
    }
});

test('A13-E-070 답 기다리는 문의 5개(DB로 넣음) → 화면에서 6번째 → "답을 기다리는 문의가 5개 있어요. 답이 온 뒤에 새로 보내 주세요." 읽힘', async ({ user }) => {
    const page = user.page;
    await K.insertOpenInquiries(U(user), 5);
    await K.openInquiry(page);

    await K.writeInquiry(page, { title: freshTitle('여섯째') });
    const message = page.getByTestId('inquiry-message');
    await expect(message).toHaveText(TEXT.inquiryOpenLimit);
    await expectReadable(message);
});
