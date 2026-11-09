// 상점 분류(스킨·플레이어 카드·프로필 테두리·인게임 재화·이모티콘) 보기와 고른 상품 설명 칸
const { test, expect } = require('../../helpers/fixtures');
const st = require('./store-tools');

test.describe('상점 분류', () => {
    test('상점에 들어가면 → 스킨 분류가 먼저 골라져 있고 안내 문구·스킨 상품이 보임', async ({ user }) => {
        const { page } = user;
        await st.gotoStore(page);
        const side = page.getByRole('complementary').filter({ has: page.getByRole('heading', { name: '카테고리' }) });
        await expect(side.getByRole('button', { name: '스킨', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByText('해당 스킨은 실제 게임 역할과 상관없습니다.')).toBeVisible();
        await expect(page.getByRole('button', { name: '귀족 블러드 500', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '남작 200', exact: true })).toHaveCount(0);
    });

    test('플레이어 카드를 누르면 → 카드 8개와 사망 상태 미리보기 버튼이 보이고 첫 카드가 골라짐', async ({ user }) => {
        const { page } = user;
        await st.gotoStore(page);
        await st.pickCategory(page, '플레이어 카드');
        await expect(page.getByRole('button', { name: /^(가고일|가면|그레이|모래시계|보석|사슬|악마|왕관) 500$/ })).toHaveCount(8);
        await expect(page.getByRole('button', { name: '사망 상태 미리보기' })).toHaveCount(8);
        await expect(st.detail(page).getByRole('heading', { name: '가고일' })).toBeVisible();
        await expect(st.detail(page)).toContainText('플레이어 카드');
    });

    test('프로필 테두리를 누르면 → 남작~황제 6단계와 가격(200~1000 골드)이 보임', async ({ user }) => {
        const { page } = user;
        await st.gotoStore(page);
        await st.pickCategory(page, '프로필 테두리');
        for (const name of ['남작 200', '자작 300', '백작 400', '후작 500', '공작 700', '황제 1000']) {
            await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
        }
        await expect(st.detail(page)).toContainText('200 골드');
    });

    test('인게임 재화를 누르면 → 다이아 충전 4개·금화 4개, 거래 내역 칸과 새로고침 버튼이 보임', async ({ user }) => {
        const { page } = user;
        await st.gotoStore(page);
        await st.pickCategory(page, '인게임 재화');
        await expect(page.getByRole('button', { name: /^다이아 \d+개/ })).toHaveCount(4);
        await expect(page.getByRole('button', { name: /^금화 \d+개/ })).toHaveCount(4);
        await expect(page.getByRole('region', { name: '재화 거래 내역' })).toBeVisible();
        await expect(page.getByRole('button', { name: '상품 목록 새로고침' })).toBeVisible();
        await expect(page.getByRole('button', { name: '일괄구매' })).toHaveCount(0);
        await expect(st.detail(page)).toContainText('1,100 원');
        await expect(st.detail(page)).toContainText('지급 10 다이아');
        await expect(st.detail(page).getByRole('button', { name: '충전' })).toBeVisible();
    });

    test('이모티콘을 누르면 → 상점 이모티콘 15개만 보이고 기본 지급 이모티콘은 안 보임', async ({ user }) => {
        const { page } = user;
        await st.gotoStore(page);
        await st.pickCategory(page, '이모티콘');
        await expect(page.getByRole('button', { name: '가시박힌 심장 500', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '투표할 시간이야 500', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: /^거절/ })).toHaveCount(0);
        await expect(st.detail(page)).toContainText('이모티콘');
    });

    test('골라진 분류를 한 번 더 누르면 → 분류가 풀리고 모든 상품이 한 목록에 보임', async ({ user }) => {
        const { page } = user;
        await st.gotoStore(page);
        const skin = page.getByRole('complementary').getByRole('button', { name: '스킨', exact: true });
        await skin.click();
        await expect(skin).toHaveAttribute('aria-pressed', 'false');
        await expect(page.getByRole('button', { name: '남작 200', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '가고일 500', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '깜짝 500', exact: true })).toBeVisible();
    });

    test('스킨 전신 보기를 누르면 → 크게 보기 창이 뜨고 닫으면 상점이 그대로 있음', async ({ user }) => {
        const { page } = user;
        await st.gotoStore(page);
        await page.getByRole('button', { name: '광대-카오스 전신 보기' }).click();
        const zoom = page.getByRole('dialog');
        await expect(zoom).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(zoom).toBeHidden();
        await expect(st.detail(page).getByRole('heading', { name: '광대-카오스' })).toBeVisible();
    });

});
