'use strict';

// 모바일 사람 방장 시작 브라우저 시험 — 폰 화면으로 방 만들고 봇 모아 시작하면 역할 창, 4명이면 거절 글 + 역할 확인 중 광대가 나가면 시민 승
// 목록 A02-판시작-역할.md 번호 A02-E-177~180 (사파리도: E-177)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { botsJoinAndReady, waitResult } = require('../room/roomHelpers');
const { botLeave } = require('./_talk');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
// 인원 모자람 거절 글 (단위 18, 서버 start.js 글)
const MIN_PLAYERS_TEXT = '게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다.';

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

// 사람 시민·첫 봇 광대로 예약 → 게임시작 → 역할 창에 "시민"
async function startAndSeeReveal(user, bots, room) {
    const page = user.page;
    await e2e.setRoles({ [user.account.uuid]: 'CITIZEN', [bots[0].account.uuid]: 'JOKER' }, { roomId: room.roomId });
    await page.getByRole('button', { name: '게임시작' }).click();
    await expect(page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const dialog = revealDialog(page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expectReadable(dialog.getByText(user.account.nickname, { exact: true }));
    await expectReadable(dialog.getByText('시민', { exact: true }));
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

test('A02-E-179 모바일 사람 방장 4명 전원 준비 → 시작 거절 글 읽힘, 대기방 그대로', async ({ user, bots }) => {
    const page = user.page;
    const room = await createRoomOnPhone(user);
    const list = await bots.spawn(3);
    await fillRoom(user, list, room);
    await page.getByRole('button', { name: '게임시작' }).click();
    const blocked = page.getByRole('dialog', { name: '게임 시작 불가' });
    await expect(blocked).toBeVisible();
    await expect(blocked.getByRole('alert')).toHaveText(MIN_PLAYERS_TEXT);
    await expectReadable(blocked.getByRole('alert'));
    await expect(page).toHaveURL(/\/game-matching/);
    expect(await e2e.gameOf(user.account.uuid), '판이 안 생김').toBeNull();
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
    await expectReadable(page.getByText('시민 진영 승리', { exact: true }));
});
