'use strict';

// 누름과 로비 입장이 겹칠 때 어려움 시험 (PC) — "대기방으로"·코드 입장·초대 수락을 누르자마자 로비 주소로 가면 그 입장이 되돌려져 상대 화면 명단에 안 남음
// 목록 A10-로비-입장-방어.md 번호 A10-H-012~014 (사람 2 + 봇, 쓰는 동안 안 돌림)
const crypto = require('node:crypto');
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { api } = require('../../helpers/friends');
const { closeReveals, createRoomUi, openSetup } = require('../room/roomHelpers');
const { openFriendPanel, openTab, makeFriends } = require('./lobbyHelpers');
const H = require('../result/_a08-hard-kit');

const ALREADY_IN_ROOM = '이미 참여 중인 방이 있습니다.';
const U = (x) => x.account?.uuid ?? x.uuid;

/** 방 만들기 → 대기방까지, 방장 = 나 ("이미 참여 중인 방" 거절 글이 안 떠야 함) */
async function makeRoom(person) {
    const page = person.page;
    const said = [];
    const onDialog = (d) => { said.push(d.message()); d.accept().catch(() => {}); };
    page.on('dialog', onDialog);
    try {
        await openSetup(page);
        await page.getByRole('button', { name: '게임 만들기' }).click();
        await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    } finally {
        page.off('dialog', onDialog);
    }
    expect(said, '방 만들기 때 뜬 알림').not.toContain(ALREADY_IN_ROOM);
    await expect.poll(async () => (await e2e.roomOf(U(person)))?.hostUuid, { message: '새 방 방장 = 나' }).toBe(U(person));
}

/** 로비 주소로 바로 감 (누른 요청 답을 안 기다림), 인트로까지 넘김 */
async function rushToLobby(page) {
    await page.goto('/lobby');
    await ui.skipIntro(page);
}

/** 그 방 명단에 그 사람이 없을 때까지 (기본 10초 — 끊김 15초 유예로 늦게 빠지는 것과 갈라 봄) */
async function expectNotSeated(hostUuid, uuid) {
    await expect.poll(async () => (await H.seatsOf(hostUuid)).includes(uuid), { message: '그 방 명단에 그 사람' }).toBe(false);
}

test('A10-H-012 사람 2 + 봇 3 = 5명 판 끝 → B "대기방으로" → A "대기방으로" 누르자마자 /lobby → B 화면 명단에 A 없음, A 방 만들기 됨 @hard @game @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    const { t, joker } = await H.seatTable(table, [a, b], 3);
    await closeReveals([a.page, b.page]);
    await H.jokerLeaves(t, joker);
    await H.allAtResult([a, b]);

    await H.pressReturn(b.page);
    await H.returnButton(a.page).click();
    await rushToLobby(a.page);
    await expectNotSeated(U(b), U(a));
    await H.expectParty(b.page, 1);
    await makeRoom(a);
});

test('A10-H-013 사람 2 + 봇 3, B 방장 대기방에 A가 코드 입장 누르자마자 /lobby → B 화면 명단에 A 없음 @hard', async ({ user, players, bots }) => {
    test.setTimeout(180_000);
    const a = user;
    const b = await players.add();
    const room = await createRoomUi(b, {});
    for (const bot of await bots.spawn(3)) await bot.joinByCode(room.roomCode);
    await H.expectParty(b.page, 4);

    await H.typeRoomCode(a.page, room.roomCode);
    await a.page.getByRole('button', { name: '참여하기' }).click();
    await rushToLobby(a.page);
    await expectNotSeated(U(b), U(a));
    await H.expectParty(b.page, 4);
    expect(await e2e.roomOf(U(a))).toBeNull();
});

test('A10-H-014 사람 2, B가 친구 A를 초대 → A "초대 수락" 누르자마자 /lobby → B 명단에 A 없음, A 방 만들기 됨 @hard', async ({ user, players }) => {
    test.setTimeout(180_000);
    const a = user;
    const b = await players.add();
    await makeFriends(b, a);
    await createRoomUi(b, {});
    // 초대 보내기는 준비라 API로 (화면으로 보는 건 A의 수락)
    await api(b, 'POST', '/friends/invites', { receiverId: U(a), creationKey: crypto.randomUUID() });

    await ui.gotoLobby(a.page);
    await openFriendPanel(a.page);
    await openTab(a.page, '게임 초대');
    const row = a.page.getByRole('list', { name: '받은 게임 초대' }).locator('[data-invite-id]').filter({ hasText: b.account.nickname });
    await row.getByRole('button', { name: '초대 수락' }).click();
    await rushToLobby(a.page);
    await expectNotSeated(U(b), U(a));
    await H.expectParty(b.page, 1);
    await makeRoom(a);
});
