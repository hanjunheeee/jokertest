// 본보기(store): 토스 결제창 열고 닫기만 (시험 키, 카드 입력·결제 완료 안 함)
const { test, expect } = require('../../helpers/fixtures');
const toss = require('../../helpers/toss');

test('다이아 10개를 충전하면 → 토스 결제창이 뜨고, 닫으면 상점으로 돌아옴', async ({ user }) => {
    const { page } = user;
    await toss.openTossWindow(page);
    await toss.closeTossWindow(page);
    await expect(page).toHaveURL(/\/store/);
    await expect(page.getByRole('button', { name: '인게임 재화' })).toBeVisible();
});
