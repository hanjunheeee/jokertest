'use strict';

// 끝난 판 뒤 로비 입장 어려움 시험 (PC) — 결과 화면에서 한 명은 로비, 나머지는 "대기방으로"처럼 섞여도 방장이 바르게 넘어가 다음 판 시작 됨, 로비 간 사람은 새 방·같은 코드로 다시 들어오기 됨
// 목록 A10-로비-입장-방어.md 번호 A10-H-009·010·011·025·030 (사람 2~3 + 봇, 판 끝은 광대 봇 나가기 → 시민 승 — 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { closeReveals, openSetup } = require('../room/roomHelpers');
const H = require('../result/_a08-hard-kit');

const SAME_BROWSER = '같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.';
const ALREADY_IN_ROOM = '이미 참여 중인 방이 있습니다.';
const U = (x) => x.account?.uuid ?? x.uuid;

/** 방 만들기 → 대기방까지, 방장 = 나 ("이미 참여 중인 방" 거절 글이 안 떠야 함) → 서버 방 값 */
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
    return e2e.roomOf(U(person));
}

/** 대기방 화면에 방장 단추(게임시작·방 설정 변경)가 사람 눈에 보임 */
async function expectHostButtons(page) {
    await expect(H.startButton(page)).toBeVisible({ timeout: 15_000 });
    await expectReadable(H.startButton(page).getByText('게임시작', { exact: true }));
    await expectReadable(page.getByRole('button', { name: '방 설정 변경' }).getByText('방 설정 변경', { exact: true }));
}

/** 판 끝 (광대 봇이 나가 시민 승) → 사람 모두 결과 화면 */
async function endAndShowResults(t, joker, humans) {
    await H.jokerLeaves(t, joker);
    await H.allAtResult(humans);
}

test('A10-H-009 사람 3 + 봇 2 = 5명 판 끝 → 원래 방장 A /lobby → B·C "대기방으로" → B 방장 → 봇 3 들어와 5명 → 시작 됨 @hard @game @smoke', async ({ user, players, bots }) => {
    test.setTimeout(360_000);
    const a = user;
    const b = await players.add();
    const c = await players.add();
    // A가 화면으로 방을 만든 방장 (원래 방장 = 판 끝 때 방장)
    const { t, joker } = await H.seatHosted(bots, a, [b, c], 2);
    await closeReveals([a.page, b.page, c.page]);
    await endAndShowResults(t, joker, [a, b, c]);

    await ui.gotoLobby(a.page);
    await H.pressReturn(b.page);
    await H.pressReturn(c.page);
    await expect.poll(async () => (await e2e.roomOf(U(b)))?.hostUuid, { message: '다시 연 방 방장' }).toBe(U(b));
    const room = await e2e.roomOf(U(b));
    expect(room.players.map((p) => p.uuid), 'A는 방에 없음').not.toContain(U(a));

    const fresh = await bots.spawn(3);
    for (const bot of fresh) await bot.joinByCode(room.roomCode);
    await H.expectParty(b.page, 5);
    const next = await H.startByHuman(b, [c], fresh, H.rolesFor([b, c], [fresh.at(-1)]));
    expect((await next.state()).players, '둘째 판 인원').toHaveLength(5);
});

test('A10-H-010 사람 3 + 봇 3 = 6명 판 끝 → A /lobby, B·C "대기방으로" → 봇 3 들어와 시작 됨, A는 다른 방 만들기 됨 @hard @game', async ({ user, players, table, bots }) => {
    test.setTimeout(360_000);
    const a = user;
    const b = await players.add();
    const c = await players.add();
    // 봇 방장 판: 방장 봇 = bots[0], 광대 = 맨 뒤 봇
    const { t, joker, host } = await H.seatTable(table, [a, b, c], 3);
    await closeReveals([a.page, b.page, c.page]);
    await endAndShowResults(t, joker, [a, b, c]);

    await ui.gotoLobby(a.page);
    await H.pressReturn(b.page);
    await H.pressReturn(c.page);
    // 원래 방장 봇과 남은 봇 하나도 "대기방으로" + 새 봇 하나 = 봇 3
    const stay = t.bots.filter((bot) => bot !== joker);
    for (const bot of stay) await H.botReturn(bot, t.gameId);
    const room = await e2e.roomOf(U(b));
    const [late] = await bots.spawn(1);
    await late.joinByCode(room.roomCode);
    const botList = [...stay, late];
    await H.expectParty(b.page, 5);
    const next = await H.startByBot(host, [b, c], botList, H.rolesFor([b, c], [late]));
    expect((await next.state()).players.map((p) => p.uuid), 'A는 둘째 판에 없음').not.toContain(U(a));

    const own = await makeRoom(a);
    expect(own.roomId, 'A 방은 다른 방').not.toBe(room.roomId);
});

test('A10-H-011 사람 2 + 봇 5 = 7명 판 끝 → A /lobby → B "대기방으로" → A 같은 코드 입력 → B 화면 명단에 A @hard @game', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    const { t, joker } = await H.seatTable(table, [a, b], 5);
    await closeReveals([a.page, b.page]);
    await endAndShowResults(t, joker, [a, b]);

    await ui.gotoLobby(a.page);
    await H.pressReturn(b.page);
    const room = await e2e.roomOf(U(b));
    expect(room.roomCode, '같은 방 코드').toBe(t.roomCode);
    await ui.joinRoomByCodeUi(a.page, room.roomCode);
    await H.expectParty(b.page, 2);
    expect(await H.seatsOf(U(b))).toContain(U(a));
});

test('A10-H-025 사람 3 + 봇 3 = 6명 판 끝 → 사람 3명 모두 /lobby → 셋 다 방 만들기 됨 @hard @game', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const people = [user, await players.add(), await players.add()];
    const { t, joker } = await H.seatTable(table, people, 3);
    await closeReveals(people.map((p) => p.page));
    await endAndShowResults(t, joker, people);

    for (const p of people) await ui.gotoLobby(p.page);
    const rooms = [];
    for (const p of people) rooms.push((await makeRoom(p)).roomId);
    expect(new Set(rooms).size, '셋 다 다른 방').toBe(3);
});

test('A10-H-030 [버그 4] 사람 2 + 봇 3 = 5명 판 끝 → A(원래 방장)·B "대기방으로" → A 새 탭 /lobby → B 방장, A 새 탭 방 만들기 됨 @hard @game', async ({ user, players, bots }) => {
    test.setTimeout(300_000);
    const a = user;
    const b = await players.add();
    const { t, joker } = await H.seatHosted(bots, a, [b], 3);
    await closeReveals([a.page, b.page]);
    await endAndShowResults(t, joker, [a, b]);

    await H.pressReturn(a.page);
    await H.pressReturn(b.page);
    await expect.poll(async () => (await e2e.roomOf(U(a)))?.hostUuid, { message: '다시 연 방 방장' }).toBe(U(a));
    const room = await e2e.roomOf(U(a));

    let tab = null;
    const message = await ui.captureAlert(a.page, async () => {
        tab = await a.context.newPage();
        await ui.gotoLobby(tab);
    }, { timeoutMs: 15_000 });
    expect(message).toBe(SAME_BROWSER);
    await expect.poll(async () => (await e2e.roomOf(U(b)))?.hostUuid, { message: '새 방장' }).toBe(U(b));
    await expect.poll(() => H.seatsOf(U(b)), { message: '방 명단' }).toEqual([U(b)]);
    await expectHostButtons(b.page);

    const own = await makeRoom({ page: tab, account: a.account });
    expect(own.roomId, 'A 새 방은 다른 방').not.toBe(room.roomId);
});
