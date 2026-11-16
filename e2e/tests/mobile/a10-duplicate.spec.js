'use strict';

// 같은 계정 중복 접속 시험 (모바일, 받은 버그 4) — 방을 만든 채 같은 브라우저 새 탭·다른 브라우저로 로비·게임 설정에 오면 옛 방이 없어지고 새 쪽에서 방 만들기 됨
// 목록 A10-로비-입장-방어.md 번호 A10-E-042·045·059 (판 없음, 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const H = require('../result/_a08-hard-kit');

const OTHER_LOGIN = '다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.';
const ALREADY_IN_ROOM = '이미 참여 중인 방이 있습니다.';
const U = (x) => x.account?.uuid ?? x.uuid;

/** 폰 게임 설정 화면에서 처음 값으로 방 만들기 → 대기방, 방장 = 나 (거절 안내 창 글이 없어야 함), here면 지금 화면에서 바로 누름 */
async function makeRoom(person, { here = false } = {}) {
    const page = person.page;
    if (!here) await page.goto('/game-setup');
    const make = page.getByRole('button', { name: '게임 만들기' });
    await expect(make).toBeEnabled();
    await make.click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await expect(page.getByText(ALREADY_IN_ROOM)).toHaveCount(0);
    await expect.poll(async () => (await e2e.roomOf(U(person)))?.hostUuid, { message: '새 방 방장 = 나' }).toBe(U(person));
}

/** 서버에 내 방 자리가 없어질 때까지 (기본 10초) */
async function expectNoRoom(person) {
    await expect.poll(() => e2e.roomOf(U(person)), { message: '내 대기방 자리' }).toBeNull();
}

/** 같은 브라우저(같은 쿠키) 새 탭으로 그 주소 열기 → 새 탭 (옛 탭 안내 창은 이 케이스들이 안 봄) */
async function openTwinTab(person, path) {
    const tab = await person.context.newPage();
    if (path === '/lobby') await ui.gotoLobby(tab);
    else await tab.goto(path);
    return tab;
}

test('A10-E-042 [버그 4] 모바일 방 만든 채 같은 브라우저 새 탭 /lobby → 방 없음, 새 탭 방 만들기 됨 @smoke', async ({ user }) => {
    await H.createRoomOnPhone(user);
    const tab = await openTwinTab(user, '/lobby');
    await expectNoRoom(user);
    await makeRoom({ page: tab, account: user.account });
});

test('A10-E-045 [버그 4] 모바일 방 만든 채 새 탭이 게임 설정 주소로 바로 → 방 없음, 바로 방 만들기 됨', async ({ user }) => {
    await H.createRoomOnPhone(user);
    const tab = await openTwinTab(user, '/game-setup');
    await expectNoRoom(user);
    await expect(tab).toHaveURL(/\/game-setup/);
    await makeRoom({ page: tab, account: user.account }, { here: true });
});

test('A10-E-059 [버그 4] 모바일 방장이 다른 브라우저에서 새 로그인 → 옛 브라우저 안내 + /login, 방 없음', async ({ user, players }) => {
    await H.createRoomOnPhone(user);
    const message = await ui.captureAlert(user.page, async () => {
        // 같은 계정으로 다른 브라우저(따로 쿠키, 폰 화면) 로그인 → 로비
        await players.add({ account: user.account });
    }, { timeoutMs: 15_000 });
    expect(message).toBe(OTHER_LOGIN);
    await expect(user.page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expectNoRoom(user);
});
