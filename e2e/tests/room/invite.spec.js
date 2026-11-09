// 초대: 친구 초대 창(빈 목록·친구 줄·초대 보내기·닫기), 초대코드 공유 창(코드·복사·닫기)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { E2E } = require('../../helpers/env');
const h = require('./roomHelpers');

const friendDialog = (page) => page.getByRole('dialog', { name: '친구초대' });
const codeDialog = (page) => page.getByRole('dialog', { name: '방코드' });

test.describe('초대', () => {
    test('친구가 없을 때 친구 초대를 누르면 → 창이 열리고 "초대할 친구가 없습니다." 안내', async ({ user }) => {
        await h.createRoomUi(user);
        await user.page.getByRole('button', { name: '친구 초대' }).click();
        await expect(friendDialog(user.page)).toBeVisible();
        await expect(friendDialog(user.page)).toContainText('초대할 친구가 없습니다.');
    });

    test('친구가 있으면 → 친구 초대 창 목록에 그 친구 이름과 초대하기 버튼이 보임', async ({ user, players }) => {
        const friend = await players.add();
        await h.makeFriends(user, friend);
        await h.createRoomUi(user);
        await user.page.getByRole('button', { name: '친구 초대' }).click();
        const list = friendDialog(user.page).getByRole('list', { name: '초대할 친구 목록' });
        await expect(list).toContainText(friend.account.nickname);
        await expect(list.getByRole('button', { name: `${friend.account.nickname} 게임 초대` })).toBeVisible();
    });

    test('친구 초대하기를 누르면 → 친구 쪽 받은 초대 목록에 내 방 초대가 생김', async ({ user, players }) => {
        const friend = await players.add();
        await h.makeFriends(user, friend);
        await h.createRoomUi(user);
        await user.page.getByRole('button', { name: '친구 초대' }).click();
        await friendDialog(user.page).getByRole('button', { name: `${friend.account.nickname} 게임 초대` }).click();
        await expect.poll(async () => {
            const res = await friend.context.request.get(`${E2E.apiUrl}/friends/invites`, { headers: { origin: E2E.desktopUrl } });
            return JSON.stringify(await res.json());
        }, { timeout: 10000 }).toContain(user.account.uuid);
    });

    test('친구 초대 창 닫기를 누르면 → 창이 닫히고 방장 버튼이 다시 보임', async ({ user }) => {
        await h.createRoomUi(user);
        await user.page.getByRole('button', { name: '친구 초대' }).click();
        await expect(friendDialog(user.page)).toBeVisible();
        await user.page.getByRole('button', { name: '친구 초대 닫기' }).last().click();
        await expect(friendDialog(user.page)).toHaveCount(0);
        await expect(user.page.getByRole('button', { name: '방 설정 변경' })).toBeVisible();
    });

    test('초대코드 공유를 누르면 → 방코드 창에 이 방 코드 여섯 글자가 보임', async ({ user }) => {
        const room = await h.createRoomUi(user);
        await user.page.getByRole('button', { name: '초대코드 공유' }).click();
        const dialog = codeDialog(user.page);
        await expect(dialog).toBeVisible();
        const code = await dialog.getByRole('textbox').evaluateAll((els) => els.map((e) => e.value).join(''));
        expect(code).toBe(room.roomCode);
    });

    test('방코드 복사를 누르면 → 버튼이 "복사됨"이 되고 클립보드에 코드가 들어감', async ({ user }) => {
        await user.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: E2E.desktopUrl });
        const room = await h.createRoomUi(user);
        await user.page.getByRole('button', { name: '초대코드 공유' }).click();
        await codeDialog(user.page).getByRole('button', { name: '방코드 복사' }).click();
        await expect(codeDialog(user.page).getByRole('button', { name: '방코드 복사됨' })).toBeVisible();
        expect(await user.page.evaluate(() => navigator.clipboard.readText())).toBe(room.roomCode);
    });

    test('방코드 창 닫기 버튼을 누르면 → 창이 닫힘', async ({ user }) => {
        await h.createRoomUi(user);
        await user.page.getByRole('button', { name: '초대코드 공유' }).click();
        await user.page.getByRole('button', { name: '방코드 팝업 닫기' }).click();
        await expect(codeDialog(user.page)).toHaveCount(0);
    });

});
