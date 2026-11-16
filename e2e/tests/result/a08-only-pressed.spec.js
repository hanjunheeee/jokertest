'use strict';

// "대기방으로"는 누른 사람만 브라우저 시험 (PC) — 결과 화면에 머무는 사람·로비로 간 사람은 명단에 없고 시작을 안 막음, 남이 로비로 가도 내 대기방 그대로, 두 번 눌러도 한 자리, 로비 간 사람은 다른 방에 들어감
// 목록 A08-판끝-같은방.md 번호 A08-E-041·042·048·060·068 (받은 버그 3: 로비로 간 사람·대기방 간 사람이 섞여도 됨 = E-068, 섞인 순서 전체는 A08-H-001~)
const { test, expect, ui } = require('../../helpers/fixtures');
const { e2e } = require('../../helpers/internal');
const { closeReveals, waitResult, waitRoom } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');

const U = (x) => x.account.uuid;
const returnButton = (page) => page.getByRole('button', { name: '대기방으로' });
// 대기방 자리 그림 (사람 자리만 — "방장 자리" 칸은 안 셈)
const seats = (page) => page.getByRole('img', { name: /^(준비 완료한 참가자|준비 전 참가자)$/ });
const readySeats = (page) => page.getByRole('img', { name: '준비 완료한 참가자' });

/**
 * 봇 방장 판(사람 1 + 봇 total-1) → 봇 표로 광대 봇 처형 → 시민 승 → 결과 화면
 * 사람은 시민·표 안 냄(기권) — 봇 표가 기권보다 많은지 먼저 봄
 * @returns {Promise<{ t:any, host:any, others:any[] }>} host = 원래 방장 봇, others = 나머지 봇 (처형된 광대 봇도 결과 화면에 있음)
 */
async function playToResult({ user, table, total }) {
    const t = await table.setup({
        humans: [user],
        bots: total - 1,
        roles: ({ humans, bots }) => ({ [U(humans[0])]: 'CITIZEN', [U(bots.at(-1))]: 'JOKER' }),
    });
    // 미리 정한 직업이 가끔 안 맞음 → 서버 값으로 광대 봇을 다시 찾음
    const s = await t.state();
    const jokerUuid = s.players.find((p) => p.role === 'JOKER')?.uuid;
    const joker = t.bots.find((bot) => U(bot) === jokerUuid);
    expect(joker, '광대는 봇이어야 함 (사람은 시민)').toBeTruthy();
    await t.assertBotsCanExecute(jokerUuid);
    t.playBots((bot) => ({ dayVote: bot === joker ? 'abstain' : jokerUuid, tribunal: 'GUILTY', night: 'skip' }));
    await closeReveals([user.page]);
    await N.toEnd(t);
    await waitResult(user.page);
    return { t, host: t.bots[0], others: t.bots.slice(1) };
}

// 결과 화면 "대기방으로" → 대기방 화면
async function backToRoom(page) {
    await returnButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
}

// 봇이 "대기방으로" (return_to_room) → 들어간 방 내용
async function botBack(bot, gameId) {
    const reply = await bot.request('return_to_room', { gameId });
    expect(reply?.ok, `봇 대기방으로 답 ${JSON.stringify(reply)}`).toBe(true);
    return reply.room;
}

// 봇이 "로비로" (끝난 판 나가기)
async function botToLobby(bot, gameId) {
    const reply = await bot.request('leave_game_session', { gameId });
    expect(reply?.ok, `봇 로비로 답 ${JSON.stringify(reply)}`).toBe(true);
}

// 대기방 "초대코드 공유" 창에 적힌 방 코드 (6칸 값을 이어 붙임), 읽고 창 닫음
async function shownRoomCode(page) {
    const open = page.getByRole('button', { name: '초대코드 공유' });
    await expect(open).toBeEnabled({ timeout: 20_000 });
    await open.click();
    const dialog = page.getByRole('dialog', { name: '방코드' });
    const cells = dialog.getByRole('textbox', { name: /방 코드 \d번째 자리/ });
    await expect(cells).toHaveCount(6);
    const code = (await cells.evaluateAll((els) => els.map((el) => el.value))).join('');
    await dialog.getByRole('button', { name: '방코드 팝업 닫기' }).click();
    await expect(dialog).toHaveCount(0);
    return code;
}

test('A08-E-041 6명 판: 봇 1은 결과 화면 그대로, 사람 + 봇 4가 대기방으로·준비 → 명단 5명, 시작 됨 @game @smoke', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, host, others } = await playToResult({ user, table, total: 6 });
    const page = user.page;
    const me = U(user);
    // 결과 화면에 머무는 봇 하나, 나머지 봇 4(원래 방장 포함)는 대기방으로
    const [stayer, ...rest] = others;
    const returning = [host, ...rest];
    let room = null;
    for (const bot of returning) room = await botBack(bot, t.gameId);
    for (const bot of returning) await bot.setReady(room.roomId, room.settingsVersion);

    await backToRoom(page);
    await ui.readyUi(page);

    // 명단은 누른 5명뿐 (머무는 봇은 끌려오지 않음)
    await expect(seats(page)).toHaveCount(5);
    await expect(readySeats(page)).toHaveCount(5);
    const seated = await waitRoom(me, (r) => r.players.length === 5);
    expect(seated.players.map((p) => p.uuid)).not.toContain(U(stayer));

    // 머무는 사람이 시작을 막지 않음: 방장 봇이 시작 → 사람 화면이 판으로
    await e2e.setRoles({ [me]: 'CITIZEN', [U(rest.at(-1))]: 'JOKER' }, { roomId: room.roomId });
    const started = await host.startGame(room.roomId, room.settingsVersion);
    await expect(page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const second = await e2e.game(started.gameId);
    expect(second.players).toHaveLength(5);
    expect(second.players.map((p) => p.uuid)).not.toContain(U(stayer));
    // 머무는 봇은 여전히 첫 판 결과 화면 사람
    expect((await e2e.gameOf(U(stayer)))?.gameId).toBe(t.gameId);
});

