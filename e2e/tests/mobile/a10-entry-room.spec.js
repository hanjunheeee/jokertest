'use strict';

// 로비 입장 정리 브라우저 시험 (모바일, 대기방 쪽) — 방을 든 채 네 화면 주소로 오면 방 자리가 지워지고 바로 방 만들기 됨, 대기방·코드 입력 화면은 안 지움
// 목록 A10-로비-입장-방어.md 번호 A10-E-005~008·014·015 (판 없음, 쓰는 동안 안 돌림 — --list만)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const H = require('../result/_a08-hard-kit');

// 서버가 방 만들기를 거절할 때 글 — 이 글이 뜨면 옛 방이 남은 것 (받은 버그 4)
const ALREADY_IN_ROOM = '이미 참여 중인 방이 있습니다.';

const U = (x) => x.account?.uuid ?? x.uuid;

/** 폰 게임 설정 화면에서 처음 값으로 방 만들기 → 대기방, 방장 = 나 (거절 안내 창이 안 떠야 함), here면 지금 화면에서 바로 누름 */
async function makeRoom(person, { here = false } = {}) {
    const page = person.page;
    if (!here) await page.goto('/game-setup');
    const make = page.getByRole('button', { name: '게임 만들기' });
    await expect(make).toBeEnabled();
    await make.click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    // 폰은 알림을 양피지 안내 창으로 띄움 → 그 글이 없어야 함
    await expect(page.getByText(ALREADY_IN_ROOM)).toHaveCount(0);
    await expect.poll(async () => (await e2e.roomOf(U(person)))?.hostUuid, { message: '새 방 방장 = 나' }).toBe(U(person));
}

/** 서버에 내 방 자리가 없어질 때까지 (기본 10초 — 끊김 15초 유예로 늦게 빠지는 것과 갈라 봄) */
async function expectNoRoom(person) {
    await expect.poll(() => e2e.roomOf(U(person)), { message: '내 대기방 자리' }).toBeNull();
}

// 정리하는 네 화면
const ENTRY_PAGES = [
    { no: '005', path: '/lobby', smoke: true },
    { no: '006', path: '/gameMode' },
    { no: '007', path: '/multiplay' },
    { no: '008', path: '/game-setup' },
];

for (const { no, path, smoke } of ENTRY_PAGES) {
    test(`A10-E-${no} 모바일 공개 방 방장 혼자 → 주소 ${path} → 방 정리됨, 방 만들기 → 대기방${smoke ? ' @smoke' : ''}`, async ({ user }) => {
        const page = user.page;
        // 폰 설정 화면 처음 값 = 공개 방 ("코드로만 참가" 꺼짐)
        await H.createRoomOnPhone(user);
        await page.goto(path);
        await expectNoRoom(user);
        // 옛 방 정보로 대기방에 끌려가지 않고 그 화면 그대로 (모음 글 C-030)
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await makeRoom(user, { here: path === '/game-setup' });
    });
}

// 정리하면 안 되는 화면 (계획2-2 안 보내는 곳)
const KEEP_PAGES = [
    { no: '014', path: '/game-matching' },
    { no: '015', path: '/roomInvite' },
];

for (const { no, path } of KEEP_PAGES) {
    test(`A10-E-${no} 모바일 7명 방 손님 → 주소 ${path} → 방 그대로`, async ({ user, bots }) => {
        const page = user.page;
        const [host, ...rest] = await bots.spawn(6);
        const room = await host.createRoom({ maxPlayers: 7 });
        for (const bot of rest) await bot.joinByCode(room.roomCode);
        await ui.joinRoomByCodeUi(page, room.roomCode);
        await expect.poll(async () => (await e2e.roomOf(host.uuid))?.players.length).toBe(7);
        await page.goto(path);
        if (path === '/game-matching') {
            // 화면이 서버에 지금 방을 물어 받은 뒤 (정리를 먼저 보냈다면 방이 없다고 답했을 것)
            await H.expectParty(page, 7);
        } else {
            await expect(page.getByRole('textbox', { name: /방 코드/ }).first()).toBeVisible();
        }
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        expect((await e2e.roomOf(U(user)))?.roomId).toBe(room.roomId);
        expect((await e2e.roomOf(host.uuid))?.players.length).toBe(7);
    });
}
