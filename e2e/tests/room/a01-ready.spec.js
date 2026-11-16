'use strict';

// 대기방 준비·준비 취소 브라우저 시험 (PC) — 내 자리 글·단추 글 바뀜, 봇 준비가 내 화면에, 방장도 준비, 새로 들어오면 "대기중", 처리 중 표시, 10명 방, 봇 나감, 채팅 칸 없음, 키보드
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-E-565~576 — 자리 글은 들어온 차례대로라 내 자리 = 들어온 차례 자리
const { test, expect, ui } = require('../../helpers/fixtures');
const { createRoomUi } = require('./roomHelpers');
const K = require('./_a01b-join-kit');

const { R, W, seats, U } = K;

// 봇 방(봇 방장 + 봇 3, 전부 준비)에 코드로 들어감 → 내 자리는 맨 끝 "대기중"
async function joinReadyBotRoom(user, bots) {
    const r = await K.botRoom(bots, { max: 6, count: 4, ready: true });
    await ui.joinRoomByCodeUi(user.page, r.code);
    await K.waitVerified(user.page);
    await K.expectSeats(user.page, seats(R, 4, W));
    return r;
}

test('A01-E-565 준비 누름 (정원 6 · 봇 방장 + 봇 3) → 내 자리 "준비완료", 단추 "준비취소" @smoke', async ({ user, bots }) => {
    const page = user.page;
    await joinReadyBotRoom(user, bots);
    await ui.readyUi(page);
    await K.expectSeats(page, seats(R, 5));
    await expect(page.getByRole('button', { name: '준비취소' })).toBeEnabled();
});

test('A01-E-566 준비 취소 (정원 6 · 봇 방장 + 봇 3) → 내 자리 "대기중", 단추 "준비완료"', async ({ user, bots }) => {
    const page = user.page;
    await joinReadyBotRoom(user, bots);
    await ui.readyUi(page);
    await K.expectSeats(page, seats(R, 5));
    await page.getByRole('button', { name: '준비취소' }).click();
    await K.expectSeats(page, seats(R, 4, W));
    await expect(page.getByRole('button', { name: '준비완료' })).toBeEnabled();
});

test('A01-E-567 봇 준비가 내 화면에 (정원 6 · 사람 방장) → 봇 손님 준비 → 그 자리 "준비완료" (새로고침 없이)', async ({ user, bots }) => {
    const page = user.page;
    const room = await createRoomUi(user, { maxPlayers: 6 });
    const [guest] = await K.botsIntoHumanRoom(bots, U(user), 1);
    await K.expectSeats(page, seats(W, 2));
    await K.botReady(guest, room);
    await K.expectSeats(page, seats(W, R));
    await expect(page).toHaveURL(/\/game-matching/);
});

test('A01-E-568 방장도 준비 (정원 5 · 사람 방장 + 봇 4) → 방장 "준비완료" → 방장 자리 "준비완료"', async ({ user, bots }) => {
    const page = user.page;
    await createRoomUi(user, { maxPlayers: 5 });
    await K.botsIntoHumanRoom(bots, U(user), 4);
    await K.expectSeats(page, seats(W, 5));
    await ui.readyUi(page);
    // 방장 자리 = 맨 앞 (방 만든 사람이 처음 들어옴)
    await K.expectSeats(page, seats(R, W, 4));
    await expect(page.getByRole('button', { name: '준비취소' })).toBeEnabled();
});

test('A01-E-569 방 만든 직후 방장도 "대기중" (정원 7 · 사람 방장)', async ({ user }) => {
    const page = user.page;
    await createRoomUi(user, { maxPlayers: 7 });
    await K.expectSeats(page, seats(W));
    await K.expectParty(page, 1);
});

test('A01-E-570 새 사람 들어오면 그 사람만 "대기중" (정원 6 · 사람 방장 준비 + 봇 3 준비) → 봇 하나 더 → 새 자리만 "대기중"', async ({ user, bots }) => {
    const page = user.page;
    await createRoomUi(user, { maxPlayers: 6 });
    await K.waitVerified(page);
    await ui.readyUi(page);
    await K.botsIntoHumanRoom(bots, U(user), 3, { ready: true });
    await K.expectSeats(page, seats(R, 4));
    await K.botsIntoHumanRoom(bots, U(user), 1);
    await K.expectSeats(page, seats(R, 4, W));
});

