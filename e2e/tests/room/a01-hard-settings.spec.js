'use strict';

// 방 설정 바꾸기 어려운 브라우저 시험 (사람 여럿) — 바꾸면 손님 준비 풀림 → 다시 준비 → 시작, 저장·준비가 겹침, 정원 줄이는 순간 입장, PC 방장·모바일 손님, 저장 답 잃음
// 목록 A01a-방만들기-설정-시작.md 번호 A01-H-001~004·014 (@hard), 돌리지 않고 모임만: npx playwright test --list tests/room/a01-hard-settings.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { e2e } = require('../../helpers/internal');
const { botsJoinAndReady } = require('./roomHelpers');
const K = require('./_a01a-kit');

const roomOfHost = (host) => e2e.roomOf(K.U(host));
const isReadyIn = (room, who) => Boolean(room?.players.find((p) => p.uuid === K.U(who))?.isReady);

test('A01-H-001 사람 2 + 봇 5 = 7명: B 준비 → A 정원 8로 → B 준비 풀림 → B 다시 준비 → A 시작 → 둘 다 판 @game @hard @smoke', async ({ user, players, bots }) => {
    test.setTimeout(240_000);
    const A = user;
    const B = await players.add();
    const room = await K.createRoomOn(A, { maxPlayers: 10, jokers: 1 });
    await ui.joinRoomByCodeUi(B.page, room.roomCode);
    const botList = await bots.spawn(5);
    await botsJoinAndReady(botList, K.U(A), room.roomCode);
    await K.readyMe(B.page);

    await K.openEditor(A.page);
    await K.fill(A.page, { maxPlayers: 8 });
    await K.saveEditor(A.page);
    await expect(B.page.getByRole('button', { name: '준비완료' })).toBeVisible();
    await expect.poll(async () => isReadyIn(await roomOfHost(A), B)).toBe(false);

    await K.readyMe(B.page);
    await K.botsReady(botList, K.U(A));
    await K.readyMe(A.page);
    const presets = K.autoRoles([A, B], botList);
    await e2e.setRoles(presets, { roomId: room.roomId });
    await A.page.getByRole('button', { name: '게임시작' }).click();
    for (const p of [A, B]) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const game = await e2e.gameOf(K.U(A));
    expect(game.players).toHaveLength(7);
    expect((await e2e.gameOf(K.U(B)))?.gameId).toBe(game.gameId);
    await K.expectRolesTaken(game.gameId, presets);
});

