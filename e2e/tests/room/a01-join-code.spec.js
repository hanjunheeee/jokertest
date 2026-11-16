'use strict';

// 방 코드로 대기방 들어오기 브라우저 시험 (PC) — 들어오면 "대기중", 소문자, 없는 코드·가득 참·시작된 방·3번 쫓겨남·탈주 대기 거절 글, 1분 20번 제한, 정원 10 마지막 자리
// 목록 A01b-입장-준비-추방-초대.md 번호 A01-E-501~514 — PC는 거절 글이 브라우저 알림 창이라 글만 봄(대비는 못 봄)
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi } = require('./roomHelpers');
const K = require('./_a01b-join-kit');

const { R, W, seats, MSG } = K;

test('A01-E-501 코드로 들어옴 (정원 6 · 봇 4) → 대기방, 내 자리 "대기중", 파티 인원 5 @smoke', async ({ user, bots }) => {
    const page = user.page;
    // 봇은 다 준비해 둠 → 준비 안 한 자리 하나가 내 자리 (자리 차례 = 들어온 차례, 나는 맨 끝)
    const { code } = await K.botRoom(bots, { max: 6, count: 4, ready: true });
    await ui.joinRoomByCodeUi(page, code);
    await K.expectSeats(page, seats(R, 4, W));
    await K.expectParty(page, 5);
});

test('A01-E-502 소문자로 쳐도 들어옴 (정원 5 · 봇 3) → 칸에 대문자, 대기방', async ({ user, bots }) => {
    const page = user.page;
    const { code } = await K.botRoom(bots, { max: 5, count: 3 });
    await K.typeCode(page, code.toLowerCase());
    // 칸 6개에 대문자로 보임 (예: 'abc234' → A·B·C·2·3·4)
    const boxes = page.getByRole('group', { name: '방 코드 6자리' }).getByRole('textbox');
    await expect(boxes).toHaveCount(6);
    for (let i = 0; i < 6; i += 1) await expect(boxes.nth(i)).toHaveValue(code[i]);
    await K.joinButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/);
    await K.expectParty(page, 4);
});

test('A01-E-503 없는 코드 → "입장 코드가 올바르지 않습니다. 코드를 다시 확인해주세요.", 코드 화면 그대로', async ({ user }) => {
    const page = user.page;
    const text = await K.codeAlert(page, K.NO_SUCH_CODE);
    expect(text).toBe(MSG.CODE_WRONG);
    await expect(page).toHaveURL(/\/roomInvite/);
});

test('A01-E-504 가득 찬 방 (정원 5 · 봇 5) → "방 정원이 가득 찼습니다."', async ({ user, bots }) => {
    const page = user.page;
    const { code, host } = await K.botRoom(bots, { max: 5, count: 5 });
    expect(await K.codeAlert(page, code)).toBe(MSG.CODE_FULL);
    await expect(page).not.toHaveURL(/\/game-matching/);
    expect(await K.roomSize(host.uuid)).toBe(5);
});

test('A01-E-505 시작된 방 (판 5명 봇 진행 중) → "이미 게임이 시작된 방이라 입장할 수 없습니다." @game', async ({ user, bots }) => {
    const page = user.page;
    const { code } = await K.botGame(bots, { count: 5 });
    expect(await K.codeAlert(page, code)).toBe(MSG.STARTED);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A01-E-506 3번 쫓겨난 방 (정원 7 · 봇 방장 + 봇 3) → 4번째 입장 "이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다."', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const { code, host } = await K.botRoom(bots, { max: 7, count: 4 });
    await K.kickedThrice(user, host, code);
    expect(await K.codeAlert(page, code)).toBe(MSG.KICK3);
    await expect(page).not.toHaveURL(/\/game-matching/);
    expect(await K.roomSize(host.uuid)).toBe(4);
});

