'use strict';

// 사람 방장이 화면으로 시작하는 브라우저 시험 (PC) — 정원 안 채워도 지금 인원으로 시작·4명이면 시작 단추 꺼짐·구성 안 맞음·시민 0명·한 명 끊김·시작 두 번
// 목록 A02-판시작-역할.md 번호 A02-E-098~108 — 방은 사람이 화면으로 만들고 봇이 들어와 준비, 시작은 사람이 "게임시작" 누름
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi, botsJoinAndReady, blockedDialog, hostGame } = require('../room/roomHelpers');

const ROLE_NAME = ui.ROLE_LABELS;
const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
const U = (x) => x.account.uuid;

// 시작 거절 글 (서버 start.js·startLaunch.js 답 message → 화면 시작 막힘 창)
const MSG = {
    ROLE_MISMATCH: /^설정한 역할 구성이 현재 인원과 맞지 않습니다/,
    UNAVAILABLE: '일부 참가자와의 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.',
};

// 자동 구성 직업 줄 (결정 "구성 칸": 6명부터 의사·8명부터 경비원·10명부터 마녀사냥꾼) → 사람 시민, 봇은 앞부터 특수 직업
function autoRoles(host, botList) {
    const n = 1 + botList.length;
    const special = ['JOKER', ...(n >= 6 ? ['DOCTOR'] : []), ...(n >= 8 ? ['GUARD'] : []), ...(n >= 10 ? ['WITCH_HUNTER'] : [])];
    const out = { [U(host)]: 'CITIZEN' };
    botList.forEach((b, i) => { out[U(b)] = special[i] ?? 'CITIZEN'; });
    return out;
}

/**
 * 사람이 방 만들고 봇 들어와 준비 → 사람 준비까지 (시작은 안 누름)
 * @returns {Promise<object>} 서버 방 요약
 */
async function readyRoom(user, botList, settings) {
    const room = await createRoomUi(user, settings);
    await botsJoinAndReady(botList, U(user), room.roomCode);
    await expect(user.page.getByText(`파티 인원 ${1 + botList.length}명`)).toBeVisible();
    await ui.readyUi(user.page);
    await expect(user.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    return room;
}

// 시작 막힘 창의 거절 글이 읽힘 + 대기방 그대로, 판 없음
async function expectStartRejected(user, message) {
    const page = user.page;
    const alert = blockedDialog(page).getByRole('alert');
    await expect(alert).toHaveText(message);
    await expectReadable(alert);
    await expect(page).toHaveURL(/\/game-matching/);
    expect(await e2e.gameOf(U(user)), '판이 생김').toBeNull();
    expect(await e2e.roomOf(U(user)), '대기방이 없어짐').not.toBeNull();
}

// A02-E-098~103: 정원 10 방에 5~10명 → 시작 → 역할 창 (정원 안 채워도 지금 인원)
for (const [i, n] of [5, 6, 7, 8, 9, 10].entries()) {
    const no = 98 + i;
    const id = `A02-E-${String(no).padStart(3, '0')}`;
    const smoke = no === 98 ? ' @smoke' : '';
    test(`${id} 사람 방장 정원 10 방, ${n}명 전원 준비 → 시작 → 역할 창 뜸 @game${smoke}`, async ({ user, bots }) => {
        test.setTimeout(180_000);
        const botList = await bots.spawn(n - 1);
        const t = await hostGame({ host: user, botList, roles: autoRoles(user, botList), settings: { maxPlayers: 10 } });
        const dialog = revealDialog(user.page);
        await expect(dialog).toBeVisible({ timeout: 20_000 });
        await expectReadable(dialog.getByText(ROLE_NAME.CITIZEN, { exact: true }));
        const s = await t.state();
        expect(s.players).toHaveLength(n);
    });
}

// 5명보다 적으면 방장 화면의 "게임시작"이 미리 꺼지고 까닭 글이 보임 (결정 2026-11-16 낮 5번, 화면 gameStartMessages.js 글)
test('A02-E-104 사람 방장 + 봇 3 = 4명 전원 준비 → "게임시작" 단추 꺼짐, 까닭 글 읽힘, 판 안 열림', async ({ user, bots }) => {
    const page = user.page;
    const botList = await bots.spawn(3);
    await readyRoom(user, botList, { jokers: 1, maxPlayers: 5 });
    await expect(page.getByRole('button', { name: '게임시작' })).toBeDisabled();
    const reason = page.getByTestId('start-locked-reason');
    await expect(reason).toHaveText('5명부터 시작할 수 있습니다. (지금 4명)');
    await expectReadable(reason);
    // 대기방 그대로, 판 없음
    await expect(page).toHaveURL(/\/game-matching/);
    expect(await e2e.gameOf(U(user)), '판이 생김').toBeNull();
    expect(await e2e.roomOf(U(user)), '대기방이 없어짐').not.toBeNull();
});

test('A02-E-105 직접 J2D2G2W2 정원 10 방에 7명 → 구성이 인원과 안 맞음 거절 글 읽힘', async ({ user, bots }) => {
    const botList = await bots.spawn(6);
    await readyRoom(user, botList, { maxPlayers: 10, custom: { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 } });
    await user.page.getByRole('button', { name: '게임시작' }).click();
    await expectStartRejected(user, MSG.ROLE_MISMATCH);
});

test('A02-E-106 5명 직접 J2D1G1W1(시민 0명) → 시작, 사람 창에 정해 둔 직업 @game', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    const roles = { [U(user)]: 'GUARD', [U(botList[0])]: 'JOKER', [U(botList[1])]: 'JOKER', [U(botList[2])]: 'DOCTOR', [U(botList[3])]: 'WITCH_HUNTER' };
    const t = await hostGame({
        host: user, botList, roles,
        settings: { maxPlayers: 5, custom: { JOKER: 2, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 } },
    });
    const dialog = revealDialog(user.page);
    await expectReadable(dialog.getByText(ROLE_NAME.GUARD, { exact: true }));
    // 시민 0명 판 그대로 (정한 수대로)
    const s = await t.state();
    const count = (role) => s.players.filter((p) => p.role === role).length;
    expect([count('JOKER'), count('DOCTOR'), count('GUARD'), count('WITCH_HUNTER'), count('CITIZEN')]).toEqual([2, 1, 1, 1, 0]);
});

