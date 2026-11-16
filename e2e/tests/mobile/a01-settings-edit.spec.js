'use strict';

// 모바일 방 설정 바꾸기 브라우저 시험 — 설정 화면에 지운 3칸 없음, 저장하면 봇 준비 풀림, 정원 줄이기 거절 글, 손님엔 설정·시작 단추 없음, 손님 준비 풀림
// 목록 A01a-방만들기-설정-시작.md 번호 A01-E-116~120, 돌리지 않고 모임만: npx playwright test --list tests/mobile/a01-settings-edit.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { botsJoinAndReady, botUpdateSettings } = require('../room/roomHelpers');
const K = require('../room/_a01a-kit');

const readyCount = (room) => room.players.filter((p) => p.isReady).length;

/** 사람 방장 방 + 봇 n 들어와 준비 */
async function hostRoomWithBots(user, bots, n) {
    const room = await K.createRoomOn(user);
    const list = await bots.spawn(n);
    await botsJoinAndReady(list, K.U(user), room.roomCode);
    await expect.poll(async () => readyCount(await e2e.roomOf(K.U(user)))).toBe(n);
    return { room, list };
}

/** 봇 방장 공개 방에 사람 손님 */
async function guestInBotRoom(user, bots) {
    const [host] = await bots.spawn(1);
    const room = await host.createRoom({ accessType: 'open', maxPlayers: 10 });
    await ui.joinRoomByCodeUi(user.page, room.roomCode);
    return { host, room };
}

test('A01-E-116 모바일 방장 설정 바꾸기 화면 두 탭 → "불이 꺼진 무도회"·"영혼의 베팅"·"투표 공개" 없음 @smoke', async ({ user }) => {
    await K.createRoomOn(user);
    await K.openEditor(user.page);
    await K.expectNoRemovedFields(user.page);
});

test('A01-E-117 모바일 사람 방장 + 봇 4 준비 → 정원 8 저장 → 서버 봇 준비 풀림', async ({ user, bots }) => {
    const page = user.page;
    await hostRoomWithBots(user, bots, 4);
    await K.openEditor(page);
    await K.fill(page, { maxPlayers: 8 });
    await K.saveEditor(page);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.settings?.maxPlayers).toBe(8);
    expect(readyCount(await e2e.roomOf(K.U(user)))).toBe(0);
});

test('A01-E-118 모바일 7명 방 정원 6 저장 → "현재 인원(7명)보다…" 거절 글 읽힘', async ({ user, bots }) => {
    const page = user.page;
    await hostRoomWithBots(user, bots, 6);
    await K.openEditor(page);
    await K.fill(page, { maxPlayers: 6 });
    await page.getByRole('button', { name: '설정 저장', exact: true }).click();
    const error = page.getByRole('alert').filter({ hasText: K.MSG.BELOW_OCCUPANCY(7) });
    await expect(error).toHaveText(K.MSG.BELOW_OCCUPANCY(7));
    await expectReadable(error);
    expect((await e2e.roomOf(K.U(user))).settings.maxPlayers).toBe(10);
});

test('A01-E-119 모바일 사람 손님 → "방 설정 변경"·"게임시작" 단추 없음', async ({ user, bots }) => {
    const page = user.page;
    await guestInBotRoom(user, bots);
    await expect(page.getByRole('button', { name: '준비완료' })).toBeVisible();
    await expect(page.getByRole('button', { name: '방 설정 변경', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '게임시작' })).toHaveCount(0);
});

test('A01-E-120 모바일 사람 손님 준비 → 봇 방장 설정 바꿈 → 단추 "준비완료"로 돌아감', async ({ user, bots }) => {
    const page = user.page;
    const { host } = await guestInBotRoom(user, bots);
    await K.readyMe(page);
    expect((await botUpdateSettings(host, { dayDiscussionTime: 90 }))?.ok).toBe(true);
    await expect(page.getByRole('button', { name: '준비완료' })).toBeVisible();
    await expect(page.getByRole('button', { name: '준비취소' })).toHaveCount(0);
});
