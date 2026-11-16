'use strict';

// 로비 입장 정리 브라우저 시험 (PC, 대기방 쪽) — 방을 든 채 로비·게임 모드·방 목록·게임 설정 주소로 오면 방 자리가 지워지고 바로 방 만들기 됨, 대기방·코드 입력 화면은 안 지움
// 목록 A10-로비-입장-방어.md 번호 A10-E-001~004·009~013·048·049 (판 없음, 쓰는 동안 안 돌림 — --list만)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { createRoomUi, openSetup, openRoomList, findRoomRow } = require('../room/roomHelpers');
const H = require('../result/_a08-hard-kit');

// 서버가 방 만들기를 거절할 때 글 (backend join/create.js) — 이 글이 뜨면 옛 방이 남은 것 (받은 버그 4)
const ALREADY_IN_ROOM = '이미 참여 중인 방이 있습니다.';

const U = (x) => x.account?.uuid ?? x.uuid;

/** 방 만들기 → 대기방까지, 방장 = 나 ("이미 참여 중인 방" 거절 글이 안 떠야 함), here면 지금 게임 설정 화면에서 바로 누름 */
async function makeRoom(person, { here = false } = {}) {
    const page = person.page;
    const said = [];
    const onDialog = (d) => { said.push(d.message()); d.accept().catch(() => {}); };
    page.on('dialog', onDialog);
    try {
        if (!here) await openSetup(page);
        await page.getByRole('button', { name: '게임 만들기' }).click();
        await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    } finally {
        page.off('dialog', onDialog);
    }
    expect(said, '방 만들기 때 뜬 알림').not.toContain(ALREADY_IN_ROOM);
    await expect(page.getByText(ALREADY_IN_ROOM)).toHaveCount(0);
    await expect.poll(async () => (await e2e.roomOf(U(person)))?.hostUuid, { message: '새 방 방장 = 나' }).toBe(U(person));
}

/** 서버에 내 방 자리가 없어질 때까지 (기본 10초 — 끊김 15초 유예로 늦게 빠지는 것과 갈라 봄) */
async function expectNoRoom(person) {
    await expect.poll(() => e2e.roomOf(U(person)), { message: '내 대기방 자리' }).toBeNull();
}

/** 봇 방장 방 + 봇 손님 몇 → 사람이 코드로 입장 (사람 포함 n명 방), 봇 방장 돌려줌 */
async function seatGuest(bots, user, n, settings = {}) {
    const list = await bots.spawn(n - 1);
    const [host, ...rest] = list;
    const room = await host.createRoom({ maxPlayers: Math.max(5, n), ...settings });
    for (const bot of rest) await bot.joinByCode(room.roomCode);
    await ui.joinRoomByCodeUi(user.page, room.roomCode);
    await expect.poll(async () => (await e2e.roomOf(host.uuid))?.players.length, { message: '방 인원' }).toBe(n);
    return { host, room };
}

// 정리하는 네 화면 (결정「로비」·결정「버그 4」: 로비가 아닌 화면도 같이 정리)
const ENTRY_PAGES = [
    { no: '001', path: '/lobby', smoke: true },
    { no: '002', path: '/gameMode' },
    { no: '003', path: '/multiplay' },
    { no: '004', path: '/game-setup' },
];

for (const { no, path, smoke } of ENTRY_PAGES) {
    test(`A10-E-${no} PC 공개 방 방장 혼자 → 주소 ${path} → 방 정리됨, 방 만들기 → 대기방 ("이미 참여 중인 방" 없음)${smoke ? ' @smoke' : ''}`, async ({ user }) => {
        const page = user.page;
        await createRoomUi(user, { code: false });
        expect(await e2e.roomOf(U(user)), '처음엔 방에 있음').not.toBeNull();
        await page.goto(path);
        await expectNoRoom(user);
        // 옛 방 정보로 대기방에 끌려가지 않고 그 화면 그대로 (모음 글 C-030 — 게임 모드 화면)
        await expect(page).toHaveURL(new RegExp(`${path}$`));
        await makeRoom(user, { here: path === '/game-setup' });
    });
}

test('A10-E-009 PC 봇 방장 5명 방 손님 → /lobby → 방 명단 4명', async ({ user, bots }) => {
    const { host } = await seatGuest(bots, user, 5);
    await ui.gotoLobby(user.page);
    await expectNoRoom(user);
    await expect.poll(async () => (await e2e.roomOf(host.uuid))?.players.length, { message: '남은 명단' }).toBe(4);
});

