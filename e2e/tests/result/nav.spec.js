// 결과 화면 버튼·다시 들어오기: 로비로·대기방으로(봇 방장 판)·새로고침하면 결과 없음 안내·로비로 돌아가기
const { test, expect, e2e } = require('../../helpers/fixtures');
const h = require('../room/roomHelpers');

test.describe('결과 화면 이동 @game', () => {
    test('로비로를 누르면 → 로비 화면으로 감', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerWin' });
        user.page.once('dialog', (d) => d.accept()); // 나가기 확인 창
        await user.page.getByRole('button', { name: '로비로' }).click();
        await expect(user.page).toHaveURL(/\/lobby$/);
        await expect(user.page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
    });

    test('로비로 간 뒤에는 → 판에도 방에도 없음', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerLose' });
        user.page.once('dialog', (d) => d.accept()); // 나가기 확인 창
        await user.page.getByRole('button', { name: '로비로' }).click();
        await expect(user.page).toHaveURL(/\/lobby$/);
        await expect.poll(async () => e2e.gameOf(user.account.uuid)).toBeNull();
        expect(await e2e.roomOf(user.account.uuid)).toBeNull();
    });

    test('봇이 방장인 판에서 대기방으로를 누르면 → 방장 새 방을 기다리는 대기방 화면으로 감', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerWin' });
        await user.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(user.page).toHaveURL(/\/game-matching/);
        await expect(user.page.getByText('방장이 새 방을 만드는 중입니다. 잠시만 기다려 주세요.')).toBeVisible();
        await expect(user.page.getByText('파티 인원 0명')).toBeVisible();
    });

    test('방장 새 방을 기다리다 방 나가기를 누르면 → 방 목록 화면으로 감', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerWin' });
        await user.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(user.page.getByText('방장이 새 방을 만드는 중입니다. 잠시만 기다려 주세요.')).toBeVisible();
        await user.page.getByRole('button', { name: '방 나가기' }).click();
        await expect(user.page).toHaveURL(/\/multiplay$/);
    });

    test('봇 방장이 다음 방을 만들면 → 기다리던 나도 그 방에 들어감', async ({ user, table }) => {
        const { t } = await h.playToResult({ user, table, kind: 'jokerWin' });
        await user.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(user.page.getByText('방장이 새 방을 만드는 중입니다. 잠시만 기다려 주세요.')).toBeVisible();
        await t.bots[0].createRoom({ maxPlayers: 6 });
        await h.expectPartyCount(user.page, 2);
        expect((await e2e.roomOf(user.account.uuid))?.hostUuid).toBe(t.bots[0].uuid);
    });

    test('결과 화면에서 새로고침하면 → "게임 결과를 확인할 수 없습니다" 안내가 뜸', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerWin' });
        await user.page.reload();
        await expect(user.page.getByRole('alert')).toHaveText('게임 결과를 확인할 수 없습니다', { timeout: 15000 });
        await expect(user.page.getByText('새로고침 등으로 그 값이 사라졌거나')).toBeVisible();
    });

    test('새로고침 뒤 로비로 돌아가기를 누르면 → 로비로 감', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerLose' });
        await user.page.reload();
        await user.page.getByRole('button', { name: '로비로 돌아가기' }).click({ timeout: 15000 });
        await expect(user.page).toHaveURL(/\/lobby$/);
    });

    test('결과 화면에서 로비로 갔다가 결과 주소로 다시 오면 → 결과 대신 안내가 뜸', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerWin' });
        user.page.once('dialog', (d) => d.accept()); // 나가기 확인 창
        await user.page.getByRole('button', { name: '로비로' }).click();
        await expect(user.page).toHaveURL(/\/lobby$/);
        await user.page.goto('/gameresult');
        await expect(user.page.getByRole('alert')).toHaveText('게임 결과를 확인할 수 없습니다', { timeout: 15000 });
    });

    test('결과 화면이 뜬 뒤 브라우저 뒤로 가기를 해도 → 인게임 화면에 갇히지 않음', async ({ user, table }) => {
        await h.playToResult({ user, table, kind: 'jokerWin' });
        await user.page.goBack().catch(() => {});
        await expect(user.page).not.toHaveURL(/\/ingame/, { timeout: 15000 });
    });

    test('같은 판 사람 둘이 각자 로비로를 누르면 → 둘 다 로비로 감', async ({ user, table, players }) => {
        const other = await players.add();
        await h.playToResult({ user, table, kind: 'jokerWin', extraHumans: [other] });
        await h.waitResult(other.page);
        user.page.once('dialog', (d) => d.accept()); // 나가기 확인 창
        await user.page.getByRole('button', { name: '로비로' }).click();
        other.page.once('dialog', (d) => d.accept()); // 나가기 확인 창
        await other.page.getByRole('button', { name: '로비로' }).click();
        await expect(user.page).toHaveURL(/\/lobby$/);
        await expect(other.page).toHaveURL(/\/lobby$/);
    });
});
