'use strict';

// 대기방 로비 입장 어려움 시험 (모바일 + PC 섞음) — 폰 손님이 뒤로 가면 PC 방장 화면에서 빠짐, 폰 방장이 새 탭 로비로 오면 PC 손님이 방장 (받은 버그 4)
// 목록 A10-로비-입장-방어.md 번호 A10-H-023·024 (사람 2 + 봇 3, 판 없음 — 쓰는 동안 안 돌림)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi } = require('../room/roomHelpers');
const K = require('../ingame/_a09-simple-kit');
const H = require('../result/_a08-hard-kit');

const U = (x) => x.account?.uuid ?? x.uuid;

test('A10-H-023 폰 손님 B(방 목록으로 들어옴) 브라우저 뒤로 → PC 방장 A 화면에서 B 빠짐 (사람 2 + 봇 3) @hard @smoke', async ({ user, players, bots }) => {
    test.setTimeout(240_000);
    const b = user;
    const a = await players.add({ mobile: false });
    // PC 방장 A: 처음 값 = 공개 방
    const room = await createRoomUi(a, { code: false });
    for (const bot of await bots.spawn(3)) await bot.joinByCode(room.roomCode);
    // 폰 B: 방 목록 → 선택한 방 입장 → 대기방 (뒤로 가면 방 목록)
    await K.pickPublicRoom(b.page, `${a.account.nickname}의 방`);
    await K.enterPicked(b.page).click();
    await expect(b.page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await H.expectParty(a.page, 5);

    await b.page.goBack();
    await expect(b.page).toHaveURL(/\/multiplay/);
    await H.expectParty(a.page, 4);
    expect(await H.seatsOf(U(a))).not.toContain(U(b));
    expect(await e2e.roomOf(U(b))).toBeNull();
});

test('A10-H-024 [버그 4] 폰 방장 A 새 탭 /lobby → PC 손님 B 화면에 방장 단추 (사람 2 + 봇 3) @hard', async ({ user, players, bots }) => {
    test.setTimeout(240_000);
    const a = user;
    const b = await players.add({ mobile: false });
    const room = await H.createRoomOnPhone(a);
    await ui.joinRoomByCodeUi(b.page, room.roomCode);
    for (const bot of await bots.spawn(3)) await bot.joinByCode(room.roomCode);
    await H.expectParty(b.page, 5);

    // 같은 폰 브라우저 새 탭으로 로비 (옛 탭에 뜬 안내 창은 닫음)
    await ui.captureAlert(a.page, async () => {
        const tab = await a.context.newPage();
        await ui.gotoLobby(tab);
    }, { timeoutMs: 15_000 });
    await expect.poll(async () => (await e2e.roomOf(U(b)))?.hostUuid, { message: '새 방장' }).toBe(U(b));
    await H.expectParty(b.page, 4);
    await expect(H.startButton(b.page)).toBeVisible({ timeout: 15_000 });
    await expectReadable(H.startButton(b.page).getByText('게임시작', { exact: true }));
    await expectReadable(b.page.getByRole('button', { name: '방 설정 변경' }).getByText('방 설정 변경', { exact: true }));
});
