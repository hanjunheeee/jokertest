// 관리자 회원 찾기 브라우저 시험 (AD-067·068): 닉네임 앞부분으로 찾기 → 상세 "접속 중", UUID로 찾기, 없는 닉네임 "없음"
// 프로젝트 admin (1280×800), 플레이어는 진짜 로그인해서 로비에 있음 (소켓 접속 = 접속 중)
const crypto = require('node:crypto');
const { test, expect } = require('../../helpers/fixtures');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');

const findMember = async (page, word) => {
    await page.goto('/members');
    await page.getByLabel('찾을 회원').fill(word);
    await page.getByRole('button', { name: '찾기', exact: true }).click();
};

test.describe('관리자 회원 찾기', () => {
    test('AD-067: 닉네임 앞부분으로 찾기 → 상세, 로비에 있는 플레이어는 "접속 중"', async ({ page, players }) => {
        const player = await players.add();
        await loginAsAdmin(page, await createAdmin());

        await findMember(page, player.account.nickname.slice(0, -1));
        const row = page.getByRole('row').filter({ hasText: player.account.nickname });
        await expect(row).toBeVisible();
        await expect(row.getByText('접속 중')).toBeVisible();
        await row.getByRole('link', { name: player.account.nickname }).click();

        await expect(page).toHaveURL(new RegExp(`/members/${player.account.uuid}$`));
        await expect(page.getByRole('heading', { level: 1, name: player.account.nickname })).toBeVisible();
        await expect(page.getByText('접속 중').first()).toBeVisible();
        await expect(page.getByText(player.account.email)).toHaveCount(0);
        // 이메일 보기 → 전체 이메일
        await page.getByRole('button', { name: '이메일 보기' }).click();
        await expect(page.getByText(player.account.email)).toBeVisible();
    });

    test('AD-068: UUID로 찾기 → 한 줄, 없는 닉네임 → "없음"', async ({ page, accounts }) => {
        const member = await accounts.create();
        await loginAsAdmin(page, await createAdmin());

        await findMember(page, member.uuid);
        await expect(page).toHaveURL(new RegExp(`q=${member.uuid}`));
        const rows = page.getByRole('row').filter({ hasText: member.nickname });
        await expect(rows).toHaveCount(1);
        await expect(rows.getByText('접속 안 함')).toBeVisible();

        await findMember(page, `없는닉${crypto.randomBytes(3).toString('hex')}`);
        await expect(page.getByText(/^없음/)).toBeVisible();
        await expect(page.getByRole('table')).toHaveCount(0);
    });
});