test('A02-E-107 6명 중 봇 1 연결 끊음 → 연결 확인 거절 글 읽힘, 대기방 그대로', async ({ user, bots }) => {
    const botList = await bots.spawn(5);
    await readyRoom(user, botList, { jokers: 1, maxPlayers: 6 });
    // 소켓만 끊음 (대기방은 15초 동안 자리를 남겨 둠 → 그 안에 시작)
    botList[4].socket.disconnect();
    await expect.poll(() => botList[4].socket.connected).toBe(false);
    await user.page.getByRole('button', { name: '게임시작' }).click();
    await expectStartRejected(user, MSG.UNAVAILABLE);
});

test('A02-E-108 5명, 시작 단추를 두 번 빠르게 → 판 하나, 역할 창 하나 @game', async ({ user, bots }) => {
    const botList = await bots.spawn(4);
    await readyRoom(user, botList, { jokers: 1, maxPlayers: 5 });
    await e2e.setRoles(autoRoles(user, botList));
    // 같은 순간 두 번 누름 (화면이 "시작 중"으로 바뀌기 전에)
    await user.page.getByRole('button', { name: '게임시작' }).evaluate((el) => { el.click(); el.click(); });
    await expect(user.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expect(revealDialog(user.page)).toBeVisible({ timeout: 20_000 });
    await expect(revealDialog(user.page)).toHaveCount(1);
    const game = await e2e.gameOf(U(user));
    expect(game?.gameId).toBeTruthy();
    // 봇마다 시작 알림 하나, 판 id는 모두 사람 판과 같음
    for (const bot of botList) {
        await expect.poll(() => bot.events.some((r) => r.event === 'game_started')).toBe(true);
        const started = bot.events.filter((r) => r.event === 'game_started');
        expect(started.map((r) => r.payload?.gameId), `봇 ${bot.nickname} 시작 알림`).toEqual([game.gameId]);
    }
});
