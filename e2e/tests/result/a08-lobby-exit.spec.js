'use strict';

// 결과 화면 "로비로" 브라우저 시험 (PC) — 확인 창 글 "로비로 나가시겠습니까?"(뒤로 가기도 같음), 취소·확인, 로비로 간 뒤 방 만들기·같은 코드로 다시 입장, 대기방에서 로비 주소로 가면 자리 정리
// 목록 A08-판끝-같은방.md 번호 A08-E-018~022·046·063 (받은 버그 3: 로비로 간 사람이 "이미 참여 중인 방"에 갇히던 것 = E-021)
const { test, expect, ui } = require('../../helpers/fixtures');
const { e2e } = require('../../helpers/internal');
const { closeReveals, waitResult, createRoomUi, waitRoom } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');

const U = (x) => x.account.uuid;
const LOBBY_CONFIRM = '로비로 나가시겠습니까?';
const returnButton = (page) => page.getByRole('button', { name: '대기방으로' });
const lobbyButton = (page) => page.getByRole('button', { name: '로비로', exact: true });
const closeTimer = (page) => page.getByTestId('result-close-timer');
const secondsLeft = async (page) => Number(await closeTimer(page).getAttribute('data-seconds-left'));
const seats = (page) => page.getByRole('img', { name: /^(준비 완료한 참가자|준비 전 참가자)$/ });

