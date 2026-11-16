'use strict';

// 입력 검사 브라우저 시험 (모바일) — 계정 관리에서 금지어 든 닉네임 거절 글이 읽힘
// 목록 A15-보안.md 번호 A15-E-073 (쓰는 동안 안 돌림: npx playwright test --list tests/mobile/a15-input.spec.js)
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { addBannedWords, removeBannedWords } = require('../../helpers/bannedWords');
const { db } = require('../security/_sec');
const account = require('../mypage/account-tools');

const BANNED_NICKNAME = '사용할 수 없는 단어가 들어간 닉네임입니다.';

test(`A15-E-073 모바일 금지어 든 닉네임 → "${BANNED_NICKNAME}" 읽힘, 닉네임 그대로 @smoke`, async ({ user }) => {
    // 목록의 "바보" 자리에 시험마다 무작위 낱말 (같이 도는 다른 시험에 안 걸리게)
    const word = `bw${crypto.randomBytes(2).toString('hex')}`;
    await addBannedWords([word]);
    try {
        const page = user.page;
        await account.gotoAccount(page);
        const box = account.section(page, '닉네임 변경');
        await box.getByPlaceholder('새 닉네임', { exact: true }).fill(word);
        await box.getByRole('button', { name: '변경', exact: true }).click();
        await expectReadable(box.getByText(BANNED_NICKNAME, { exact: true }));
        const [row] = await db.query('SELECT nickname FROM users WHERE uuid = ?', [user.account.uuid]);
        expect(row.nickname).toBe(user.account.nickname);
    } finally {
        await removeBannedWords([word]);
    }
});
