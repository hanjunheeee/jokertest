// 아이디 찾기 화면 시험: 닉네임·생일로 가린 이메일 보기, 못 찾음·입력 규칙·다시 찾기·뒤로
const { test, expect } = require('../../helpers/fixtures');

const nicknameBox = (page) => page.getByRole('textbox', { name: '닉네임을 입력하세요' });
const birthBox = (page) => page.locator('input[name="birthDate"]');
const findButton = (page) => page.getByRole('button', { name: '아이디 찾기' });

async function find(page, nickname, birthDate) {
    await page.goto('/find-id');
    await nicknameBox(page).fill(nickname);
    if (birthDate) await birthBox(page).fill(birthDate);
    await findButton(page).click();
}

// 서버 maskEmail 규칙과 같게: 앞 1자***끝 1자@도메인 첫 자***.끝
const maskOf = (email) => {
    const [local, domain] = email.split('@');
    return `${local[0]}***${local[local.length - 1]}@${domain[0]}***${domain.slice(domain.lastIndexOf('.'))}`;
};

test.describe('아이디 찾기', () => {
    test('맞는 닉네임·생일을 넣으면 → 가린 이메일이 보이고 전체 주소는 안 보임', async ({ page, accounts }) => {
        const account = await accounts.create({ birthDate: new Date(Date.UTC(1998, 2, 4)) });
        await find(page, account.nickname, '1998-03-04');
        await expect(page.getByText('가입하신 이메일은 아래와 같아요')).toBeVisible();
        const shown = page.getByRole('status');
        await expect(shown).toHaveText(maskOf(account.email));
        await expect(page.getByText(account.email)).toHaveCount(0);
    });

    test('생일이 다르면 → "일치하는 계정을 찾을 수 없습니다"와 다시 입력 버튼', async ({ page, accounts }) => {
        const account = await accounts.create();
        await find(page, account.nickname, '1990-01-01');
        await expect(page.getByRole('alert')).toHaveText('입력한 정보와 일치하는 계정을 찾을 수 없습니다.');
        await expect(page.getByRole('button', { name: '다시 입력' })).toBeVisible();
    });

    test('없는 닉네임이면 → 생일 틀림과 같은 못 찾음 문구', async ({ page }) => {
        await find(page, `없는${Date.now() % 100000}`, '2000-01-01');
        await expect(page.getByRole('alert')).toHaveText('입력한 정보와 일치하는 계정을 찾을 수 없습니다.');
    });

    test('못 찾음 뒤 다시 입력을 누르면 → 알림이 사라지고 입력 칸이 그대로 남음', async ({ page, accounts }) => {
        const account = await accounts.create();
        await find(page, account.nickname, '1990-01-01');
        await page.getByRole('button', { name: '다시 입력' }).click();
        await expect(page.getByRole('alert')).toHaveCount(0);
        await expect(nicknameBox(page)).toHaveValue(account.nickname);
    });

    test('닉네임을 비우고 찾으면 → 2~50자로 넣으라는 알림 (요청 안 감)', async ({ page }) => {
        await find(page, '', '2000-01-01');
        await expect(page.getByRole('alert')).toHaveText('닉네임을 2~50자로 입력해주세요.');
    });

    test('닉네임 가운데 띄어쓰기를 치면 → 바로 알림이 뜨고 지우면 사라짐', async ({ page }) => {
        await page.goto('/find-id');
        await nicknameBox(page).fill('ab cd');
        await expect(page.getByRole('alert')).toHaveText('닉네임에는 띄어쓰기를 사용할 수 없습니다.');
        await nicknameBox(page).fill('abcd');
        await expect(page.getByRole('alert')).toHaveCount(0);
    });

    test('닉네임에 특수문자가 있으면 → 한글·영문·숫자만 된다는 알림', async ({ page }) => {
        await find(page, 'ab!cd', '2000-01-01');
        await expect(page.getByRole('alert')).toHaveText('닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.');
    });

    test('생일을 안 고르면 → "생년월일을 선택해주세요" 알림', async ({ page }) => {
        await find(page, 'abcd', null);
        await expect(page.getByRole('alert')).toHaveText('생년월일을 선택해주세요.');
    });

    test('찾은 뒤 다시 찾기를 누르면 → 빈 입력 칸으로 돌아감', async ({ page, accounts }) => {
        const account = await accounts.create();
        await find(page, account.nickname, '2000-01-01');
        await expect(page.getByRole('status')).toBeVisible();
        await page.getByRole('button', { name: '다시 찾기' }).click();
        await expect(nicknameBox(page)).toHaveValue('');
        await expect(findButton(page)).toBeVisible();
    });

    test('뒤로 가기 버튼을 누르면 → 로그인 화면으로', async ({ page }) => {
        await page.goto('/find-id');
        await page.getByRole('button', { name: /뒤로/ }).click();
        await expect(page).toHaveURL(/\/login$/);
    });
});
