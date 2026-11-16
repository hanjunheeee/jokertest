'use strict';

// 대기방 추방 브라우저 시험 (PC, 어려움 — 사람 여럿) — 받은 버그 7: 사람 방장이 사람 손님을 한 번에·3번 규칙·먼저 나간 사람 실패 글·다시 오면 준비 풀림
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-H-501·502·504·515 (사람 2~3 + 봇, 판 안 씀)
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const K = require('./_a01b-kick-kit');

const { U, TEXT } = K;

// 사람 방장 A(정원 6) + 사람 손님들(코드 입장 차례대로) + 봇 → 방장 화면 인원이 맞을 때까지
async function peopleRoom(host, guests, bots, { maxPlayers = 6, botCount = 3 } = {}) {
    const room = await K.humanRoom(host, { maxPlayers });
    for (const g of guests) await ui.joinRoomByCodeUi(g.page, room.roomCode);
    const list = await K.joinBots(bots, botCount, room.roomCode);
    await K.expectParty(host.page, 1 + guests.length + botCount);
    return { room, list };
}

test('A01-H-501 [버그 7] 사람 방장이 사람 손님을 한 번에 — 방장 창 닫힘·자리 빠짐, 손님 화면 방 목록 (정원 6 · 사람 2 + 봇 3) @hard @smoke', async ({ user, players, bots }) => {
    const a = user;
    const b = await players.add();
    await peopleRoom(a, [b], bots);

    await K.openKick(a.page);
    await K.kickRowButton(a.page, b).click();

    await expect(K.kickDialog(a.page)).toHaveCount(0);
    await K.expectParty(a.page, 4);
    await expect(b.page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    expect(await e2e.roomOf(U(b)), '손님 방 자리 없음').toBeNull();
});

test('A01-H-502 같은 사람 3번 추방 → 다시 코드 입장하면 "이 방에서 3번 추방되어…" (정원 6 · 사람 2 + 봇 3) @hard', async ({ user, players, bots }) => {
    const a = user;
    const b = await players.add();
    const { room } = await peopleRoom(a, [b], bots);

    for (let i = 0; i < 2; i += 1) {
        await K.kickUi(a.page, b);
        await expect(b.page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
        await ui.joinRoomByCodeUi(b.page, room.roomCode);
        await K.expectParty(a.page, 5);
    }
    await K.kickUi(a.page, b);
    await expect(b.page).toHaveURL(/\/multiplay/, { timeout: 15_000 });

    const message = await K.codeEntryAlert(b.page, room.roomCode);

    expect(message).toBe(TEXT.codeKicked);
    expect(await e2e.roomOf(U(b)), '손님 방 자리 없음').toBeNull();
    await K.expectParty(a.page, 4);
});

test('A01-H-504 [버그 7] 대상 사람이 먼저 나감 → 방장이 남은 그 줄 "추방" → "이미 방에서 나간 참가자입니다."가 보임 (정원 6 · 사람 2 + 봇 3) @hard', async ({ user, players, bots }) => {
    const a = user;
    const b = await players.add();
    // 방장 화면 소켓 길목은 방 만들기 전에 (그 뒤 새 소켓이 이 길로 감)
    const gate = await K.socketGate(a.page);
    await peopleRoom(a, [b], bots);
    gate.drop.add('player_left_room');

    await K.hostButton(b.page, '방 나가기').click();
    await expect(b.page).toHaveURL(/\/multiplay/);
    await expect.poll(async () => (await e2e.roomOf(U(b)))?.roomId ?? null).toBeNull();
    await expect.poll(() => gate.dropped.length, { message: '나감 알림 버림' }).toBeGreaterThan(0);
    await K.expectParty(a.page, 5);

    await K.openKick(a.page);
    await K.kickRowButton(a.page, b).click();

    const error = K.kickDialog(a.page).getByTestId('kick-error');
    await expect(error).toHaveText(TEXT.alreadyLeft);
    const r = await expectReadable(error);
    expect(r.ratio, '글자·바탕 대비').toBeGreaterThanOrEqual(4.5);
    await expect(b.page, '손님은 방 목록 그대로').toHaveURL(/\/multiplay/);
});

test('A01-H-515 추방됐다 다시 오면 준비 풀림, 남은 사람 준비 그대로 (정원 6 · 사람 3 + 봇 3) @hard', async ({ user, players, bots }) => {
    const a = user;
    const b = await players.add();
    const c = await players.add();
    const { room, list } = await peopleRoom(a, [b, c], bots);
    for (const g of [b, c]) {
        await ui.readyUi(g.page);
        await expect(g.page.getByRole('button', { name: '준비취소', exact: true })).toBeVisible();
    }
    await K.readyBots(list, U(a));
    // 준비 안 한 자리는 방장 A 하나
    await expect(K.waitingBadges(a.page)).toHaveCount(1);

    await K.kickUi(a.page, b);
    await expect(b.page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    await ui.joinRoomByCodeUi(b.page, room.roomCode);

    await K.expectParty(a.page, 6);
    const seats = (await e2e.roomOf(U(a))).players;
    expect(seats.find((p) => p.uuid === U(b))?.isReady, 'B 대기중').toBe(false);
    expect(seats.find((p) => p.uuid === U(c))?.isReady, 'C 준비완료 그대로').toBe(true);
    // 방장 화면: "대기중"은 A·B 둘
    await expect(K.waitingBadges(a.page)).toHaveCount(2);
    await expect(b.page.getByRole('button', { name: '준비완료', exact: true })).toBeVisible();
    await expect(c.page.getByRole('button', { name: '준비취소', exact: true })).toBeVisible();
});
