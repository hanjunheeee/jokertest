'use strict';

// 어디서나 5~10명 운영 규칙 브라우저 시험 (PC) — 개발 값 시험 서버에서도 4명 방은 시작 거절·5명이면 시작, 정원은 5~10에서 멈춤, 판 차리기 도우미는 4명이면 차리기 전에 오류
// 목록 A18-설정-배포-광고.md 번호 A18-E-003·004·006 (단위 18), 돌리지 않고 모임만: npx playwright test --list --no-deps tests/maintenance/a18-prod-rules.spec.js
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi, botsJoinAndReady, blockedDialog } = require('../room/roomHelpers');
const K = require('./_a18-kit');

const MAX = '최대 플레이어 수';

test('A18-E-003 4명 방(사람 방장 + 봇 3) 전원 준비 → 시작 거절 글 읽힘·판 없음 → 봇 1 더 와 준비(5명) → 시작됨 @game @smoke', async ({ user, bots }) => {
    const page = user.page;
    const [b1, b2, b3, b4] = await bots.spawn(4);
    const room = await createRoomUi(user);
    await botsJoinAndReady([b1, b2, b3], K.U(user), room.roomCode);
    await ui.readyUi(page);
    await expect(page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.players?.length, { message: '방 인원' }).toBe(4);

    // 4명: 개발 값 서버여도 시작 거절 (개발용 작은 판 없음)
    await page.getByRole('button', { name: '게임시작' }).click();
    const alert = blockedDialog(page).getByRole('alert');
    await expect(alert).toHaveText(K.TEXT.MIN_PLAYERS);
    await expectReadable(alert);
    await expect(page).toHaveURL(/\/game-matching/);
    expect(await e2e.gameOf(K.U(user)), '4명이면 판 없음').toBeNull();

    // 5명째 봇이 들어와 준비 → 같은 방에서 시작됨 (직업은 정해 둠)
    await blockedDialog(page).getByRole('button', { name: '확인' }).click();
    await expect(blockedDialog(page)).toHaveCount(0);
    await botsJoinAndReady([b4], K.U(user), room.roomCode);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.players?.length, { message: '방 인원' }).toBe(5);
    await e2e.setRoles({ [K.U(user)]: 'CITIZEN', [K.U(b1)]: 'JOKER', [K.U(b2)]: 'CITIZEN', [K.U(b3)]: 'CITIZEN', [K.U(b4)]: 'CITIZEN' }, { roomId: room.roomId });
    await page.getByRole('button', { name: '게임시작' }).click();
    await expect(page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const game = await e2e.gameOf(K.U(user));
    expect(game?.players, '5명 판').toHaveLength(5);
});

test('A18-E-004 PC 방 만들기 최대 인원: 줄이기를 끝까지 → 5에서 멈춤, 늘리기를 끝까지 → 10에서 멈춤', async ({ user }) => {
    const page = user.page;
    await page.goto('/game-setup');
    await expect(page.getByRole('button', { name: '게임 만들기' })).toBeVisible();
    await page.getByRole('navigation', { name: '인게임 설정 탭' }).getByRole('button', { name: '일반', exact: true }).click();

    expect(await K.pushToEnd(page, MAX, '감소')).toBe(5);
    await expect(K.arrow(page, MAX, '감소')).toBeDisabled();
    expect(await K.pushToEnd(page, MAX, '증가')).toBe(10);
    await expect(K.arrow(page, MAX, '증가')).toBeDisabled();
});

test('A18-E-006 판 차리기 도우미에 사람 1 + 봇 3(4명) → 차리기 전에 분명한 오류, 서버에 방 안 생김', async ({ user, table }) => {
    await expect(table.setup({ humans: [user], bots: 3 })).rejects.toThrow(/5명 이상이어야 함/);
    expect(await e2e.roomOf(K.U(user)), '사람이 든 방 없음').toBeNull();
    await expect(user.page).not.toHaveURL(/\/game-matching/);
});
