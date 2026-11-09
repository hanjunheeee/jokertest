// 본보기(room): 화면으로 방 만들기 → 대기방, 서버에도 방이 생김
const { test, expect, e2e } = require('../../helpers/fixtures');

test('방 찾기 → 방 만들기 → 게임 만들기를 누르면 → 대기방으로 가고 방 코드가 생김', async ({ user }) => {
    const { page, account } = user;
    await page.getByRole('button', { name: '게임플레이' }).click();
    await page.getByRole('button', { name: '방 찾기' }).click();
    await expect(page).toHaveURL(/\/multiplay$/);
    await page.getByRole('button', { name: '방 만들기' }).click();
    await expect(page).toHaveURL(/\/game-setup$/);
    await page.getByRole('button', { name: '게임 만들기' }).click();
    await expect(page).toHaveURL(/\/game-matching/);
    await expect(page.getByRole('button', { name: '준비완료' }).or(page.getByRole('button', { name: /시작/ })).first()).toBeVisible();

    const room = await e2e.roomOf(account.uuid);
    expect(room?.hostUuid).toBe(account.uuid);
    expect(room?.roomCode).toMatch(/^[A-Z0-9]{6}$/);
});
