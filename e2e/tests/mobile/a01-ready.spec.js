'use strict';

// 대기방 준비·준비 취소 브라우저 시험 (모바일) — 내 자리 글 바뀜, 준비 취소, 봇 준비가 사람 방장 화면에, 대기방 채팅 칸 없음
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-E-577~580 — 자리 글은 들어온 차례대로라 내 자리 = 들어온 차례 자리
const { test, expect, ui } = require('../../helpers/fixtures');
const { createRoomUi } = require('../room/roomHelpers');
const K = require('../room/_a01b-join-kit');

const { R, W, seats, U } = K;

// 봇 방(봇 방장 + 봇 2, 전부 준비)에 코드로 들어감 → 내 자리는 맨 끝 "대기중"
async function joinReadyBotRoom(user, bots) {
    const r = await K.botRoom(bots, { max: 6, count: 3, ready: true });
    await ui.joinRoomByCodeUi(user.page, r.code);
    await K.waitVerified(user.page);
    await K.expectSeats(user.page, seats(R, 3, W));
    return r;
}

test('A01-E-577 모바일 준비 (정원 6 · 봇 3) → "준비완료" → 자리 "준비완료" @smoke @safari', async ({ user, bots }) => {
    const page = user.page;
    await joinReadyBotRoom(user, bots);
    await ui.readyUi(page);
    await K.expectSeats(page, seats(R, 4));
    await expect(page.getByRole('button', { name: '준비취소' })).toBeEnabled();
});

test('A01-E-578 모바일 준비 취소 (정원 6) → "준비취소" → "대기중"', async ({ user, bots }) => {
    const page = user.page;
    await joinReadyBotRoom(user, bots);
    await ui.readyUi(page);
    await K.expectSeats(page, seats(R, 4));
    await page.getByRole('button', { name: '준비취소' }).click();
    await K.expectSeats(page, seats(R, 3, W));
    await expect(page.getByRole('button', { name: '준비완료' })).toBeEnabled();
});

test('A01-E-579 모바일 봇 준비 반영 (정원 7 · 사람 방장) → 봇 준비 → 그 자리 "준비완료"', async ({ user, bots }) => {
    const page = user.page;
    const room = await createRoomUi(user, { maxPlayers: 7 });
    const [guest] = await K.botsIntoHumanRoom(bots, U(user), 1);
    await K.expectSeats(page, seats(W, 2));
    await K.botReady(guest, room);
    await K.expectSeats(page, seats(W, R));
});

test('A01-E-580 모바일 대기방에 채팅 칸 없음 (정원 6) → 채팅 입력칸 0개', async ({ user, bots }) => {
    const page = user.page;
    const { code } = await K.botRoom(bots, { max: 6, count: 2 });
    await ui.joinRoomByCodeUi(page, code);
    await K.waitVerified(page);
    await expect(page.getByRole('textbox', { name: '채팅 입력' })).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
});
