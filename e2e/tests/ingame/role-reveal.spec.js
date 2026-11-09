// 본보기(ingame): 2인 판(사람 1 + 봇 방장 1), 역할을 광대로 정해 두고 시작 → 역할 공개 → 단계 넘기기로 바로 낮
const { test, expect, ui } = require('../../helpers/fixtures');

test('광대로 정해 2인 판을 시작하면 → 역할 공개 창에 광대가 보이고, 단계를 넘기면 제 1일 낮이 됨 @game', async ({ user, table }) => {
    const t = await table.setup({
        humans: [user],
        bots: 1,
        roles: { [user.account.uuid]: 'JOKER' },
    });

    expect(await ui.readRoleReveal(user.page)).toBe(ui.ROLE_LABELS.JOKER);
    const me = await t.player(user.account.uuid);
    expect(me.role).toBe('JOKER');

    // 10초 안 기다리고 바로 낮으로
    await t.advanceUntil('DAY');
    await expect(user.page.getByText('제 1일')).toBeVisible();
    await expect(user.page.getByRole('timer')).toBeVisible();
});
