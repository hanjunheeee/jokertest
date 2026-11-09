// 본보기(result): 2인 판(나 광대 + 봇 시민)에서 내가 밤에 봇을 죽이면 → 판이 끝나고 결과 화면
const { test, expect, ui } = require('../../helpers/fixtures');

test('광대인 내가 이기는 판이 끝나면 → 결과 화면으로 감 @game', async ({ user, table }) => {
    const t = await table.setup({ humans: [user], bots: 1, roles: { [user.account.uuid]: 'JOKER' } });
    await ui.readRoleReveal(user.page);
    // 봇은 아무 행동 안 함, 단계만 넘겨 승부 날 때까지 (광대 1 : 시민 1이면 낮·밤 어딘가에서 끝남)
    await t.advanceUntil((s) => s.phase === 'ENDED' || s.winResult, { stepDelayMs: 800, maxSteps: 30 }).catch(() => {});
    await expect(user.page).toHaveURL(/\/gameresult/, { timeout: 30000 });
});
