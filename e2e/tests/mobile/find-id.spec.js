// 모바일 아이디 찾기 시험 (375×812): 맞는 닉네임·생일이면 가린 이메일, 틀리면 못 찾음 안내 창·다시 입력
// 빈칸 채우기(소셜) 중 8 — 예전엔 화면 열기만 봤음
const { test, expect } = require('../../helpers/fixtures');
const { overflowX } = require('./_talk');

const nicknameBox = (page) => page.getByRole('textbox', { name: '닉네임' });
const birthBox = (page) => page.locator('input[name="birthDate"]');

async function find(page, nickname, birthDate) {
    await page.goto('/find-id');
    await nicknameBox(page).fill(nickname);
    await birthBox(page).fill(birthDate);
    await page.getByRole('button', { name: '아이디 찾기' }).click();
}

// 서버 maskEmail 규칙과 같게: 앞 1자***끝 1자@도메인 첫 자***.끝
const maskOf = (email) => {
    const [local, domain] = email.split('@');
    return `${local[0]}***${local[local.length - 1]}@${domain[0]}***${domain.slice(domain.lastIndexOf('.'))}`;
};

test.describe('모바일 아이디 찾기', () => {
    test('맞는 닉네임·생일이면 → 가린 이메일이 보이고 전체 주소는 안 보이며 가로로 안 넘침', async ({ page, accounts }) => {
        const account = await accounts.create({ birthDate: new Date(Date.UTC(1997, 6, 9)) });
        await find(page, account.nickname, '1997-07-09');
        await expect(page.getByText('가입하신 이메일은 아래와 같아요')).toBeVisible();
        await expect(page.getByRole('status')).toHaveText(maskOf(account.email));
        await expect(page.getByText(account.email)).toHaveCount(0);
        expect(await overflowX(page)).toBeLessThanOrEqual(0);
    });

    test('찾은 뒤 다시 찾기를 누르면 → 입력 칸으로 돌아감', async ({ page, accounts }) => {
        const account = await accounts.create({ birthDate: new Date(Date.UTC(1997, 6, 9)) });
        await find(page, account.nickname, '1997-07-09');
        await page.getByRole('button', { name: '다시 찾기' }).click();
        await expect(nicknameBox(page)).toBeVisible();
        await expect(page.getByRole('status')).toHaveCount(0);
    });

    test('생일이 다르면 → 못 찾음 안내 창이 뜨고 다시 입력 버튼이 보임', async ({ page, accounts }) => {
        const account = await accounts.create();
        await find(page, account.nickname, '1990-01-01');
        await expect(page.getByRole('alertdialog', { name: '안내' })).toContainText('입력한 정보와 일치하는 계정을 찾을 수 없습니다.');
        await expect(page.getByRole('button', { name: '다시 입력' })).toBeVisible();
        await expect(page.getByText('가입하신 이메일은 아래와 같아요')).toHaveCount(0);
    });
});
