// 마이페이지 첫 화면: 닉네임·판 수·승률·대표 직업 문구, 칭호 없음, 메뉴 이동, 한 판 뒤 판 수
const { test, expect, ui } = require('../../helpers/fixtures');

async function gotoMyPage(page) {
    await page.goto('/mypage');
    await ui.skipIntro(page);
    await expect(page.getByRole('button', { name: '계정 관리' })).toBeVisible();
}

test.describe('마이페이지', () => {
    test('새 계정으로 마이페이지에 가면 → 전체 판수 0·승률 0.0%와 "전적 없음" 문구가 보임', async ({ user }) => {
        const { page, account } = user;
        await gotoMyPage(page);
        await expect(page.getByText(account.nickname).first()).toBeVisible();
        const summary = page.getByRole('main').getByRole('main');
        await expect(summary).toContainText('전체 판수');
        await expect(summary).toContainText('0');
        await expect(summary).toContainText('승률');
        await expect(summary).toContainText('0.0%');
        await expect(page.getByText('전적 없음')).toBeVisible();
    });

    test('마이페이지 어디에도 → 칭호(지워진 기능) 글자가 안 보임', async ({ user }) => {
        const { page } = user;
        await gotoMyPage(page);
        await expect(page.getByText('칭호')).toHaveCount(0);
        await expect(page.getByText(/평판|명성/)).toHaveCount(0);
    });

    test('계정 관리를 누르면 → 계정 화면으로 가고 닉네임·이메일·비번·탈퇴·Discord 칸이 보임', async ({ user }) => {
        const { page, account } = user;
        await gotoMyPage(page);
        await page.getByRole('button', { name: '계정 관리' }).click();
        await expect(page).toHaveURL(/\/account/);
        for (const name of ['닉네임 변경', '이메일 변경', '비밀번호 변경', '회원 탈퇴', 'Discord 계정 연결']) {
            await expect(page.getByRole('heading', { name })).toBeVisible();
        }
        await expect(page.getByText(`지금 이메일: ${account.email}`)).toBeVisible();
    });

    test('프로필 수정을 누르면 → 사진·테두리 탭이 있는 창이 뜨고 닫기로 닫힘', async ({ user }) => {
        const { page } = user;
        await gotoMyPage(page);
        await page.getByRole('button', { name: '프로필 수정' }).click();
        const dialog = page.getByRole('dialog', { name: '프로필 수정' });
        await expect(dialog.getByRole('tab', { name: '프로필 수정' })).toHaveAttribute('aria-selected', 'true');
        await expect(dialog.getByRole('tab', { name: '테두리 수정' })).toBeVisible();
        await dialog.getByRole('button', { name: '프로필 수정 닫기' }).click();
        await expect(dialog).toBeHidden();
    });

    test('스킨&카드 착용 창 → 직업 탭 다섯 개, 탭을 바꾸면 그 직업 기본 스킨이 착용 중', async ({ user }) => {
        const { page } = user;
        await gotoMyPage(page);
        await page.getByRole('button', { name: '스킨&카드 착용' }).click();
        const dialog = page.getByRole('dialog', { name: '스킨&카드 착용' });
        await expect(dialog.getByRole('tab')).toHaveText(['귀족', '광대', '주치의', '경비원', '마녀사냥꾼']);
        await dialog.getByRole('tab', { name: '경비원' }).click();
        await expect(dialog.getByRole('button', { name: /착용 중/ })).toHaveCount(1);
        await expect(dialog.getByRole('button', { name: '경비원-바이올렛, 미보유' })).toBeDisabled();
    });

    test('한 판을 끝내고 마이페이지에 가면 → 전체 판수가 1이 됨 @game', async ({ user, table }) => {
        const { page } = user;
        const t = await table.setup({ humans: [user], bots: 1, roles: { [user.account.uuid]: 'JOKER' } });
        await ui.readRoleReveal(page);
        await t.advanceUntil((s) => s.phase === 'ENDED' || s.winResult, { stepDelayMs: 800, maxSteps: 30 }).catch(() => {});
        await expect(page).toHaveURL(/\/gameresult/, { timeout: 30000 });
        await gotoMyPage(page);
        await expect(page.getByRole('main').getByRole('main')).toContainText(/전체 판수\s*1/);
    });
});
