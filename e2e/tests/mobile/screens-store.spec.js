// 모바일 상점 (375×812 세로): 탭 다섯·아이템 고르기·골드 없이 구매·쿠폰 창·전신 보기, 가로 넘침 없음
const { test, expect } = require('../../helpers/fixtures');
const { overflowX } = require('./_talk');

const TABS = ['스킨', '플레이어 카드', '프로필 테두리', '인게임 재화', '이모티콘'];
const tabButton = (page, name) => page.getByRole('complementary').filter({ has: page.getByRole('button', { name: '스킨' }) }).getByRole('button', { name, exact: true });

test.describe('모바일 상점', () => {
    test('상점에 들어가면 → 스킨 탭이 눌린 채 탭 다섯이 보이고 가로로 안 넘침', async ({ user }) => {
        await user.page.goto('/store');
        for (const name of TABS) await expect(tabButton(user.page, name)).toBeVisible();
        await expect(tabButton(user.page, '스킨')).toHaveAttribute('aria-pressed', 'true');
        expect(await overflowX(user.page)).toBeLessThanOrEqual(0);
    });

    test('상점 탭마다 눌러 봐도 → 눌린 탭이 바뀌고 화면이 가로로 안 넘침', async ({ user }) => {
        await user.page.goto('/store');
        for (const name of TABS.slice(1)) {
            await tabButton(user.page, name).click();
            await expect(tabButton(user.page, name)).toHaveAttribute('aria-pressed', 'true');
            expect(await overflowX(user.page), name).toBeLessThanOrEqual(0);
        }
    });

    test('다른 스킨을 누르면 → 아래 "선택한 아이템 정보" 제목이 그 스킨으로 바뀜', async ({ user }) => {
        await user.page.goto('/store');
        await user.page.getByRole('button', { name: '광대 불멸 500' }).click();
        const info = user.page.getByRole('region', { name: '선택한 아이템 정보' });
        await expect(info.getByRole('heading', { name: '광대-불멸' })).toBeVisible();
        await expect(user.page.getByRole('button', { name: '광대 불멸 500' })).toHaveAttribute('aria-pressed', 'true');
    });

    test('골드 0인 새 계정이 500골드 스킨을 구매하면 → 산 것이 안 되고 안내가 뜸', async ({ user }) => {
        await user.page.goto('/store');
        const info = user.page.getByRole('region', { name: '선택한 아이템 정보' });
        await info.getByRole('button', { name: '구매' }).click();
        const notice = user.page.getByRole('dialog').or(user.page.getByRole('alertdialog')).or(user.page.getByRole('alert')).first();
        await expect(notice).toBeVisible({ timeout: 10000 });
        await expect(notice).toContainText(/부족|골드|구매/);
    });

    test('"쿠폰"을 누르면 → 쿠폰 입력 창이 375 폭 안에 열림', async ({ user }) => {
        await user.page.goto('/store');
        await user.page.getByRole('button', { name: '쿠폰' }).click();
        const dialog = user.page.getByRole('dialog').last();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('textbox').first()).toBeVisible();
        const box = await dialog.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(375);
    });

    test('스킨 "전신 보기"를 누르면 → 크게 보는 창이 열리고 닫을 수 있음', async ({ user }) => {
        await user.page.goto('/store');
        await user.page.getByRole('button', { name: '경비원-바이올렛 전신 보기' }).click();
        const dialog = user.page.getByRole('dialog').last();
        await expect(dialog).toBeVisible();
        await user.page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
    });

    test('상점 이모티콘 탭엔 → 기본 지급 이모티콘은 숨겨지고 파는 이모티콘이 보임', async ({ user }) => {
        await user.page.goto('/store');
        await tabButton(user.page, '이모티콘').click();
        await expect(user.page.getByRole('button', { name: /가시박힌 심장/ }).first()).toBeVisible();
        await expect(user.page.getByRole('button', { name: /^안녕/ })).toHaveCount(0);
    });
});
