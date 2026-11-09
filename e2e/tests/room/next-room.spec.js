// 다음 판 방: 판 끝난 뒤 결과 화면 "대기방으로" → 방장은 새 방, 같이 한 사람은 그 방으로 (파티로 대기방 돌아가기)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const h = require('./roomHelpers');

// 사람 방장(광대) + 사람 손님(시민) 2인 판을 끝내고 둘 다 결과 화면까지
async function finishedParty(user, players) {
    const guest = await players.add();
    const t = await h.hostGame({
        host: user, guests: [guest],
        roles: { [user.account.uuid]: 'JOKER', [guest.account.uuid]: 'CITIZEN' },
    });
    await h.closeReveals([user.page, guest.page]);
    await h.finishGame(t);
    await h.waitResult(user.page);
    await h.waitResult(guest.page);
    return { t, guest };
}

test.describe('다음 판 방', () => {
    test('방장이 결과 화면에서 대기방으로를 누르면 → 새 대기방이 생기고 내가 방장 @game', async ({ user, players }) => {
        const { t } = await finishedParty(user, players);
        await user.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(user.page).toHaveURL(/\/game-matching/);
        await expect(user.page.getByRole('button', { name: '게임시작' })).toBeVisible();
        const room = await h.waitRoom(user.account.uuid);
        expect(room.hostUuid).toBe(user.account.uuid);
        expect(room.roomId).not.toBe(t.room.roomId);
    });

    test('손님이 먼저 대기방으로를 누르면 → "방장이 새 방을 만드는 중입니다" 기다림 문구 @game', async ({ user, players }) => {
        const { guest } = await finishedParty(user, players);
        await guest.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(guest.page).toHaveURL(/\/game-matching/);
        await expect(guest.page.getByText('방장이 새 방을 만드는 중입니다. 잠시만 기다려 주세요.')).toBeVisible();
        await expect(guest.page.getByRole('button', { name: '준비완료' })).toBeDisabled();
    });

    test('손님이 기다리는 중에 방장이 새 방을 만들면 → 손님이 그 방으로 같이 들어가 파티 인원 2명 @game', async ({ user, players }) => {
        const { guest } = await finishedParty(user, players);
        await guest.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(guest.page.getByText('방장이 새 방을 만드는 중입니다. 잠시만 기다려 주세요.')).toBeVisible();
        await user.page.getByRole('button', { name: '대기방으로' }).click();
        await h.expectPartyCount(user.page, 2);
        await h.expectPartyCount(guest.page, 2);
        await expect(guest.page.getByRole('button', { name: '방 나가기' })).toBeVisible();
        expect((await e2e.roomOf(guest.account.uuid))?.hostUuid).toBe(user.account.uuid);
    });

    test('방장이 먼저 새 방을 만들고 손님이 나중에 대기방으로를 누르면 → 손님도 그 방에 있음 @game', async ({ user, players }) => {
        const { guest } = await finishedParty(user, players);
        await user.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(user.page).toHaveURL(/\/game-matching/);
        await guest.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(guest.page).toHaveURL(/\/game-matching/);
        await h.expectPartyCount(guest.page, 2);
    });

    test('다음 판 방에서 둘 다 준비하고 시작하면 → 새 판이 시작됨 @game', async ({ user, players }) => {
        const { t, guest } = await finishedParty(user, players);
        await user.page.getByRole('button', { name: '대기방으로' }).click();
        await guest.page.getByRole('button', { name: '대기방으로' }).click();
        await h.expectPartyCount(user.page, 2);
        await h.expectPartyCount(guest.page, 2);
        // 다음 판 방은 처음 값(광대 2)이라 2명으론 못 시작 → 광대 1로 바꾼 뒤 시작
        await user.page.getByRole('button', { name: '방 설정 변경' }).click();
        await h.fillSettings(user.page, { jokers: 1 });
        await user.page.getByRole('button', { name: '설정 저장' }).click();
        await h.waitRoom(user.account.uuid, (r) => r.settings.jokerCount === 1);
        await ui.readyUi(guest.page);
        await expect(guest.page.getByRole('button', { name: '준비취소' })).toBeVisible();
        await ui.readyUi(user.page);
        await expect(h.readySilhouettes(user.page)).toHaveCount(2);
        await user.page.getByRole('button', { name: '게임시작' }).click();
        await expect(user.page).toHaveURL(/\/ingame/, { timeout: 20000 });
        await expect(guest.page).toHaveURL(/\/ingame/, { timeout: 20000 });
        expect((await e2e.gameOf(user.account.uuid))?.gameId).not.toBe(t.gameId);
    });
});
