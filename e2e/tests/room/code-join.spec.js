// 코드 입장: 맞는 코드·소문자·붙여넣기·틀린 코드·꽉 참·진행 중·6자 미만·취소
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const h = require('./roomHelpers');

// 코드 입력 화면에서 글자 치기 (참여하기는 안 누름)
async function typeCode(page, code) {
    await page.goto('/roomInvite');
    const first = page.getByRole('textbox', { name: /방 코드/ }).first();
    await first.click();
    await page.keyboard.type(code);
}

// 참여하기 누르고 뜬 알림 문구
async function joinAlert(page) {
    return ui.captureAlert(page, () => page.getByRole('button', { name: '참여하기' }).click({ noWaitAfter: true }));
}

test.describe('코드 입장', () => {
    test('맞는 코드를 넣고 참여하기를 누르면 → 그 방 대기방으로 들어감', async ({ user, bots }) => {
        const [b] = await bots.spawn(1);
        const room = await b.createRoom({ maxPlayers: 6 });
        await ui.joinRoomByCodeUi(user.page, room.roomCode);
        await h.expectPartyCount(user.page, 2);
        expect((await e2e.roomOf(user.account.uuid))?.roomId).toBe(room.roomId);
    });

    test('코드를 소문자로 치면 → 칸에 대문자로 바뀌어 들어가고 입장됨', async ({ user, bots }) => {
        const [b] = await bots.spawn(1);
        const room = await b.createRoom({ maxPlayers: 6 });
        await typeCode(user.page, room.roomCode.toLowerCase());
        const boxes = user.page.getByRole('textbox', { name: /방 코드/ });
        await expect(boxes.first()).toHaveValue(room.roomCode[0]);
        await user.page.getByRole('button', { name: '참여하기' }).click();
        await expect(user.page).toHaveURL(/\/game-matching/);
    });

    test('코드를 붙여넣으면 → 여섯 칸이 한 번에 채워짐', async ({ user, bots }) => {
        const [b] = await bots.spawn(1);
        const room = await b.createRoom({ maxPlayers: 6 });
        await user.page.goto('/roomInvite');
        const first = user.page.getByRole('textbox', { name: /방 코드/ }).first();
        await first.click();
        await first.evaluate((el, text) => {
            const dt = new DataTransfer();
            dt.setData('text', text);
            el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        }, room.roomCode);
        const values = await user.page.getByRole('textbox', { name: /방 코드/ }).evaluateAll((els) => els.map((e) => e.value).join(''));
        expect(values).toBe(room.roomCode);
    });

    test('없는 코드를 넣으면 → "방을 찾을 수 없습니다" 알림이 뜨고 코드 화면에 그대로 있음', async ({ user }) => {
        await typeCode(user.page, 'ZZZZZ9');
        const msg = await joinAlert(user.page);
        expect(msg).toMatch(/방을 찾을 수 없습니다|입장 코드가 올바르지 않습니다/);
        await expect(user.page).toHaveURL(/\/roomInvite$/);
    });

    test('정원이 다 찬 방 코드를 넣으면 → "방 정원이 가득 찼습니다." 알림', async ({ user, bots }) => {
        const [b, ...rest] = await bots.spawn(4);
        const room = await b.createRoom({ maxPlayers: 4 });
        for (const x of rest) await x.joinByCode(room.roomCode);
        await typeCode(user.page, room.roomCode);
        expect(await joinAlert(user.page)).toBe('방 정원이 가득 찼습니다.');
        expect(await e2e.roomOf(user.account.uuid)).toBeNull();
    });

    test('게임이 이미 시작된 방 코드를 넣으면 → 입장 못 하고 시작됨/없음 알림 @game', async ({ user, bots, players }) => {
        const host = await players.add();
        const [b] = await bots.spawn(1);
        const t = await h.hostGame({ host, botList: [b] });
        await typeCode(user.page, t.roomCode);
        expect(await joinAlert(user.page)).toMatch(/이미 게임이 시작된 방|방을 찾을 수 없습니다/);
        expect(await e2e.gameOf(user.account.uuid)).toBeNull();
    });

    test('다섯 자만 넣고 참여하기를 누르면 → 아무 요청도 안 가고 화면 그대로', async ({ user }) => {
        await typeCode(user.page, 'ABCDE');
        let dialogs = 0;
        user.page.on('dialog', (d) => { dialogs += 1; d.dismiss().catch(() => {}); });
        await user.page.getByRole('button', { name: '참여하기' }).click();
        await expect(user.page).toHaveURL(/\/roomInvite$/);
        await user.page.waitForTimeout(800); // 알림이 안 오는 것 확인 (짧게)
        expect(dialogs).toBe(0);
    });

    test('코드 입력 화면에서 취소를 누르면 → 게임 모드 선택 화면으로 감', async ({ user }) => {
        await user.page.goto('/roomInvite');
        await user.page.getByRole('button', { name: '취소' }).click();
        await expect(user.page).toHaveURL(/\/gameMode$/);
    });

    test('코드 방(코드로만 참가)도 → 코드를 알면 들어갈 수 있음', async ({ user, bots }) => {
        const [b] = await bots.spawn(1);
        const room = await b.createRoom({ accessType: 'code', maxPlayers: 6 });
        await ui.joinRoomByCodeUi(user.page, room.roomCode);
        await h.expectPartyCount(user.page, 2);
    });

    test('1분 안에 코드 입장을 너무 많이(21번) 시도하면 → "입장 시도가 너무 많습니다" 알림', async ({ user }) => {
        await typeCode(user.page, 'QQQQQ1');
        const seen = [];
        for (let i = 0; i < 21; i += 1) seen.push(await joinAlert(user.page));
        expect(seen.slice(0, 20).every((m) => !m.includes('너무 많습니다'))).toBe(true);
        expect(seen[20]).toBe('입장 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
    });
});
