// 관리자 금지어 브라우저 시험 (AD-174): 금지어 넣기 → 플레이어 닉네임 바꾸기 거절, 같은 단어 다시 → "이미 있음"
// 프로젝트 admin (1280×800), 0-4 도우미(createAdmin·loginAsAdmin)로 관리자 로그인
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');
const { gotoAccount, section } = require('../mypage/account-tools');

test.describe('관리자 금지어', () => {
    test('AD-174: 넣기 → 서버별 반영 결과, 플레이어 닉네임 거절, 같은 단어 다시 → 이미 있음', async ({ page, players, internal }) => {
        const word = `금${crypto.randomBytes(2).toString('hex')}`;
        try {
            const account = await createAdmin();
            await loginAsAdmin(page, account);
            await page.goto('/banned-words');
            await expect(page.getByRole('heading', { name: '금지어', level: 1 })).toBeVisible();

            await page.getByLabel('넣을 금지어').fill(word);
            await page.getByRole('button', { name: '넣기', exact: true }).click();
            await expect(page.getByRole('status').filter({ hasText: `'${word}' 금지어를 켰어요.` })).toBeVisible();
            await expect(page.getByText(/반영됨$/).first()).toBeVisible();
            await expect(page.getByRole('cell', { name: word, exact: true })).toBeVisible();

            // 플레이어: 금지어 든 닉네임으로 바꾸기 → 거절
            const player = await players.add();
            await gotoAccount(player.page);
            const box = section(player.page, '닉네임 변경');
            await box.getByRole('textbox', { name: '새 닉네임' }).fill(`${word}a`.slice(0, 8));
            await box.getByRole('button', { name: '변경' }).click();
            await expect(box.getByText('사용할 수 없는 단어가 들어간 닉네임입니다.')).toBeVisible();

            // 같은 단어 다시 → 이미 있음
            await page.getByLabel('넣을 금지어').fill(word);
            await page.getByRole('button', { name: '넣기', exact: true }).click();
            await expect(page.getByText('이미 있는 단어예요.')).toBeVisible();
        } finally {
            await query('DELETE FROM banned_words WHERE word = ?', [word]);
            await internal.reloadBannedWords();
        }
    });
});
