'use strict';

// 대기방 브라우저 뒤로 가기 시험 (PC) — 대기방에서 브라우저 뒤로를 누르면 앞 화면(게임 설정·방 목록)이 열리며 그 방에서 빠짐, 방장 혼자면 방 없어지고 바로 방 만들기 됨
// 목록 A10-로비-입장-방어.md 번호 A10-E-037·038 (판 없음, 쓰는 동안 안 돌림)
// 손님은 방 목록으로 들어옴: 코드 입력 화면에서 들어오면 뒤로 가기가 코드 입력 화면(정리 안 하는 곳)으로 가서
const { test, expect, e2e } = require('../../helpers/fixtures');
const { createRoomUi } = require('../room/roomHelpers');
const K = require('../ingame/_a09-simple-kit');

const ALREADY_IN_ROOM = '이미 참여 중인 방이 있습니다.';
const U = (x) => x.account?.uuid ?? x.uuid;

test('A10-E-037 PC 방장 혼자 대기방 → 브라우저 뒤로 → 방 없음, 방 만들기 됨 @smoke', async ({ user }) => {
    const page = user.page;
    // 게임 설정 화면 → 게임 만들기 → 대기방 (뒤로 가면 게임 설정 화면)
    await createRoomUi(user, {});
    await page.goBack();
    await expect(page).toHaveURL(/\/game-setup/);
    await expect.poll(() => e2e.roomOf(U(user)), { message: '내 대기방 자리' }).toBeNull();
    const said = [];
    page.on('dialog', (d) => { said.push(d.message()); d.accept().catch(() => {}); });
    await page.getByRole('button', { name: '게임 만들기' }).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    expect(said).not.toContain(ALREADY_IN_ROOM);
    await expect.poll(async () => (await e2e.roomOf(U(user)))?.hostUuid, { message: '새 방 방장 = 나' }).toBe(U(user));
});

test('A10-E-038 PC 봇 방장 6명 공개 방 손님 → 브라우저 뒤로 → 방 명단 5명', async ({ user, bots }) => {
    const page = user.page;
    const [host, ...rest] = await bots.spawn(5);
    const room = await host.createRoom({ accessType: 'open', maxPlayers: 6 });
    for (const bot of rest) await bot.joinByCode(room.roomCode);
    // 방 목록 → 선택한 방 입장 → 대기방 (뒤로 가면 방 목록)
    await K.pickPublicRoom(page, `${host.nickname}의 방`);
    await K.enterPicked(page).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await expect.poll(async () => (await e2e.roomOf(host.uuid))?.players.length, { message: '들어간 뒤 명단' }).toBe(6);
    await page.goBack();
    await expect(page).toHaveURL(/\/multiplay/);
    await expect.poll(async () => (await e2e.roomOf(host.uuid))?.players.length, { message: '뒤로 간 뒤 명단' }).toBe(5);
    expect(await e2e.roomOf(U(user))).toBeNull();
});