test('A10-E-010 PC 봇 방장 5명 공개 방 손님 → /multiplay → 방 목록 그 방 인원 4', async ({ user, bots }) => {
    const { host } = await seatGuest(bots, user, 5, { accessType: 'open' });
    const page = user.page;
    await openRoomList(page);
    const title = `${host.nickname}의 방`;
    // 목록 줄 이름: "방 이름, 4/5명, …" (쪽을 넘기며 찾음)
    await expect.poll(async () => {
        const row = await findRoomRow(page, title, { timeoutMs: 2000 });
        return row ? row.getAttribute('aria-label') : null;
    }, { message: '방 목록 줄 인원', timeout: 20_000 }).toMatch(/, 4\/\d+명/);
    await expectNoRoom(user);
});

test('A10-E-011 PC 사람 방장 + 봇 4 (5명 방) → /lobby → 먼저 들어온 봇1이 방장', async ({ user, bots }) => {
    const room = await createRoomUi(user, {});
    const list = await bots.spawn(4);
    for (const bot of list) await bot.joinByCode(room.roomCode);
    await H.expectParty(user.page, 5);
    await ui.gotoLobby(user.page);
    await expectNoRoom(user);
    await expect.poll(async () => (await e2e.roomOf(list[0].uuid))?.hostUuid, { message: '새 방장' }).toBe(list[0].uuid);
});

test('A10-E-012 PC 6명 방 손님 → 대기방 새로고침 → 방 그대로', async ({ user, bots }) => {
    const { room } = await seatGuest(bots, user, 6);
    const page = user.page;
    await page.reload();
    await expect(page).toHaveURL(/\/game-matching/);
    // 화면이 서버에 지금 방을 물어 받은 뒤 (그 앞에 정리를 보냈다면 방이 없다고 답했을 것)
    await H.expectParty(page, 6);
    expect((await e2e.roomOf(U(user)))?.roomId).toBe(room.roomId);
});

test('A10-E-013 PC 6명 방 손님 → 주소 /roomInvite → 방 그대로', async ({ user, bots }) => {
    const { room } = await seatGuest(bots, user, 6);
    const page = user.page;
    await page.goto('/roomInvite');
    await expect(page.getByRole('textbox', { name: /방 코드/ }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/roomInvite/);
    expect((await e2e.roomOf(U(user)))?.roomId).toBe(room.roomId);
    expect((await e2e.roomOf(U(user)))?.players.length).toBe(6);
});

test('A10-E-048 PC 방장 혼자 → /lobby → /multiplay → /lobby 빠르게 → 오류 글 없음, 방 만들기 됨', async ({ user }) => {
    const page = user.page;
    const errors = [];
    const said = [];
    page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
    page.on('dialog', (d) => { said.push(d.message()); d.accept().catch(() => {}); });
    await createRoomUi(user, {});
    // 다 그려지기 전에 다음 주소로 (주소가 바뀐 순간까지만 기다림)
    await page.goto('/lobby', { waitUntil: 'commit' });
    await page.goto('/multiplay', { waitUntil: 'commit' });
    await ui.gotoLobby(page);
    await expectNoRoom(user);
    expect(errors, '화면 오류').toEqual([]);
    expect(said, '뜬 알림 글').toEqual([]);
    await expect(page.locator('[data-testid="entry-failure-notice"]')).toHaveCount(0);
    await makeRoom(user);
});

test('A10-E-049 PC 6명 방 손님 → 로비 새로고침 3번 → 오류 없음, 방 명단 5명', async ({ user, bots }) => {
    const { host } = await seatGuest(bots, user, 6);
    const page = user.page;
    const errors = [];
    const said = [];
    page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
    page.on('dialog', (d) => { said.push(d.message()); d.accept().catch(() => {}); });
    await ui.gotoLobby(page);
    for (let i = 0; i < 3; i += 1) {
        await page.reload();
        await ui.skipIntro(page);
        await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
    }
    expect(errors, '화면 오류').toEqual([]);
    expect(said, '뜬 알림 글').toEqual([]);
    await expectNoRoom(user);
    await expect.poll(async () => (await e2e.roomOf(host.uuid))?.players.length, { message: '남은 명단' }).toBe(5);
});
