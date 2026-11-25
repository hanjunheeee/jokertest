'use strict';

// 모바일 시작 브라우저 시험 — 4명·준비 안 함·구성 안 맞음·끊긴 봇이면 "게임시작" 뒤 막힘 시트 글이 읽힘, 5명·10명이면 판 화면, 폭 360·375·412에서 시트 글·확인 단추 읽힘
// 목록 A01a-방만들기-설정-시작.md 번호 A01-E-121~129 (사파리도: E-121), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a01-start.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { blockedDialog } = require('../room/roomHelpers');
const K = require('../room/_a01a-kit');

const startButton = (page) => page.getByRole('button', { name: '게임시작' });

// 모바일(상대 화면)은 "게임시작"을 미리 안 끔 → 누르면 서버 거절 글이 막힘 창에 뜸 (frontend-mobile matching/components/actions/ActionBar.jsx·startBlocked/StartBlockedSheet.jsx)
test('A01-E-121 모바일 4명 전원 준비 → "게임시작" → 막힘 창 인원 조건 글 읽힘, 대기방 그대로 @safari @smoke', async ({ user, bots }) => {
    const botList = await bots.spawn(3);
    await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1 });
    await startButton(user.page).click();
    await K.expectStartRejected(user, K.MSG.MIN_PLAYERS, { sheet: true });
});

test('A01-E-122 모바일 5명 중 봇 1 준비 안 함 → "게임시작" → 막힘 창 준비 안 함 글 읽힘, 판 안 열림', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    const room = await K.createRoomOn(user, { maxPlayers: 5, jokers: 1 });
    await K.botsJoin(botList, room.roomCode);
    await K.botsReady(botList.slice(0, 3), K.U(user));
    await K.readyMe(user.page);
    await startButton(user.page).click();
    await K.expectStartRejected(user, K.MSG.NOT_READY, { sheet: true });
});

test('A01-E-123 모바일 정원 10 광대2·의사2·경비원2·마녀사냥꾼2, 5명 → 구성 거절 글 읽힘', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 10, custom: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
    await startButton(user.page).click();
    await K.expectStartRejected(user, K.MSG.ROLE_MISMATCH);
});

// A01-E-124~125: 5명 / 10명 전원 준비 → 판 화면
for (const [no, n] of [[124, 5], [125, 10]]) {
    test(`A01-E-${no} 모바일 정원 10 방 ${n}명 전원 준비 → "게임시작" → 판 화면 @game`, async ({ user, bots }) => {
        test.setTimeout(180_000);
        const botList = await bots.spawn(n - 1);
        const room = await K.readyRoom(user, botList, { maxPlayers: 10, jokers: 1 });
        const presets = K.autoRoles([user], botList);
        await e2e.setRoles(presets, { roomId: room.roomId });
        await startButton(user.page).click();
        await expect(user.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
        const game = await e2e.gameOf(K.U(user));
        expect(game.players).toHaveLength(n);
        await K.expectRolesTaken(game.gameId, presets);
    });
}

test('A01-E-126 모바일 5명 전원 준비, 봇 1 끊김 → 연결 확인 거절 글 읽힘', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    await K.readyRoom(user, botList, { maxPlayers: 5, jokers: 1 });
    botList[3].socket.disconnect();
    await expect.poll(() => botList[3].socket.connected).toBe(false);
    await startButton(user.page).click();
    await K.expectStartRejected(user, K.MSG.UNAVAILABLE);
});

// A01-E-127~129: 폭마다 막힘 시트 (전원 준비 5명, 구성 안 맞음 거절 글)
for (const [no, width] of [[127, 360], [128, 375], [129, 412]]) {
    test(`A01-E-${no} 모바일 폭 ${width} 막힘 시트(전원 준비 5명, 정원 10 광대2·의사2·경비원2·마녀사냥꾼2 구성 안 맞음) → 글·확인 단추 읽힘`, async ({ user, bots }) => {
        const page = user.page;
        await page.setViewportSize({ width, height: 812 });
        const botList = await bots.spawn(4);
        await K.readyRoom(user, botList, { maxPlayers: 10, custom: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
        await startButton(page).click();
        const sheet = blockedDialog(page);
        await expect(sheet.getByRole('alert')).toHaveText(K.MSG.ROLE_MISMATCH);
        await expectReadable(sheet.getByRole('alert'));
        await expectReadable(sheet.getByRole('button', { name: '확인' }));
    });
}
