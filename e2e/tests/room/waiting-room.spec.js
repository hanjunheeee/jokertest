// 대기방: 버튼(방장·손님)·준비·준비 풀기·시작 조건·준비 안 된 사람 안내·방장 넘김·나가기·방 삭제
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const h = require('./roomHelpers');

// 사람 방장 방 + 손님 사람 하나 입장
async function hostWithGuest(user, players, settings = {}) {
    const room = await h.createRoomUi(user, { jokers: 1, ...settings });
    const guest = await players.add();
    await ui.joinRoomByCodeUi(guest.page, room.roomCode);
    await h.expectPartyCount(user.page, 2);
    return { room, guest };
}

test.describe('대기방', () => {
    test('방장이 방을 만들면 → 준비완료·게임시작·방 삭제하기 버튼과 방장 버튼 둘이 보임', async ({ user }) => {
        const { page } = user;
        await h.createRoomUi(user);
        for (const name of ['준비완료', '게임시작', '방 삭제하기', '방 설정 변경', '참가자 추방', '초대코드 공유', '친구 초대']) {
            await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
        }
        await expect(page.getByRole('button', { name: '방 나가기' })).toHaveCount(0);
    });

    test('손님이 코드로 들어오면 → 손님에겐 준비완료·방 나가기만 있고 게임시작·방장 버튼이 없음', async ({ user, players }) => {
        const { guest } = await hostWithGuest(user, players);
        const p = guest.page;
        await expect(p.getByRole('button', { name: '준비완료' })).toBeVisible();
        await expect(p.getByRole('button', { name: '방 나가기' })).toBeVisible();
        for (const name of ['게임시작', '방 삭제하기', '방 설정 변경', '참가자 추방']) await expect(p.getByRole('button', { name, exact: true })).toHaveCount(0);
    });

    test('준비완료를 누르면 → 버튼이 준비취소로 바뀌고 서버에도 준비됨', async ({ user, players }) => {
        const { guest } = await hostWithGuest(user, players);
        await ui.readyUi(guest.page);
        await expect(guest.page.getByRole('button', { name: '준비취소' })).toBeVisible();
        await expect.poll(async () => (await e2e.roomOf(user.account.uuid)).players.find((x) => x.uuid === guest.account.uuid)?.isReady).toBe(true);
    });

    test('손님이 준비하면 → 방장 화면에도 준비 완료 실루엣이 하나 생김', async ({ user, players }) => {
        const { guest } = await hostWithGuest(user, players);
        await ui.readyUi(guest.page);
        await expect(h.readySilhouettes(user.page)).toHaveCount(1);
        await expect(user.page.getByRole('img', { name: '준비 전 참가자' })).toHaveCount(1);
    });

    test('준비취소를 누르면 → 다시 준비완료 버튼이 되고 서버에서도 준비가 풀림', async ({ user, players }) => {
        const { guest } = await hostWithGuest(user, players);
        await ui.readyUi(guest.page);
        await guest.page.getByRole('button', { name: '준비취소' }).click();
        await expect(guest.page.getByRole('button', { name: '준비완료' })).toBeVisible();
        await expect.poll(async () => (await e2e.roomOf(user.account.uuid)).players.find((x) => x.uuid === guest.account.uuid)?.isReady).toBe(false);
        await expect(h.readySilhouettes(user.page)).toHaveCount(0);
    });

    test('방장이 혼자(광대 1) 준비하고 게임시작을 누르면 → 인원 조건 안내 창이 뜸', async ({ user }) => {
        const { page } = user;
        await h.createRoomUi(user, { jokers: 1 });
        await ui.readyUi(page);
        await expect(page.getByRole('button', { name: '준비취소' })).toBeVisible();
        await page.getByRole('button', { name: '게임시작' }).click();
        await expect(h.blockedDialog(page)).toContainText('게임을 시작할 수 없습니다');
        await expect(h.blockedDialog(page).getByRole('alert')).toHaveText('게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다.');
        await expect(page).toHaveURL(/\/game-matching/);
    });

    test('손님이 준비 안 했는데 방장이 게임시작을 누르면 → "아직 준비하지 않은 참가자가 있습니다." 안내', async ({ user, players }) => {
        const { page } = user;
        await hostWithGuest(user, players);
        await ui.readyUi(page);
        await expect(page.getByRole('button', { name: '준비취소' })).toBeVisible();
        await page.getByRole('button', { name: '게임시작' }).click();
        await expect(h.blockedDialog(page).getByRole('alert')).toHaveText('아직 준비하지 않은 참가자가 있습니다.');
    });

    test('시작 막힘 안내 창의 확인을 누르면 → 창이 닫히고 대기방 그대로', async ({ user }) => {
        const { page } = user;
        await h.createRoomUi(user, { jokers: 1 });
        await page.getByRole('button', { name: '게임시작' }).click();
        const dialog = h.blockedDialog(page);
        await expect(dialog.getByRole('alert')).toBeVisible();
        await dialog.getByRole('button', { name: '확인' }).click();
        await expect(dialog).toHaveCount(0);
        await expect(page.getByRole('button', { name: '게임시작' })).toBeVisible();
    });

    test('모두 준비하고 방장이 게임시작을 누르면 → 둘 다 인게임 화면으로 감 @game', async ({ user, players }) => {
        const { page } = user;
        const { guest } = await hostWithGuest(user, players);
        await ui.readyUi(guest.page);
        await ui.readyUi(page);
        await expect(page.getByRole('button', { name: '준비취소' })).toBeVisible();
        await expect(h.readySilhouettes(page)).toHaveCount(2);
        await page.getByRole('button', { name: '게임시작' }).click();
        await expect(page).toHaveURL(/\/ingame/, { timeout: 20000 });
        await expect(guest.page).toHaveURL(/\/ingame/, { timeout: 20000 });
        expect((await e2e.gameOf(guest.account.uuid))?.players).toHaveLength(2);
    });

    test('손님이 방 나가기를 누르면 → 손님은 방 목록으로, 방장 화면 인원이 1명으로 줄어듦', async ({ user, players }) => {
        const { guest } = await hostWithGuest(user, players);
        await guest.page.getByRole('button', { name: '방 나가기' }).click();
        await expect(guest.page).toHaveURL(/\/multiplay$/);
        await h.expectPartyCount(user.page, 1);
        expect(await e2e.roomOf(guest.account.uuid)).toBeNull();
    });

    test('방장이 뒤로 가기로 나가면 → 남은 손님이 방장이 되어 게임시작·방장 버튼이 생김', async ({ user, players }) => {
        const { guest } = await hostWithGuest(user, players);
        await user.page.getByRole('button', { name: '멀티플레이 선택으로 돌아가기' }).click();
        await expect(user.page).toHaveURL(/\/multiplay$/);
        await expect(guest.page.getByRole('button', { name: '게임시작' })).toBeVisible();
        await expect(guest.page.getByRole('button', { name: '방 삭제하기' })).toBeVisible();
        await expect(guest.page.getByRole('button', { name: '방 설정 변경' })).toBeVisible();
        await expect.poll(async () => (await e2e.roomOf(guest.account.uuid))?.hostUuid).toBe(guest.account.uuid);
    });

    test('방장이 나가면 → 먼저 들어온 손님이 방장이 됨 (늦게 온 손님은 손님 그대로)', async ({ user, players, bots }) => {
        const { room, guest } = await hostWithGuest(user, players);
        const [late] = await bots.spawn(1);
        await late.joinByCode(room.roomCode);
        await h.expectPartyCount(user.page, 3);
        await user.page.getByRole('button', { name: '멀티플레이 선택으로 돌아가기' }).click();
        await expect.poll(async () => (await e2e.roomOf(guest.account.uuid))?.hostUuid).toBe(guest.account.uuid);
        await expect(guest.page.getByRole('button', { name: '게임시작' })).toBeVisible();
    });

    test('방 삭제 확인 창에서 취소하면 → 방이 그대로 남음', async ({ user }) => {
        const { page } = user;
        await h.createRoomUi(user);
        page.once('dialog', (d) => d.dismiss());
        await page.getByRole('button', { name: '방 삭제하기' }).click();
        await expect(page).toHaveURL(/\/game-matching/);
        expect(await e2e.roomOf(user.account.uuid)).not.toBeNull();
    });

    test('방 삭제를 확인하면 → 방장·손님 모두 방 목록으로 가고 방이 없어짐', async ({ user, players }) => {
        const { guest } = await hostWithGuest(user, players);
        user.page.once('dialog', (d) => d.accept());
        await user.page.getByRole('button', { name: '방 삭제하기' }).click();
        await expect(user.page).toHaveURL(/\/multiplay$/);
        await expect(guest.page).toHaveURL(/\/multiplay$/);
        expect(await e2e.roomOf(user.account.uuid)).toBeNull();
        expect(await e2e.roomOf(guest.account.uuid)).toBeNull();
    });

    test('준비한 손님이 나갔다 다시 들어오면 → 준비가 풀린 채로 들어옴', async ({ user, players }) => {
        const { room, guest } = await hostWithGuest(user, players);
        await ui.readyUi(guest.page);
        await expect(guest.page.getByRole('button', { name: '준비취소' })).toBeVisible();
        await guest.page.getByRole('button', { name: '방 나가기' }).click();
        await expect(guest.page).toHaveURL(/\/multiplay$/);
        await ui.joinRoomByCodeUi(guest.page, room.roomCode);
        await expect(guest.page.getByRole('button', { name: '준비완료' })).toBeVisible();
        await expect(h.readySilhouettes(user.page)).toHaveCount(0);
    });

    test('대기방에서 새로고침하면 → 같은 방에 그대로 있고 파티 인원도 그대로', async ({ user, players }) => {
        await hostWithGuest(user, players);
        await user.page.reload();
        await h.expectPartyCount(user.page, 2);
        await expect(user.page.getByRole('button', { name: '게임시작' })).toBeVisible();
    });
});