test('A01-H-002 사람 2 + 봇 3 = 5명: A 저장과 B 준비를 같은 때 → 끝에 B 서버 준비 = B 화면 단추, 옛 버전 준비는 안 남음 @hard', async ({ user, players, bots }) => {
    const A = user;
    const B = await players.add();
    const room = await K.createRoomOn(A, { maxPlayers: 10, jokers: 1 });
    await ui.joinRoomByCodeUi(B.page, room.roomCode);
    await botsJoinAndReady(await bots.spawn(3), K.U(A), room.roomCode);
    await K.openEditor(A.page);
    await K.fill(A.page, { maxPlayers: 9 });
    await Promise.all([
        A.page.getByRole('button', { name: '설정 저장', exact: true }).click(),
        B.page.getByRole('button', { name: '준비완료' }).click(),
    ]);
    await expect.poll(async () => (await roomOfHost(A))?.settings?.maxPlayers).toBe(9);
    // 화면과 서버가 같은 상태로 멈출 때까지
    await expect(async () => {
        const live = await roomOfHost(A);
        const ready = isReadyIn(live, B);
        await expect(B.page.getByRole('button', { name: ready ? '준비취소' : '준비완료' })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
    const live = await roomOfHost(A);
    expect(live.settingsVersion, '설정은 한 번 바뀜').toBe(room.settingsVersion + 1);
    // 봇 셋은 설정이 바뀌어 풀렸어야 함 (옛 버전 준비가 남지 않음)
    expect(live.players.filter((p) => ![K.U(A), K.U(B)].includes(p.uuid) && p.isReady)).toHaveLength(0);
});

test('A01-H-003 6명 방에서 A가 정원 6 저장하는 순간 C가 코드 입장 → 저장·입장 둘 다 되진 않음 @hard', async ({ user, players, bots }) => {
    const A = user;
    const B = await players.add();
    const C = await players.add();
    const room = await K.createRoomOn(A, { maxPlayers: 10, jokers: 1 });
    await ui.joinRoomByCodeUi(B.page, room.roomCode);
    // A + B + 봇 4 = 6명 (봇 3이면 C가 들어와도 6명이라 둘 다 됨 → 겨루기가 안 생김, 보고에 적음)
    await botsJoinAndReady(await bots.spawn(4), K.U(A), room.roomCode);
    await expect.poll(async () => (await roomOfHost(A))?.players.length).toBe(6);
    await K.openEditor(A.page);
    await K.fill(A.page, { maxPlayers: 6 });
    // C 화면: 코드 입력까지 해 두고 "참여하기"만 남김, 뜬 알림은 닫기만
    C.page.on('dialog', (d) => { d.accept().catch(() => {}); });
    await C.page.goto('/roomInvite');
    await C.page.getByRole('textbox', { name: /방 코드/ }).first().click();
    await C.page.keyboard.type(room.roomCode);
    await Promise.all([
        A.page.getByRole('button', { name: '설정 저장', exact: true }).click(),
        C.page.getByRole('button', { name: '참여하기' }).click(),
    ]);
    // 둘 중 하나로 정리될 때까지
    await expect.poll(async () => {
        const live = await roomOfHost(A);
        const cIn = live.players.some((p) => p.uuid === K.U(C));
        return live.settings.maxPlayers === 6 || cIn;
    }, { timeout: 15_000 }).toBe(true);
    await expect(async () => {
        const live = await roomOfHost(A);
        const cIn = live.players.some((p) => p.uuid === K.U(C));
        expect(live.settings.maxPlayers === 6 && cIn, '정원 6 저장과 C 입장이 둘 다 됨').toBe(false);
        expect(live.players.length).toBeLessThanOrEqual(live.settings.maxPlayers);
        if (cIn) {
            await expect(A.page.getByRole('alert').filter({ hasText: K.MSG.BELOW_OCCUPANCY(7) })).toBeVisible({ timeout: 1000 });
        } else {
            await expect(C.page).not.toHaveURL(/\/game-matching/, { timeout: 1000 });
        }
    }).toPass({ timeout: 15_000 });
});

test('A01-H-004 PC 방장 A + 모바일 손님 B + 봇 3: A 정원 8로 → B 휴대폰 화면 "5/8"·준비 풀림 @hard', async ({ user, players, bots }) => {
    const A = user;
    const B = await players.add({ mobile: true });
    const room = await K.createRoomOn(A, { maxPlayers: 10, jokers: 1 });
    await ui.joinRoomByCodeUi(B.page, room.roomCode);
    await botsJoinAndReady(await bots.spawn(3), K.U(A), room.roomCode);
    await K.readyMe(B.page);
    await expect(K.capacity(B.page)).toHaveText('5/10');
    await K.openEditor(A.page);
    await K.fill(A.page, { maxPlayers: 8 });
    await K.saveEditor(A.page);
    await expect(K.capacity(B.page)).toHaveText('5/8');
    await expect(B.page.getByRole('button', { name: '준비완료' })).toBeVisible();
    expect(isReadyIn(await roomOfHost(A), B)).toBe(false);
});

test('A01-H-014 사람 2 + 봇 3: A 저장 직후 A 네트워크 끊었다 붙임 → 결과 다시 묻기로 A 화면 새 설정, B 화면과 같음 @hard', async ({ user, players, bots }) => {
    const A = user;
    const B = await players.add();
    const room = await K.createRoomOn(A, { maxPlayers: 10, jokers: 1 });
    await ui.joinRoomByCodeUi(B.page, room.roomCode);
    await botsJoinAndReady(await bots.spawn(3), K.U(A), room.roomCode);
    await K.openEditor(A.page);
    await K.fill(A.page, { maxPlayers: 8 });
    await A.page.getByRole('button', { name: '설정 저장', exact: true }).click();
    await A.context.setOffline(true);
    // 서버는 이미 받아 저장함 → B 화면이 새 값을 받은 것을 보고 A를 다시 붙임
    await expect(K.capacity(B.page)).toHaveText('5/8');
    await A.context.setOffline(false);
    await expect(async () => {
        // 답을 못 받았으면 "설정 저장 결과 확인" 단추가 뜸 → 누르면 결과를 다시 물음
        const verify = A.page.getByRole('button', { name: '설정 저장 결과 확인' });
        if (await verify.isVisible().catch(() => false)) await verify.click({ timeout: 1000 });
        await expect(K.capacity(A.page)).toHaveText('5/8', { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await expect(K.capacity(B.page)).toHaveText('5/8');
    expect((await roomOfHost(A)).settings.maxPlayers).toBe(8);
});
