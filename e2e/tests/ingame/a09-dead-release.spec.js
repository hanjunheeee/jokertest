'use strict';

// 죽은 사람 풀기 브라우저 시험 (PC) — 처형된 뒤 나가거나 탭을 닫으면 바로 다른 방 만들기·입장, 다시 열면 관전 그대로, 새 판을 시작하면 옛 판에서 빠짐, 사망 창 글이 읽힘
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-023·025·027·029·030·105·107 (PC 줄) — 처형까지는 봇 표와 손잡이로 감
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { expectReadable, expectAllReadable } = require('../../helpers/visible');
const { hostGame } = require('../room/roomHelpers');
const c = require('./c-chat/_lib');
const K = require('./_a09-simple-kit');

// 판 앉히고 봇 표로 내가 처형될 때까지 (봇은 그 뒤 아무것도 안 함)
async function seatAndDie(table, user, n) {
    const t = await K.seat(table, user, { n });
    await c.executeByBots(t, K.U(user));
    await t.stopBots();
    return t;
}

// 탭을 닫고 서버가 끊김을 알 때까지 기다린 뒤 같은 브라우저 새 탭
async function closeAndReopen(t, user) {
    const since = Date.now();
    await user.page.close();
    await K.droppedAt(t, K.U(user), since);
    return user.context.newPage();
}

test('A09-E-023 PC 8명 판, 처형 → "게임 나가기" → 바로 방 만들기 됨 @game @smoke', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    await seatAndDie(table, user, 8);
    await K.pressDeadExit(page, { accept: true });
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    await K.createRoomOk(page);
});

test('A09-E-025 PC 6명 판, 처형된 뒤 탭 닫고 새 탭에서 방 만들기 됨 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await seatAndDie(table, user, 6);
    const tab = await closeAndReopen(t, user);
    await K.createRoomOk(tab);
});

test('A09-E-027 PC 10명 판, 처형된 뒤 탭 닫고 다시 판 화면 → 관전 그대로 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const me = K.U(user);
    const t = await seatAndDie(table, user, 10);
    const tab = await closeAndReopen(t, user);
    await tab.goto('/ingame');
    await expect(tab).toHaveURL(/\/ingame/);
    // 새 탭이라 사망 창이 다시 뜸 → 관전 계속
    const dialog = await K.waitDeadChoice(tab);
    await dialog.getByRole('button', { name: '관전 계속하기' }).click();
    await expect(dialog).toBeHidden();
    await expect(tab).toHaveURL(/\/ingame/);
    await expect(K.cardOf(tab, user.account.nickname)).toHaveAttribute('data-ingame-player-status', 'dead');
    await expect(tab.locator('[data-ingame-player-nickname]')).toHaveCount(10);
    // 판 자리는 남아 있음 (죽은 채 참여 중)
    const row = await t.player(me);
    expect(row.alive).toBe(false);
    expect(row.isParticipating).toBe(true);
});

test('A09-E-029 PC 7명 판, 죽고 끊긴 채 다른 방에 코드로 입장 됨 @game', async ({ user, table, bots }) => {
    test.setTimeout(180_000);
    const [host] = await bots.spawn(1);
    const room = await host.createRoom();
    const t = await seatAndDie(table, user, 7);
    const tab = await closeAndReopen(t, user);
    await ui.joinRoomByCodeUi(tab, room.roomCode);
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.hostUuid, { timeout: 10_000 }).toBe(host.uuid);
});

test('A09-E-030 PC 8명 판, 죽고 끊긴 채 다른 공개 방에 입장 됨 @game', async ({ user, table, bots }) => {
    test.setTimeout(180_000);
    const [host] = await bots.spawn(1);
    await host.createRoom({ accessType: 'open' });
    const t = await seatAndDie(table, user, 8);
    const tab = await closeAndReopen(t, user);
    await K.pickPublicRoom(tab, `${host.nickname}의 방`);
    await K.enterPicked(tab).click();
    await expect(tab).toHaveURL(/\/game-matching/, { timeout: 15_000 });
    await expect.poll(async () => (await e2e.roomOf(K.U(user)))?.hostUuid, { timeout: 10_000 }).toBe(host.uuid);
});

test('A09-E-105 옛 7명 판에서 처형된 사람이 탭 닫고 새 5명 판 시작 → 옛 판 명단에서 빠짐 @game', async ({ user, table, bots }) => {
    test.setTimeout(240_000);
    const me = K.U(user);
    const old = await seatAndDie(table, user, 7);
    // 새 판을 시작하기 전엔 옛 판에 죽은 채 남아 있음
    expect((await old.player(me)).isParticipating).toBe(true);
    const tab = await closeAndReopen(old, user);

    // 새 방은 내가 방장 (화면으로 만들기) + 봇 4 = 5명 판, 직업 고정
    const fresh = await bots.spawn(4);
    const next = await hostGame({
        host: { page: tab, account: user.account },
        botList: fresh,
        roles: { [me]: 'CITIZEN', [K.U(fresh[0])]: 'JOKER' },
        settings: { maxPlayers: 5 },
    });
    expect(next.gameId).not.toBe(old.gameId);
    expect((await next.state()).players).toHaveLength(5);

    await expect.poll(async () => (await e2e.game(old.gameId))?.players.find((p) => p.uuid === me)?.isParticipating, {
        timeout: 10_000, message: '옛 판에서 참여 중인지',
    }).toBe(false);
});

test('A09-E-107 PC 6명 판, 처형 뒤 사망 창 글·단추가 읽힘 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    await seatAndDie(table, user, 6);
    const dialog = await K.waitDeadChoice(page);
    await expectReadable(dialog.getByText('당신은 사망했습니다.', { exact: true }));
    await expectReadable(dialog.getByText('남은 경기를 계속 지켜보거나, 지금 게임에서 나갈 수 있습니다.', { exact: true }));
    await expectReadable(dialog.getByText(K.EXIT_DEAD_LINE, { exact: true }));
    await expectReadable(dialog.getByRole('button', { name: '관전 계속하기' }));
    await expectReadable(dialog.getByRole('button', { name: '게임 나가기' }));
    expect(await expectAllReadable(dialog.getByRole('button'))).toBe(2);
});
