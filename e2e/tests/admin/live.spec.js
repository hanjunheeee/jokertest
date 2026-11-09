// 관리자 열린 방·판 브라우저 시험 (AD-252): 플레이어(봇)가 방을 만들면 열린 방 목록에 그 방 코드가 보임
// 프로젝트 admin (1280×800), 다른 시험 방도 섞여 있어 "내 방 코드가 있는지"로 봄
const { test, expect } = require('../../helpers/fixtures');
const { createAdmin, loginAsAdmin } = require('../../helpers/adminAccounts');

test.describe('관리자 열린 방·판', () => {
    test('AD-252: 방 만들면 목록에 보임 (인원·최대 인원)', async ({ page, bots }) => {
        await loginAsAdmin(page, await createAdmin());
        const [host] = await bots.spawn(1);
        const room = await host.createRoom({});
        expect(room.roomCode).toBeTruthy();

        await page.goto('/live');
        await expect(page.getByRole('heading', { name: '열린 방·판', level: 1 })).toBeVisible();
        const rooms = page.getByRole('table', { name: '대기방' });
        await expect(rooms.getByRole('row').filter({ hasText: room.roomCode })).toHaveCount(1);
        await expect(rooms.getByRole('row').filter({ hasText: room.roomCode })).toContainText('1 / 5명');
    });
});