test('A01-E-507 탈주 대기 중 (정원 6 · 봇 2) → "탈주로 4분 …초 뒤에 참여할 수 있습니다." @game', async ({ user, bots, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    // 들어가 볼 방은 나가기 전에 만들어 둠 (나간 직후 눌러 봄 → 남은 시간 4분대)
    const { code } = await K.botRoom(bots, { max: 6, count: 2 });
    await K.desert(table, user);
    const text = await K.codeAlert(page, code);
    expect(text).toMatch(/^탈주로 4분 \d{1,2}초 뒤에 참여할 수 있습니다\.$/);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

// 1분 안 틀린 코드 n번 (한 번 친 코드는 칸에 남아 "참여하기"만 다시 누름) → 뜬 글들
async function wrongCodeTimes(page, n) {
    await K.typeCode(page, K.NO_SUCH_CODE);
    const texts = [];
    for (let i = 0; i < n; i += 1) texts.push(await ui.captureAlert(page, () => K.joinButton(page).click()));
    return texts;
}

test('A01-E-508 1분 안 틀린 코드 20번째까지는 틀림 글', async ({ user }) => {
    test.setTimeout(150_000);
    const startedAt = Date.now();
    const texts = await wrongCodeTimes(user.page, 20);
    // 20번이 1분 창 안에 다 들어가야 이 케이스 뜻이 맞음
    expect(Date.now() - startedAt, '20번 시도가 1분 안').toBeLessThan(60_000);
    expect(texts).toEqual(Array(20).fill(MSG.CODE_WRONG));
});

test('A01-E-509 이어서 맞는 코드 21번째 → "입장 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", 대기방 안 감 (정원 6 · 봇 2)', async ({ user, bots }) => {
    test.setTimeout(150_000);
    const page = user.page;
    const { code, host } = await K.botRoom(bots, { max: 6, count: 2 });
    const startedAt = Date.now();
    await wrongCodeTimes(page, 20);
    const text = await K.codeAlert(page, code);
    expect(Date.now() - startedAt, '21번 시도가 1분 안').toBeLessThan(60_000);
    expect(text).toBe(MSG.TOO_MANY);
    await expect(page).not.toHaveURL(/\/game-matching/);
    expect(await K.roomSize(host.uuid)).toBe(2);
});

test('A01-E-510 사람이 방장, 봇이 코드로 들어옴 (정원 8) → 방장 화면에 새 자리 "대기중", 인원 2', async ({ user, bots }) => {
    const page = user.page;
    await createRoomUi(user, { maxPlayers: 8 });
    await K.expectSeats(page, seats(W));
    await K.botsIntoHumanRoom(bots, K.U(user), 1);
    await K.expectSeats(page, seats(W, 2));
    await K.expectParty(page, 2);
});

test('A01-E-511 들어오면 내 단추는 "준비완료"(아직 준비 안 함), "방 나가기" 있음 (정원 6 · 봇 3)', async ({ user, bots }) => {
    const page = user.page;
    const { code } = await K.botRoom(bots, { max: 6, count: 3 });
    await ui.joinRoomByCodeUi(page, code);
    const ready = page.getByRole('button', { name: '준비완료' });
    await expect(ready).toBeEnabled({ timeout: 20_000 });
    await expectReadable(ready);
    await expect(page.getByRole('button', { name: '준비취소' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '방 나가기' })).toBeVisible();
});

test('A01-E-512 틀린 코드 → 알림 → 맞는 코드 → 대기방 (정원 6 · 봇 2)', async ({ user, bots }) => {
    const page = user.page;
    const { code } = await K.botRoom(bots, { max: 6, count: 2 });
    expect(await K.codeAlert(page, K.NO_SUCH_CODE)).toBe(MSG.CODE_WRONG);
    await ui.joinRoomByCodeUi(page, code);
    await K.expectParty(page, 3);
});

test('A01-E-513 정원 10 마지막 자리 (봇 9) → 코드 입장 → 인원 10', async ({ user, bots }) => {
    const page = user.page;
    const { code } = await K.botRoom(bots, { max: 10, count: 9 });
    await ui.joinRoomByCodeUi(page, code);
    await K.expectParty(page, 10);
});

test('A01-E-514 꽉 찬 뒤 봇 입장은 막힘 (정원 10 · 봇 9 + 나) → 사람 화면 인원 10 그대로', async ({ user, bots }) => {
    const page = user.page;
    const { code, room } = await K.botRoom(bots, { max: 10, count: 9 });
    await ui.joinRoomByCodeUi(page, code);
    await K.expectParty(page, 10);
    const [late] = await bots.spawn(1);
    await expect(late.joinByCode(room.roomCode)).rejects.toThrow(/ROOM_FULL/);
    await K.expectParty(page, 10);
    await expect(K.seatBadges(page)).toHaveCount(10);
});
