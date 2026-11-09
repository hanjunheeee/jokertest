// 대기방 설정 바꾸기: 방장만·편집 창(못 바꾸는 칸 숨김)·저장하면 전원 준비 풀림·같은 값 저장은 안 풀림·정원 줄이기 거절·취소
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const h = require('./roomHelpers');

const editDialog = (page) => page.getByRole('dialog', { name: '방 설정 변경' });

async function openEdit(page) {
    await page.getByRole('button', { name: '방 설정 변경' }).click();
    await expect(editDialog(page)).toBeVisible();
    await expect(page.getByRole('button', { name: '설정 저장' })).toBeVisible();
}

// 방장 + 준비한 손님(사람)
async function readyRoom(user, players, settings = {}) {
    const room = await h.createRoomUi(user, { jokers: 1, ...settings });
    const guest = await players.add();
    await ui.joinRoomByCodeUi(guest.page, room.roomCode);
    await ui.readyUi(guest.page);
    await expect(guest.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await ui.readyUi(user.page);
    await expect(h.readySilhouettes(user.page)).toHaveCount(2);
    return { room, guest };
}

test.describe('대기방 설정 바꾸기', () => {
    test('방장이 방 설정 변경을 누르면 → 편집 창이 지금 방 값(광대 1)으로 열림', async ({ user }) => {
        await h.createRoomUi(user, { jokers: 1, maxPlayers: 8 });
        await openEdit(user.page);
        expect(await h.stepperValue(user.page, '최대 플레이어 수')).toBe('8');
        expect(await h.stepperValue(user.page, '광대(마피아) 플레이어 수')).toBe('1');
    });

    test('편집 창에서는 → 방 만든 뒤 못 바꾸는 칸(불 꺼진 무도회·영혼의 베팅·투표 공개)이 안 보임', async ({ user }) => {
        const { page } = user;
        await h.createRoomUi(user);
        await openEdit(page);
        await expect(page.getByRole('checkbox', { name: '불이 꺼진 무도회' })).toHaveCount(0);
        await expect(page.getByRole('checkbox', { name: '영혼의 베팅 활성화' })).toHaveCount(0);
        await h.selectTab(page, '회의&투표');
        await expect(page.getByRole('checkbox', { name: '투표 공개 여부' })).toHaveCount(0);
    });

    test('손님 화면에는 → 방 설정 변경 버튼이 없음', async ({ user, players }) => {
        const { guest } = await readyRoom(user, players);
        await expect(guest.page.getByRole('button', { name: '방 설정 변경' })).toHaveCount(0);
    });

    test('편집 창에서 취소를 누르면 → 창이 닫히고 설정·준비 그대로', async ({ user, players }) => {
        const { page } = user;
        await readyRoom(user, players);
        await openEdit(page);
        await h.fillSettings(page, { discussion: 150 });
        await page.getByRole('button', { name: '설정 변경 취소' }).click();
        await expect(editDialog(page)).toHaveCount(0);
        const room = await e2e.roomOf(user.account.uuid);
        expect(room.settings.dayDiscussionTime).toBe(60);
        expect(room.players.every((p) => p.isReady)).toBe(true);
    });

    test('값을 바꿔 저장하면 → 서버 설정이 바뀌고 설정 버전이 오름', async ({ user }) => {
        const before = await h.createRoomUi(user, { jokers: 1 });
        await openEdit(user.page);
        await h.fillSettings(user.page, { discussion: 90, night: 60 });
        await user.page.getByRole('button', { name: '설정 저장' }).click();
        await expect(editDialog(user.page)).toHaveCount(0);
        const after = await h.waitRoom(user.account.uuid, (r) => r.settingsVersion > before.settingsVersion);
        expect(after.settings).toMatchObject({ dayDiscussionTime: 90, nightActionTime: 60 });
    });

    test('설정을 바꿔 저장하면 → 준비했던 사람 모두 준비가 풀림 (손님 버튼도 준비완료로)', async ({ user, players }) => {
        const { guest } = await readyRoom(user, players);
        await openEdit(user.page);
        await h.fillSettings(user.page, { vote: 90 });
        await user.page.getByRole('button', { name: '설정 저장' }).click();
        await expect(editDialog(user.page)).toHaveCount(0);
        await expect(h.readySilhouettes(user.page)).toHaveCount(0);
        await expect(guest.page.getByRole('button', { name: '준비완료' })).toBeVisible();
        await expect(user.page.getByRole('button', { name: '준비완료' })).toBeVisible();
        expect((await e2e.roomOf(user.account.uuid)).players.some((p) => p.isReady)).toBe(false);
    });

    test('아무것도 안 바꾸고 저장하면 → 준비가 그대로 남고 설정 버전도 그대로', async ({ user, players }) => {
        const { room } = await readyRoom(user, players);
        const before = await e2e.roomOf(user.account.uuid);
        await openEdit(user.page);
        await user.page.getByRole('button', { name: '설정 저장' }).click();
        await expect(editDialog(user.page)).toHaveCount(0);
        await expect(h.readySilhouettes(user.page)).toHaveCount(2);
        const after = await e2e.roomOf(user.account.uuid);
        expect(after.settingsVersion).toBe(before.settingsVersion);
        expect(after.players.every((p) => p.isReady)).toBe(true);
        void room;
    });

    test('재판 시간만 바꿔 저장하면 → 서버 재판 시간이 바뀌고 준비가 풀림', async ({ user, players }) => {
        await readyRoom(user, players);
        await openEdit(user.page);
        await h.fillSettings(user.page, { tribunal: 30 });
        await user.page.getByRole('button', { name: '설정 저장' }).click();
        const after = await h.waitRoom(user.account.uuid, (r) => r.settings.tribunalTime === 30);
        expect(after.players.some((p) => p.isReady)).toBe(false);
    });

    test('정원을 지금 인원보다 적게 줄여 저장하면 → "현재 인원(N명)보다 적은 정원으로는 변경할 수 없습니다." 안내', async ({ user, bots }) => {
        const room = await h.createRoomUi(user, { jokers: 1 });
        const list = await bots.spawn(5);
        for (const b of list) await b.joinByCode(room.roomCode);
        await h.expectPartyCount(user.page, 6);
        await openEdit(user.page);
        await h.fillSettings(user.page, { maxPlayers: 5 });
        await user.page.getByRole('button', { name: '설정 저장' }).click();
        await expect(editDialog(user.page).getByRole('alert')).toHaveText('현재 인원(6명)보다 적은 정원으로는 변경할 수 없습니다.');
        expect((await e2e.roomOf(user.account.uuid)).settings.maxPlayers).toBe(10);
    });

    test('직접 지정으로 바꿔 저장하면 → 서버 방이 custom 구성으로 바뀜', async ({ user }) => {
        await h.createRoomUi(user, { jokers: 1, maxPlayers: 6 });
        await openEdit(user.page);
        await h.fillSettings(user.page, { custom: { JOKER: 1, GUARD: 1 } });
        await user.page.getByRole('button', { name: '설정 저장' }).click();
        const after = await h.waitRoom(user.account.uuid, (r) => r.settings.roleCompositionMode === 'custom');
        expect(after.settings.roleCounts).toMatchObject({ JOKER: 1, GUARD: 1, DOCTOR: 0 });
    });

    test('손님이 옛 설정 버전으로 준비를 보내면(봇) → 설정 바뀜 거절을 받음', async ({ user, bots }) => {
        const room = await h.createRoomUi(user, { jokers: 1 });
        const [b] = await bots.spawn(1);
        await b.joinByCode(room.roomCode);
        await openEdit(user.page);
        await h.fillSettings(user.page, { discussion: 90 });
        await user.page.getByRole('button', { name: '설정 저장' }).click();
        await h.waitRoom(user.account.uuid, (r) => r.settingsVersion > room.settingsVersion);
        const reply = await b.setReady(room.roomId, room.settingsVersion);
        expect(reply.ok).toBe(false);
        expect(reply.code).toBe('SETTINGS_VERSION_CONFLICT');
    });

    test('방장이 아닌 사람이 설정 바꾸기를 보내면(봇) → "방장만 설정을 변경할 수 있습니다." 거절', async ({ user, bots }) => {
        const room = await h.createRoomUi(user, { jokers: 1 });
        const [b] = await bots.spawn(1);
        await b.joinByCode(room.roomCode);
        const reply = await h.botUpdateSettings(b, { dayDiscussionTime: 30 });
        expect(reply.ok).toBe(false);
        expect(reply.message).toBe('방장만 설정을 변경할 수 있습니다.');
    });
});