test('A01-E-571 다시 들어오면 "대기중" (정원 6 · 봇 방장) → 준비 → 방 나가기 → 코드로 다시 → 내 자리 "대기중"', async ({ user, bots }) => {
    const page = user.page;
    const { code, host } = await K.botRoom(bots, { max: 6, count: 2, ready: true });
    await ui.joinRoomByCodeUi(page, code);
    await K.waitVerified(page);
    await ui.readyUi(page);
    await K.expectSeats(page, seats(R, 3));
    await page.getByRole('button', { name: '방 나가기' }).click();
    await expect(page).toHaveURL(/\/multiplay/);
    await expect.poll(() => K.roomSize(host.uuid), { message: '서버 방에서 빠짐' }).toBe(2);
    await ui.joinRoomByCodeUi(page, code);
    await K.waitVerified(page);
    await K.expectSeats(page, seats(R, 2, W));
    await expect(page.getByRole('button', { name: '준비완료' })).toBeEnabled();
});

test('A01-E-572 준비 처리 중 표시 (정원 6) → 누른 직후 단추 "처리 중" 뒤 "준비취소"', async ({ user, bots }) => {
    const page = user.page;
    // 준비 요청(set_ready)을 서버로 보내기 전에 잡아 둠 → "처리 중"을 확인한 뒤 보냄 (잠깐 뜨는 글을 놓치지 않게)
    const setReady = K.eventFrame('set_ready');
    const tap = await K.tapSocket(page, { up: (m, t) => (t.on && setReady(m) ? 'hold' : null) });
    await joinReadyBotRoom(user, bots);
    tap.on = true;
    await page.getByRole('button', { name: '준비완료' }).click();
    const pending = page.getByRole('button', { name: '처리 중' });
    await expect(pending).toBeVisible();
    await expect(pending).toBeDisabled();
    tap.on = false;
    tap.release();
    await expect(page.getByRole('button', { name: '준비취소' })).toBeEnabled();
    await K.expectSeats(page, seats(R, 5));
});

test('A01-E-573 10명 방 준비 표시 (정원 10 · 사람 방장 + 봇 9) → 봇 9 준비 → 자리 9개 "준비완료", 방장만 "대기중"', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    await createRoomUi(user, { maxPlayers: 10 });
    await K.botsIntoHumanRoom(bots, U(user), 9, { ready: true });
    await K.expectSeats(page, seats(W, R, 9));
    await K.expectParty(page, 10);
});

test('A01-E-574 봇이 나가면 자리 빠짐 (정원 6 · 사람 방장 + 봇 3) → 봇 1 방 나가기 → 자리 하나 빠짐, 인원 3', async ({ user, bots }) => {
    const page = user.page;
    await createRoomUi(user, { maxPlayers: 6 });
    const [leaver] = await K.botsIntoHumanRoom(bots, U(user), 3);
    await K.expectParty(page, 4);
    leaver.emit('leave_room');
    await K.expectParty(page, 3);
    await expect(K.seatBadges(page)).toHaveCount(3);
});

test('A01-E-575 대기방에 채팅 칸 없음 (PC, 정원 6) → 채팅 입력칸 0개', async ({ user, bots }) => {
    const page = user.page;
    const { code } = await K.botRoom(bots, { max: 6, count: 2 });
    await ui.joinRoomByCodeUi(page, code);
    await K.waitVerified(page);
    await expect(page.getByRole('textbox', { name: '채팅 입력' })).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('A01-E-576 준비 단추 키보드로 (정원 6) → Tab으로 "준비완료" → Enter → "준비완료" 표시', async ({ user, bots }) => {
    const page = user.page;
    await joinReadyBotRoom(user, bots);
    const ready = page.getByRole('button', { name: '준비완료' });
    // Tab을 눌러 가며 준비 단추에 닿을 때까지 (단추 차례는 화면마다 달라 몇 번인지 안 정함)
    await expect(async () => {
        await page.keyboard.press('Tab');
        await expect(ready).toBeFocused({ timeout: 300 });
    }).toPass({ timeout: 20_000 });
    await page.keyboard.press('Enter');
    await K.expectSeats(page, seats(R, 5));
    await expect(page.getByRole('button', { name: '준비취소' })).toBeEnabled();
});