/**
 * 봇 방장 판(사람 1 + 봇 total-1) → 봇 표로 광대 봇 처형 → 시민 승 → 결과 화면
 * 사람은 시민·표 안 냄(기권) — 봇 표가 기권보다 많은지 먼저 봄
 * @returns {Promise<{ t:any, host:any, others:any[] }>} host = 원래 방장 봇
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

// "로비로" 누르고 뜬 확인 창에 답함 (accept: 확인 / 취소) → 창 글
async function pressLobby(page, { accept }) {
    let seen = null;
    page.once('dialog', (dialog) => {
        seen = { type: dialog.type(), message: dialog.message() };
        (accept ? dialog.accept() : dialog.dismiss()).catch(() => {});
    });
    await lobbyButton(page).click();
    await expect.poll(() => seen, { message: '"로비로" 확인 창' }).not.toBeNull();
    expect(seen.type).toBe('confirm');
    return seen.message;
}

// 봇이 "대기방으로" (return_to_room)
async function botBack(bot, gameId) {
    const reply = await bot.request('return_to_room', { gameId });
    expect(reply?.ok, `봇 대기방으로 답 ${JSON.stringify(reply)}`).toBe(true);
    return reply.room;
}

// 뜨는 알림·확인 창 글 모으기 (창은 바로 닫음 — 안 닫으면 화면이 멈춤)
function collectDialogs(page) {
    const seen = [];
    page.on('dialog', (dialog) => {
        seen.push(dialog.message());
        dialog.dismiss().catch(() => {});
    });
    return seen;
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

test('A08-E-018 5명 판 결과 화면: "로비로" → 확인 창 글 "로비로 나가시겠습니까?" @game @smoke', async ({ user, table }) => {
    await playToResult({ user, table, total: 5 });
    const page = user.page;

    const message = await pressLobby(page, { accept: false });
    // 판 중 나가기 글("게임에서 나가시겠습니까?")이 아님
    expect(message).toBe(LOBBY_CONFIRM);
});

test('A08-E-019 6명 판 결과 화면: 확인 창 취소 → 결과 화면 그대로, 타이머 계속 줄어듦 @game', async ({ user, table }) => {
    await playToResult({ user, table, total: 6 });
    const page = user.page;

    await pressLobby(page, { accept: false });

    await expect(page).toHaveURL(/\/gameresult/);
    await expect(page.getByRole('region', { name: '가면무도회 참가자 정체' })).toBeVisible();
    await expect(returnButton(page)).toBeEnabled();
    await expect(lobbyButton(page)).toBeEnabled();
    // 타이머가 멈추지 않음
    const before = await secondsLeft(page);
    await expect.poll(() => secondsLeft(page), { timeout: 10_000 }).toBeLessThan(before);
    // 서버에서도 아직 그 판 결과 화면 사람 (판 묶임 그대로)
    expect((await e2e.gameOf(U(user)))?.phase).toBe('ENDED');
});

test('A08-E-020 5명 판 결과 화면: "로비로" 확인 → 주소가 로비로 @game', async ({ user, table }) => {
    await playToResult({ user, table, total: 5 });
    const page = user.page;

    await pressLobby(page, { accept: true });
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
    // 로비 화면이 실제로 그려짐 (인트로 영상이 뜨면 건너뜀)
    await ui.skipIntro(page);
    await expect(page.getByRole('navigation', { name: '로비 메뉴' })).toBeVisible();
    // 서버에서도 끝난 판 묶임이 풀림
    await expect.poll(() => e2e.gameOf(U(user))).toBeNull();
});

test('A08-E-021 [버그 3] 5명 판: "로비로" 간 뒤 방 만들기 → 대기방 열림, "이미 참여 중인 방" 글 없음 @game', async ({ user, table }) => {
    await playToResult({ user, table, total: 5 });
    const page = user.page;

    await pressLobby(page, { accept: true });
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });

    // 방 만들기 동안 뜨는 알림을 전부 모음 (끝난 판·옛 방에 묶여 있으면 거절 알림이 뜸)
    const alerts = collectDialogs(page);
    const room = await createRoomUi(user);
    await expect(page).toHaveURL(/\/game-matching/);
    expect(alerts.filter((text) => text.includes('이미 참여 중인 방'))).toEqual([]);
    expect(alerts).toEqual([]);
    expect(room.hostUuid).toBe(U(user));
    expect(room.players.map((p) => p.uuid)).toEqual([U(user)]);
});

test('A08-E-022 6명 판: 봇 2가 대기방으로 간 뒤 사람이 "로비로" → 같은 코드를 넣으면 같은 대기방 @game', async ({ user, table }) => {
    const { t, others } = await playToResult({ user, table, total: 6 });
    const page = user.page;
    const [botA, botB] = others;
    await botBack(botA, t.gameId);
    await botBack(botB, t.gameId);

    await pressLobby(page, { accept: true });
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });

    await ui.joinRoomByCodeUi(page, t.roomCode);
    expect(await shownRoomCode(page)).toBe(t.roomCode);
    await expect(seats(page)).toHaveCount(3);
    // 서버: 봇 둘이 앉아 있던 바로 그 방에 준비 안 됨으로 앉음
    const room = await waitRoom(U(user), (r) => r.players.length === 3);
    expect(room.players.map((p) => p.uuid).sort()).toEqual([U(user), U(botA), U(botB)].sort());
    expect(room.players.find((p) => p.uuid === U(user))?.isReady).toBe(false);
});

test('A08-E-046 5명 판 결과 화면: 브라우저 뒤로 가기 → 같은 확인 창 "로비로 나가시겠습니까?" @game', async ({ user, table }) => {
    await playToResult({ user, table, total: 5 });
    const page = user.page;

    const opened = page.waitForEvent('dialog', { timeout: 15_000 });
    await page.evaluate(() => window.history.back());
    const dialog = await opened;
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toBe(LOBBY_CONFIRM);
    await dialog.dismiss();

    // 취소했으니 결과 화면 그대로
    await expect(page).toHaveURL(/\/gameresult/);
    await expect(lobbyButton(page)).toBeEnabled();
});

test('A08-E-063 5명 판: 대기방으로 들어간 뒤 로비 주소로 가면 방에서 빠짐 → 서버 방 명단에 없음, 방 만들기 됨 @game', async ({ user, table }) => {
    const { t, others } = await playToResult({ user, table, total: 5 });
    const page = user.page;

    await returnButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    // 방 명단을 밖에서 보려고 봇 하나도 들어가 있게 함
    await botBack(others[0], t.gameId);
    await waitRoom(U(others[0]), (r) => r.players.some((p) => p.uuid === U(user)));

    // 로비에 들어오면 서버가 그 사람 대기방 자리를 정리함
    await ui.gotoLobby(page);
    const room = await waitRoom(U(others[0]), (r) => !r.players.some((p) => p.uuid === U(user)));
    expect(room.players.map((p) => p.uuid)).toEqual([U(others[0])]);
    await expect.poll(() => e2e.roomOf(U(user))).toBeNull();

    const alerts = collectDialogs(page);
    const created = await createRoomUi(user);
    expect(alerts).toEqual([]);
    expect(created.hostUuid).toBe(U(user));
    expect(created.roomCode).not.toBe(t.roomCode);
});
