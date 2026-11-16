'use strict';

// 대기방 브라우저 뒤로 가기 시험 (모바일) — 방장 혼자 대기방에서 브라우저 뒤로 → 게임 설정 화면이 열리며 방 없어지고 바로 방 만들기 됨
// 목록 A10-로비-입장-방어.md 번호 A10-E-039 (판 없음, 쓰는 동안 안 돌림)
const { test, expect, e2e } = require('../../helpers/fixtures');
const H = require('../result/_a08-hard-kit');

const ALREADY_IN_ROOM = '이미 참여 중인 방이 있습니다.';
const U = (x) => x.account.uuid;

test('A10-E-039 모바일 방장 혼자 대기방 → 브라우저 뒤로 → 방 없음, 방 만들기 됨 @smoke', async ({ user }) => {
    const page = user.page;
    // 게임 설정 화면 → 게임 만들기 → 대기방 (뒤로 가면 게임 설정 화면)
    const first = await H.createRoomOnPhone(user);
    await page.goBack();
    await expect(page).toHaveURL(/\/game-setup/);
    await expect.poll(() => e2e.roomOf(U(user)), { message: '내 대기방 자리' }).toBeNull();
    const make = page.getByRole('button', { name: '게임 만들기' });
    await expect(make).toBeEnabled();
    await make.click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await expect(page.getByText(ALREADY_IN_ROOM)).toHaveCount(0);
    await expect.poll(async () => (await e2e.roomOf(U(user)))?.hostUuid, { message: '새 방 방장 = 나' }).toBe(U(user));
    expect((await e2e.roomOf(U(user)))?.roomId, '새 방').not.toBe(first.roomId);
});
