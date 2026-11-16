'use strict';

// 대기방 로비 입장 어려움 시험 (PC) — 방장 뒤로 가기·손님 새 탭 로비로 명단이 줄면 남은 사람 화면 인원·방장·시작 단추가 바뀜, 밀린 옛 탭에서 누른 준비는 무시
// 목록 A10-로비-입장-방어.md 번호 A10-H-019~022 (사람 2~4 + 봇, 판 없음 — 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi, botsJoinAndReady } = require('../room/roomHelpers');
const H = require('../result/_a08-hard-kit');

const SAME_BROWSER = '같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.';
const U = (x) => x.account?.uuid ?? x.uuid;

/** 대기방 화면에 방장 단추(게임시작·방 설정 변경)가 사람 눈에 보임 */
async function expectHostButtons(page) {
    await expect(H.startButton(page)).toBeVisible({ timeout: 15_000 });
    await expectReadable(H.startButton(page).getByText('게임시작', { exact: true }));
    await expectReadable(page.getByRole('button', { name: '방 설정 변경' }).getByText('방 설정 변경', { exact: true }));
}

/** 같은 브라우저 새 탭으로 로비 → 옛 탭에 뜬 알림 글 */
async function twinToLobby(person) {
    return ui.captureAlert(person.page, async () => {
        const tab = await person.context.newPage();
        await ui.gotoLobby(tab);
    }, { timeoutMs: 15_000 });
}

/** 사람 방장 방에 손님 사람들(코드 입장) + 봇들 입장 (준비 안 함) → 서버 방 값 */
async function fillRoom(host, guests, botList) {
    const room = await createRoomUi(host, {});
    for (const g of guests) await ui.joinRoomByCodeUi(g.page, room.roomCode);
    for (const bot of botList) await bot.joinByCode(room.roomCode);
    await H.expectParty(host.page, 1 + guests.length + botList.length);
    return room;
}

test('A10-H-019 사람 4 + 봇 2 = 6명 방, 방장 A 브라우저 뒤로 → 나머지 3명 화면 명단 5명, 먼저 들어온 B 화면 방장 단추 @hard @smoke', async ({ user, players, bots }) => {
    test.setTimeout(240_000);
    const a = user;
    const guests = [await players.add(), await players.add(), await players.add()];
    await fillRoom(a, guests, await bots.spawn(2));
    // 게임 설정 화면 → 게임 만들기 → 대기방이라 뒤로 가면 게임 설정 화면
    await a.page.goBack();
    await expect(a.page).toHaveURL(/\/game-setup/);
    await expect.poll(() => e2e.roomOf(U(a)), { message: 'A 방 자리' }).toBeNull();
    for (const g of guests) await H.expectParty(g.page, 5);
    await expect.poll(async () => (await e2e.roomOf(U(guests[0])))?.hostUuid, { message: '새 방장' }).toBe(U(guests[0]));
    await expectHostButtons(guests[0].page);
});

test('A10-H-020 사람 2 + 봇 4 = 6명 방 전원 준비, 손님 A 새 탭 /lobby → 방장 B 화면 A 빠짐, 5명 다 준비라 시작 단추 켜짐 @hard', async ({ user, players, bots }) => {
    test.setTimeout(240_000);
    const a = user;
    const b = await players.add();
    const botList = await bots.spawn(4);
    const room = await createRoomUi(b, {});
    await ui.joinRoomByCodeUi(a.page, room.roomCode);
    await botsJoinAndReady(botList, U(b), room.roomCode);
    await H.readyHumans([a, b]);
    await H.expectParty(b.page, 6);

    expect(await twinToLobby(a)).toBe(SAME_BROWSER);
    await H.expectParty(b.page, 5);
    expect(await H.seatsOf(U(b))).not.toContain(U(a));
    await expect(H.startButton(b.page)).toBeEnabled();
    await expectReadable(H.startButton(b.page).getByText('게임시작', { exact: true }));
});

test('A10-H-021 사람 2 + 봇 3 = 5명 방 전원 준비, 손님 A /lobby → 4명 → B 화면 시작 단추 꺼짐 + 까닭 글이 읽힘 @hard', async ({ user, players, bots }) => {
    test.setTimeout(240_000);
    const a = user;
    const b = await players.add();
    const botList = await bots.spawn(3);
    const room = await createRoomUi(b, {});
    await ui.joinRoomByCodeUi(a.page, room.roomCode);
    await botsJoinAndReady(botList, U(b), room.roomCode);
    await H.readyHumans([a, b]);
    await H.expectParty(b.page, 5);

    await ui.gotoLobby(a.page);
    await H.expectParty(b.page, 4);
    const start = H.startButton(b.page);
    await expect(start).toBeDisabled();
    // 꺼진 까닭 글: 단추에 이어진 글 (결정「버그 7」 — 단추가 꺼진 까닭을 글로)
    const reasonId = await start.getAttribute('aria-describedby');
    expect(reasonId, '시작 단추에 이어진 까닭 글').toBeTruthy();
    const reason = b.page.locator(`[id="${reasonId}"]`);
    await expect(reason).not.toHaveText('');
    await expectReadable(reason);
});

test('A10-H-022 사람 2 + 봇 3, 손님 A 탭 1 → 탭 2 /lobby → 탭 1에서 준비 누름 → B 화면에 A 없음 그대로 @hard', async ({ user, players, bots }) => {
    test.setTimeout(240_000);
    const a = user;
    const b = await players.add();
    const room = await fillRoom(b, [a], await bots.spawn(3));
    expect(room.roomCode).toBeTruthy();

    expect(await twinToLobby(a)).toBe(SAME_BROWSER);
    await H.expectParty(b.page, 4);
    // 밀린 옛 탭: 준비 단추가 꺼져 있을 수도 있음 → 눌러 보기만 함
    await a.page.getByRole('button', { name: '준비완료' }).click({ force: true, timeout: 5000 }).catch(() => {});
    await H.expectParty(b.page, 4);
    expect(await H.seatsOf(U(b))).not.toContain(U(a));
    expect(await e2e.roomOf(U(a))).toBeNull();
});
