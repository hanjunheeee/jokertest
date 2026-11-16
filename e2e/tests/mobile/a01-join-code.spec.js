'use strict';

// 방 코드로 대기방 들어오기 브라우저 시험 (모바일) — 들어오면 "대기중", 소문자, 없는 코드·가득 참·시작된 방·3번 쫓겨남·탈주 대기 거절 글, 정원 10 마지막 자리
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-E-515~522 — 모바일은 거절 글이 양피지 안내 창(window.alert 대신)이라 글을 읽고 닫음
const { test, expect, ui } = require('../../helpers/fixtures');
const K = require('../room/_a01b-join-kit');

const { R, W, seats, MSG } = K;

test('A01-E-515 모바일 코드로 들어옴 (정원 6 · 봇 3) → 대기방, 내 자리 "대기중" @smoke @safari', async ({ user, bots }) => {
    const page = user.page;
    // 봇은 다 준비해 둠 → 준비 안 한 맨 끝 자리가 내 자리
    const { code } = await K.botRoom(bots, { max: 6, count: 3, ready: true });
    await ui.joinRoomByCodeUi(page, code);
    await K.expectSeats(page, seats(R, 3, W));
    await K.expectParty(page, 4);
});

test('A01-E-516 모바일 소문자 (정원 5 · 봇 2) → 대문자 보임, 들어감', async ({ user, bots }) => {
    const page = user.page;
    const { code } = await K.botRoom(bots, { max: 5, count: 2 });
    await K.typeCode(page, code.toLowerCase());
    // 실제 입력칸 값과 그 위 글자 6칸(화면에 보이는 글) 둘 다 대문자
    const input = page.getByRole('textbox', { name: '방 코드 6자리' });
    await expect(input).toHaveValue(code);
    await expect(input.locator('xpath=..')).toHaveText(code);
    await K.joinButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/);
    await K.expectParty(page, 3);
});

test('A01-E-517 모바일 없는 코드 → "입장 코드가 올바르지 않습니다. 코드를 다시 확인해주세요."', async ({ user }) => {
    const page = user.page;
    expect(await K.codeAlert(page, K.NO_SUCH_CODE)).toBe(MSG.CODE_WRONG);
    await expect(page).toHaveURL(/\/roomInvite/);
});

test('A01-E-518 모바일 가득 참 (정원 5 · 봇 5) → "방 정원이 가득 찼습니다."', async ({ user, bots }) => {
    const page = user.page;
    const { code, host } = await K.botRoom(bots, { max: 5, count: 5 });
    expect(await K.codeAlert(page, code)).toBe(MSG.CODE_FULL);
    await expect(page).not.toHaveURL(/\/game-matching/);
    expect(await K.roomSize(host.uuid)).toBe(5);
});

test('A01-E-519 모바일 시작된 방 (판 6명 봇) → "이미 게임이 시작된 방이라 입장할 수 없습니다." @game', async ({ user, bots }) => {
    const page = user.page;
    const { code } = await K.botGame(bots, { count: 6 });
    expect(await K.codeAlert(page, code)).toBe(MSG.STARTED);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-520 모바일 3번 쫓겨남 (정원 6 · 봇 방장) → "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다."', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const { code, host } = await K.botRoom(bots, { max: 6, count: 1 });
    await K.kickedThrice(user, host, code);
    expect(await K.codeAlert(page, code)).toBe(MSG.KICK3);
    await expect(page).not.toHaveURL(/\/game-matching/);
    expect(await K.roomSize(host.uuid)).toBe(1);
});

test('A01-E-521 모바일 탈주 대기 (정원 6 · 봇 2) → "탈주로 …뒤에 참여할 수 있습니다." @game @safari', async ({ user, bots, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const { code } = await K.botRoom(bots, { max: 6, count: 2 });
    await K.desert(table, user);
    expect(await K.codeAlert(page, code)).toMatch(K.DESERTED);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-522 모바일 정원 10 마지막 자리 (봇 9) → 인원 10', async ({ user, bots }) => {
    const page = user.page;
    const { code } = await K.botRoom(bots, { max: 10, count: 9 });
    await ui.joinRoomByCodeUi(page, code);
    await K.expectParty(page, 10);
});