test('A08-E-042 5명 판: 봇 1이 "로비로" → 사람·나머지 봇이 들어간 대기방 명단 4명, 그 봇 없음 @game', async ({ user, table }) => {
    const { t, host, others } = await playToResult({ user, table, total: 5 });
    const page = user.page;
    const me = U(user);
    const [gone, ...rest] = others;

    await botToLobby(gone, t.gameId);
    await backToRoom(page);
    for (const bot of [host, ...rest]) await botBack(bot, t.gameId);

    await expect(seats(page)).toHaveCount(4);
    const room = await waitRoom(me, (r) => r.players.length === 4);
    expect(room.players.map((p) => p.uuid)).not.toContain(U(gone));
    expect(room.players.map((p) => p.uuid).sort()).toEqual([me, U(host), ...rest.map(U)].sort());
    // 로비로 간 봇은 어느 방에도 안 앉아 있음 (서버가 끌어다 넣지 않음)
    expect(await e2e.roomOf(U(gone))).toBeNull();
});

test('A08-E-048 5명 판: 사람이 대기방으로 간 뒤 다른 봇이 "로비로" 가도 내 화면 명단 그대로 @game', async ({ user, table }) => {
    const { t, host, others } = await playToResult({ user, table, total: 5 });
    const page = user.page;
    const me = U(user);

    await backToRoom(page);
    await botBack(host, t.gameId);
    await expect(seats(page)).toHaveCount(2);
    const before = await waitRoom(me, (r) => r.players.length === 2);

    // 아직 결과 화면에 있던 봇 하나가 "로비로"
    await botToLobby(others[0], t.gameId);

    await expect(page).toHaveURL(/\/game-matching/);
    await expect(seats(page)).toHaveCount(2);
    const after = await waitRoom(me);
    expect(after.roomId).toBe(before.roomId);
    expect(after.hostUuid).toBe(U(host));
    expect(after.players.map((p) => p.uuid).sort()).toEqual([me, U(host)].sort());
});

test('A08-E-060 5명 판: "대기방으로"를 두 번 빠르게 눌러도 대기방 하나, 명단에 나는 1번 @game', async ({ user, table }) => {
    const { t } = await playToResult({ user, table, total: 5 });
    const page = user.page;
    const me = U(user);

    await returnButton(page).dblclick();

    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    await expect(seats(page)).toHaveCount(1);
    const room = await waitRoom(me);
    expect(room.roomCode).toBe(t.roomCode);
    expect(room.players.filter((p) => p.uuid === me)).toHaveLength(1);
    expect(room.players).toHaveLength(1);
    expect(await shownRoomCode(page)).toBe(t.roomCode);
});

test('A08-E-068 [버그 3] 5명 판: 사람은 "로비로", 봇 4는 대기방으로 → 사람이 다른 대기방 코드 입력 → 들어감 @game', async ({ user, table, bots }) => {
    const { t, host, others } = await playToResult({ user, table, total: 5 });
    const page = user.page;
    const me = U(user);

    // 사람 "로비로" → 확인
    page.once('dialog', (dialog) => { dialog.accept().catch(() => {}); });
    await page.getByRole('button', { name: '로비로', exact: true }).click();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
    for (const bot of [host, ...others]) await botBack(bot, t.gameId);

    // 판 밖 봇이 만든 다른 대기방
    const [stranger] = await bots.spawn(1);
    const other = await stranger.createRoom({ maxPlayers: 5 });
    expect(other.roomCode).not.toBe(t.roomCode);

    // 옛 판·옛 방에 묶여 있으면 "이미 참여 중인 방" 알림이 뜨고 대기방 화면으로 못 감
    await ui.joinRoomByCodeUi(page, other.roomCode);

    expect(await shownRoomCode(page)).toBe(other.roomCode);
    await expect(seats(page)).toHaveCount(2);
    const joined = await waitRoom(me, (r) => r.players.length === 2);
    expect(joined.roomCode).toBe(other.roomCode);
    expect(joined.players.map((p) => p.uuid).sort()).toEqual([me, U(stranger)].sort());
    // 다시 열린 옛 방에는 봇 4뿐 (사람이 끌려 들어가지 않음)
    const old = await waitRoom(U(host), (r) => r.players.length === 4);
    expect(old.players.map((p) => p.uuid)).not.toContain(me);
});
