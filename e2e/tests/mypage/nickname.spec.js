// 계정 관리 닉네임 바꾸기: 성공·금지어·중복·규칙 어김
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const { gotoAccount, section } = require('./account-tools');

const newNick = () => `n${crypto.randomBytes(3).toString('hex')}`;

async function changeNickname(page, value) {
    const box = section(page, '닉네임 변경');
    await box.getByRole('textbox', { name: '새 닉네임' }).fill(value);
    await box.getByRole('button', { name: '변경' }).click();
    return box;
}

test.describe('닉네임 바꾸기', () => {
    test('새 닉네임으로 바꾸면 → 변경 안내, DB·마이페이지에 새 닉네임', async ({ user }) => {
        const { page, account } = user;
        const nick = newNick();
        await gotoAccount(page);
        const box = await changeNickname(page, nick);
        await expect(box.getByText('닉네임이 변경되었습니다.')).toBeVisible();
        const [row] = await query('SELECT nickname FROM users WHERE uuid = ?', [account.uuid]);
        expect(row.nickname).toBe(nick);
        await page.goto('/mypage');
        await expect(page.getByText(nick).first()).toBeVisible();
    });

    test('남이 쓰는 닉네임으로 바꾸면 → "이미 사용 중인 닉네임입니다." 안내, 그대로', async ({ user, accounts }) => {
        const { page, account } = user;
        const other = await accounts.create();
        await gotoAccount(page);
        const box = await changeNickname(page, other.nickname);
        await expect(box.getByText('이미 사용 중인 닉네임입니다.')).toBeVisible();
        const [row] = await query('SELECT nickname FROM users WHERE uuid = ?', [account.uuid]);
        expect(row.nickname).toBe(account.nickname);
    });

    test('금지어가 든 닉네임으로 바꾸면 → 사용할 수 없는 단어 안내', async ({ user, internal }) => {
        const { page } = user;
        const word = `금${crypto.randomBytes(2).toString('hex')}`;
        await query('INSERT INTO banned_words (word, is_active, created_at, updated_at) VALUES (?, 1, NOW(), NOW())', [word]);
        try {
            await internal.reloadBannedWords();
            await gotoAccount(page);
            const box = await changeNickname(page, `${word}a`.slice(0, 8));
            await expect(box.getByText('사용할 수 없는 단어가 들어간 닉네임입니다.')).toBeVisible();
        } finally {
            await query('DELETE FROM banned_words WHERE word = ?', [word]);
            await internal.reloadBannedWords();
        }
    });

    test('한 글자·특수문자 닉네임으로 바꾸면 → 규칙 안내가 뜨고 안 바뀜', async ({ user }) => {
        const { page, account } = user;
        await gotoAccount(page);
        let box = await changeNickname(page, 'a');
        await expect(box.getByText(/닉네임/).last()).toBeVisible();
        await expect(box.getByText('닉네임이 변경되었습니다.')).toHaveCount(0);
        box = await changeNickname(page, 'ab!@#');
        await expect(box.getByText('닉네임이 변경되었습니다.')).toHaveCount(0);
        const [row] = await query('SELECT nickname FROM users WHERE uuid = ?', [account.uuid]);
        expect(row.nickname).toBe(account.nickname);
    });

    test('닉네임을 바꾸고 로비로 가면 → 로비 마이페이지 버튼에 새 닉네임', async ({ user }) => {
        const { page } = user;
        const nick = newNick();
        await gotoAccount(page);
        const box = await changeNickname(page, nick);
        await expect(box.getByText('닉네임이 변경되었습니다.')).toBeVisible();
        await page.goto('/lobby');
        await expect(page.getByRole('button', { name: '마이페이지' })).toContainText(nick);
    });
});
