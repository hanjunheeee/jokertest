// 강퇴: 방장만·대상 목록(나 빼고)·확인/취소·강퇴되면 방 목록으로·실패 안내 문구·강퇴된 사람 다시 입장(3번째부터 막힘)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const h = require('./roomHelpers');

const kickDialog = (page) => page.getByRole('dialog', { name: '플레이어 추방' });

async function openKick(page) {
    await page.getByRole('button', { name: '참가자 추방' }).click();
    await expect(kickDialog(page)).toBeVisible();
}

// 방장 + 손님 사람
async function roomWithGuest(user, players) {
    const room = await h.createRoomUi(user, { jokers: 1 });
    const guest = await players.add();
    await ui.joinRoomByCodeUi(guest.page, room.roomCode);
    await h.expectPartyCount(user.page, 2);
    return { room, guest };
}

// 목록에서 이름 줄의 추방 버튼 → 확인 창
async function pickTarget(page, nickname) {
    const row = kickDialog(page).getByRole('listitem').filter({ hasText: nickname });
    await row.getByRole('button', { name: '추방' }).click();
    await expect(page.getByTestId('kick-confirm')).toBeVisible();
    await expect(page.getByTestId('kick-confirm-target')).toHaveText(nickname);
}

test.describe('강퇴', () => {
    test('방장이 참가자 추방을 누르면 → 창 목록에 손님만 있고 나는 없음', async ({ user, players }) => {
        const { guest } = await roomWithGuest(user, players);
        await openKick(user.page);
        const list = kickDialog(user.page).getByRole('list', { name: '추방 대상 플레이어 목록' });
        await expect(list.getByRole('listitem')).toHaveCount(1);
        await expect(list).toContainText(guest.account.nickname);
        await expect(list).not.toContainText(user.account.nickname);
    });

    test('혼자 있는 방에서 추방 창을 열면 → "추방할 수 있는 참가자가 없습니다." 안내', async ({ user }) => {
        await h.createRoomUi(user);
        await openKick(user.page);
        await expect(user.page.getByTestId('kick-empty-targets')).toHaveText('추방할 수 있는 참가자가 없습니다.');
    });

    test('추방 버튼을 누르면 → 대상 이름이 든 확인 창이 뜨고 아직 안 쫓겨남', async ({ user, players }) => {
        const { guest } = await roomWithGuest(user, players);
        await openKick(user.page);
        await pickTarget(user.page, guest.account.nickname);
        expect((await e2e.roomOf(user.account.uuid)).players).toHaveLength(2);
    });

    test('확인 창에서 취소하면 → 확인 창만 닫히고 손님은 그대로', async ({ user, players }) => {
        const { guest } = await roomWithGuest(user, players);
        await openKick(user.page);
        await pickTarget(user.page, guest.account.nickname);
        await user.page.getByTestId('kick-confirm-cancel').click();
        await expect(user.page.getByTestId('kick-confirm')).toHaveCount(0);
        await expect(guest.page).toHaveURL(/\/game-matching/);
    });

    test('확인 창에서 추방을 누르면 → 손님은 방 목록 화면으로 밀려나고 방장 인원이 1명', async ({ user, players }) => {
        const { guest } = await roomWithGuest(user, players);
        await openKick(user.page);
        await pickTarget(user.page, guest.account.nickname);
        await user.page.getByTestId('kick-confirm-accept').click();
        await expect(guest.page).toHaveURL(/\/multiplay$/);
        await expect.poll(async () => (await e2e.roomOf(user.account.uuid)).players.length).toBe(1);
        expect(await e2e.roomOf(guest.account.uuid)).toBeNull();
    });

    test('봇 손님을 추방하면 → 봇에게 room_kicked 알림이 감', async ({ user, bots }) => {
        const room = await h.createRoomUi(user, { jokers: 1 });
        const [b] = await bots.spawn(1);
        await b.joinByCode(room.roomCode);
        await h.expectPartyCount(user.page, 2);
        await openKick(user.page);
        await pickTarget(user.page, b.nickname);
        await user.page.getByTestId('kick-confirm-accept').click();
        const ev = await b.waitForEvent('room_kicked');
        expect(ev.targetUuid).toBe(b.uuid);
    });

    test('손님이 추방 요청을 보내면(봇) → "방장만 추방할 수 있습니다." 거절', async ({ user, bots }) => {
        const room = await h.createRoomUi(user, { jokers: 1 });
        const [b] = await bots.spawn(1);
        const joined = await b.joinByCode(room.roomCode);
        const seat = (uuid) => joined.players.find((p) => p.uuid === uuid)?.membershipId;
        const reply = await b.request('kick_room_player', {
            requestId: require('node:crypto').randomUUID(), bootEpoch: joined.bootEpoch, roomId: joined.roomId,
            roomInstanceId: joined.roomInstanceId, requesterMembershipId: seat(b.uuid),
            targetUuid: user.account.uuid, targetMembershipId: seat(user.account.uuid),
        });
        expect(reply.message, JSON.stringify(reply)).toBe('방장만 추방할 수 있습니다.');
        expect(reply.ok).toBe(false);
    });

    test('확인 창이 떠 있는 사이 대상이 스스로 나가면 → 추방을 눌러도 실패 안내 문구가 뜸', async ({ user, bots }) => {
        const room = await h.createRoomUi(user, { jokers: 1 });
        const [b] = await bots.spawn(1);
        await b.joinByCode(room.roomCode);
        await h.expectPartyCount(user.page, 2);
        await openKick(user.page);
        await pickTarget(user.page, b.nickname);
        b.emit('leave_room');
        await expect.poll(async () => (await e2e.roomOf(user.account.uuid)).players.length).toBe(1);
        const accept = user.page.getByTestId('kick-confirm-accept');
        if (await accept.isVisible().catch(() => false)) {
            await accept.click();
            await expect(user.page.getByTestId('kick-error').or(user.page.getByTestId('kick-unknown'))).toBeVisible();
            await expect(user.page.getByTestId('kick-error')).toHaveText(/이미 게임을 떠난 플레이어입니다|추방하지 못했습니다/);
        } else {
            // 목록이 먼저 바뀌어 확인 창이 닫힌 경우: 빈 목록 안내
            await expect(user.page.getByTestId('kick-empty-targets')).toBeVisible();
        }
    });

    // 규칙(사용자 결정 2026-11-09): 쫓겨나도 다시 들어올 수 있음, 같은 방에서 3번째 추방부터 그 방 못 들어옴
    test('추방된 사람은 1·2번째엔 같은 코드로 다시 들어오고, 3번째 추방 뒤엔 "3번 추방" 안내와 함께 못 들어옴', async ({ user, players }) => {
        const { room, guest } = await roomWithGuest(user, players);
        const kickGuest = async () => {
            await openKick(user.page);
            await pickTarget(user.page, guest.account.nickname);
            await user.page.getByTestId('kick-confirm-accept').click();
            await expect(guest.page).toHaveURL(/\/multiplay$/);
            await expect.poll(async () => (await e2e.roomOf(user.account.uuid)).players.length).toBe(1);
        };

        // 1·2번째 추방 뒤엔 다시 들어옴
        for (let round = 1; round <= 2; round += 1) {
            await kickGuest();
            await ui.joinRoomByCodeUi(guest.page, room.roomCode);
            await h.expectPartyCount(user.page, 2);
        }

        // 3번째 추방 뒤엔 거절 안내
        await kickGuest();
        await guest.page.goto('/roomInvite');
        await guest.page.getByRole('textbox', { name: /방 코드/ }).first().click();
        await guest.page.keyboard.type(room.roomCode);
        const dialog = guest.page.waitForEvent('dialog', { timeout: 8000 }).then(async (d) => { const m = d.message(); await d.accept(); return m; }).catch(() => null);
        await guest.page.getByRole('button', { name: '참여하기' }).click();
        expect(await dialog).toBe('이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다.');
        expect(await e2e.roomOf(guest.account.uuid)).toBeNull();
    });
});
