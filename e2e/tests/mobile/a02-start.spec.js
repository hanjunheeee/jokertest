'use strict';

// 모바일 사람 방장 시작 브라우저 시험 — 폰 화면으로 방 만들고 봇 모아 시작하면 역할 창, 4명이면 시작 단추 꺼짐 + 까닭 글 + 역할 확인 중 광대가 나가면 시민 승
// 목록 A02-판시작-역할.md 번호 A02-E-177~180 (사파리도: E-177)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const ui = require('../../helpers/ui');
const { botsJoinAndReady, waitResult } = require('../room/roomHelpers');
const { botLeave } = require('./_talk');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
// 인원이 모자라 "게임시작"이 꺼졌을 때 까닭 글 (단위 18, 화면 gameStartMessages.js 글)
const START_LOCKED_TEXT = '5명부터 시작할 수 있습니다. (지금 4명)';

// 폰 설정 화면에서 처음 값(정원 10·자동 구성)으로 방 만들기 → 서버 방 요약
async function createRoomOnPhone(user) {
    const page = user.page;
    await page.goto('/game-setup');
    const make = page.getByRole('button', { name: '게임 만들기' });
    await expect(make).toBeEnabled();
    await make.click();
    await expect(page).toHaveURL(/\/game-matching/);
    let room = null;
    await expect.poll(async () => { room = await e2e.roomOf(user.account.uuid); return Boolean(room); }).toBe(true);
    return room;
}

// 봇 n명 입장·준비 → 방장(사람) 준비 → 대기방 인원 글이 맞을 때까지
async function fillRoom(user, bots, room) {
    const page = user.page;
    await botsJoinAndReady(bots, user.account.uuid, room.roomCode);
    const total = bots.length + 1;
    await expect.poll(async () => (await e2e.roomOf(user.account.uuid))?.players?.length).toBe(total);
    await page.getByRole('button', { name: '준비완료' }).click();
    await expect(page.getByRole('button', { name: '준비취소' })).toBeVisible();
    await expect(page.locator(`[aria-label="파티 인원 ${total}명"]`)).toHaveCount(1);
}

// 사람 시민·첫 봇 광대로 예약 → 게임시작 → 역할 창에 "귀족"(시민 직업 화면 이름)
async function startAndSeeReveal(user, bots, room) {
    const page = user.page;
    await e2e.setRoles({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' }, { roomId: room.roomId });
    await page.getByRole('button', { name: '게임시작' }).click();
    await expect(page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const dialog = revealDialog(page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expectReadable(dialog.getByText(user.account.nickname, { exact: true }));
    await expectReadable(dialog.getByText('귀족', { exact: true }));
}

test('A02-E-177 모바일 사람 방장 5명 시작 → 역할 창 뜸 @game @safari @smoke', async ({ user, bots }) => {
    const room = await createRoomOnPhone(user);
    const list = await bots.spawn(4);
    await fillRoom(user, list, room);
    await startAndSeeReveal(user, list, room);
});

test('A02-E-178 모바일 사람 방장 10명 시작 → 역할 창 뜸 @game', async ({ user, bots }) => {
    const room = await createRoomOnPhone(user);
    const list = await bots.spawn(9);
    await fillRoom(user, list, room);
    await startAndSeeReveal(user, list, room);
});

// 5명보다 적으면 방장 화면의 "게임시작"이 미리 꺼지고 까닭 글이 보임 (결정 2026-11-16 낮 5번)
test('A02-E-179 모바일 사람 방장 4명 전원 준비 → "게임시작" 단추 꺼짐, 까닭 글 읽힘, 대기방 그대로', async ({ user, bots }) => {
    const page = user.page;
    const room = await createRoomOnPhone(user);
    const list = await bots.spawn(3);
    await fillRoom(user, list, room);
    await expect(page.getByRole('button', { name: '게임시작' })).toBeDisabled();
    const reason = page.getByTestId('start-locked-reason');
    await expect(reason).toHaveText(START_LOCKED_TEXT);
    await expectReadable(reason);
    await expect(page).toHaveURL(/\/game-matching/);
    expect(await e2e.gameOf(user.account.uuid), '판이 안 생김').toBeNull();
    expect(await e2e.roomOf(user.account.uuid), '대기방이 없어짐').not.toBeNull();
});

test('A02-E-180 모바일 5명(광대 1·사람 시민) 역할 확인 중 광대 봇 나감 → 결과 화면 시민 승 @game', async ({ user, table }) => {
    const me = user.account.uuid;
    const page = user.page;
    const t = await table.setup({ humans: [user], bots: 4, roles: ({ bots: b }) => ({ [me]: 'CITIZEN', [b[0].account.uuid]: 'JOKER' }) });
    const s = await t.state();
    expect(s.players.find((p) => p.uuid === me)?.role, '미리 정한 내 직업').toBe('CITIZEN');
    // 광대 봇은 서버 값으로 찾음 (예약이 다른 봇으로 맞바뀌어도 됨)
    const jokerIndex = t.bots.findIndex((b) => s.players.find((p) => p.uuid === b.account.uuid)?.role === 'JOKER');
    expect(jokerIndex, '광대 봇').toBeGreaterThanOrEqual(0);
    expect(s.phase, '아직 역할 확인 단계').toBe('ROLE_REVEAL');
    const reply = await botLeave(t, jokerIndex);
    expect(reply?.ok, `광대 봇 나가기 답 ${JSON.stringify(reply)}`).toBe(true);
    await waitResult(page);
    // 결과판 1.5초 뒤 뜨는 전면 광고 창이 글을 덮음 → 닫고 봄
    await ui.closeResultAd(page);
    await expectReadable(page.getByText('시민 진영 승리', { exact: true }));
});
