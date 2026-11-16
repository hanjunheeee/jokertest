'use strict';

// 돌아온 대기방에서 다음 판 브라우저 시험 (PC) — "다음 게임 설정 유지" 스위치 없음, 5명보다 적으면 시작 단추가 미리 꺼짐·새 사람이 오면 시작, 둘째 판도·둘째 판 끝 뒤도 같은 코드, 결과 화면에 머문 사람은 둘째 판에 안 끌려감, 판 뒤 새 방은 처음 값
// 목록 A08-판끝-같은방.md 번호 A08-E-037~040·064·065·072
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { Table } = require('../../helpers/game');
const {
    closeReveals, waitResult, hostGame, waitRoom, blockedDialog, openSetup, stepperValue, selectTab,
} = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');

const U = (x) => x.account.uuid;
const startButton = (page) => page.getByRole('button', { name: '게임시작' });
const seats = (page) => page.getByRole('img', { name: /^(준비 완료한 참가자|준비 전 참가자)$/ });
const readySeats = (page) => page.getByRole('img', { name: '준비 완료한 참가자' });
const leaveNotice = (page) => page.getByTestId('result-leave-notice');
// 5명이 안 돼 "게임시작"이 미리 꺼졌을 때 방장 화면 버튼 줄 위 까닭 글
const startLockedReason = (page) => page.getByTestId('start-locked-reason');
const KEEP_SWITCH = '다음 게임 설정 유지';

// 봇 표로 광대 봇을 처형하게 계획을 줌 (사람은 표 안 냄 = 기권, 봇 표가 기권보다 많은지 먼저 봄)
async function planExecution(t, user) {
    // 미리 정한 직업이 가끔 안 맞음 → 서버 값으로 광대 봇을 다시 찾음
    const s = await t.state();
    const jokerUuid = s.players.find((p) => p.role === 'JOKER')?.uuid;
    const joker = t.bots.find((bot) => U(bot) === jokerUuid);
    expect(joker, '광대는 봇이어야 함 (사람은 시민)').toBeTruthy();
    await t.assertBotsCanExecute(jokerUuid);
    t.playBots((bot) => ({ dayVote: bot === joker ? 'abstain' : jokerUuid, tribunal: 'GUILTY', night: 'skip' }));
    await closeReveals([user.page]);
}

/**
 * 봇 방장 판(사람 1 + 봇 total-1) → 광대 봇 처형으로 시민 승 → 결과 화면
 * @returns {Promise<{ t:any, host:any }>} host = 원래 방장 봇
 */
async function playBotHosted({ user, table, total }) {
    const t = await table.setup({
        humans: [user],
        bots: total - 1,
        roles: ({ humans, bots }) => ({ [U(humans[0])]: 'CITIZEN', [U(bots.at(-1))]: 'JOKER' }),
    });
    await planExecution(t, user);
    await N.toEnd(t);
    await waitResult(user.page);
    return { t, host: t.bots[0] };
}

// 사람이 방장인 판(화면으로 방 만듦, 사람 1 + 봇 total-1) → 광대 봇 처형으로 시민 승 → 결과 화면
async function playHumanHosted({ user, bots, total }) {
    const botList = await bots.spawn(total - 1);
    const t = await hostGame({
        host: user, botList,
        roles: { [U(user)]: 'CITIZEN', [U(botList.at(-1))]: 'JOKER' },
    });
    await planExecution(t, user);
    await N.toEnd(t);
    await waitResult(user.page);
    return t;
}

// 결과 화면 "대기방으로" → 대기방 화면
async function backToRoom(page) {
    await page.getByRole('button', { name: '대기방으로' }).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
}

// 봇이 "대기방으로" (return_to_room) → 들어간 방 내용
async function botBack(bot, gameId) {
    const reply = await bot.request('return_to_room', { gameId });
    expect(reply?.ok, `봇 대기방으로 답 ${JSON.stringify(reply)}`).toBe(true);
    return reply.room;
}

// 방코드 창에 적힌 6칸 값을 이어 붙임
async function codeInDialog(page) {
    const dialog = page.getByRole('dialog', { name: '방코드', exact: true });
    const cells = dialog.getByRole('textbox', { name: /방 코드 \d번째 자리/ });
    await expect(cells).toHaveCount(6);
    return (await cells.evaluateAll((els) => els.map((el) => el.value))).join('');
}

// 대기방 "초대코드 공유" 창에 적힌 방 코드
async function shownRoomCode(page) {
    const open = page.getByRole('button', { name: '초대코드 공유' });
    await expect(open).toBeEnabled({ timeout: 20_000 });
    await open.click();
    return codeInDialog(page);
}

// 판 화면 설정 창 열기 (역할·단계 안내 창이 가리고 있으면 닫고 다시)
async function openIngameSettings(page) {
    const dialog = page.getByRole('dialog', { name: '인게임 설정', exact: true });
    await expect(async () => {
        if (await dialog.isVisible()) return;
        await ui.closeOverlays(page, { keepWatching: false });
        await page.getByRole('button', { name: '인게임 설정', exact: true }).click({ timeout: 2000 });
        await expect(dialog).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    return dialog;
}

/**
 * 돌아온 대기방에서 둘째 판 시작 (봇 방장이 시작) → 둘째 판 Table
 * 봇은 원래 방장 봇부터 전부 "대기방으로"·준비, 사람은 화면으로 "대기방으로"·준비 — humanJoins: false면 사람은 결과 화면에 둠
 */
async function startSecondGame({ t, host, user, humanJoins = true }) {
    const page = user.page;
    let room = null;
    for (const bot of [host, ...t.bots.filter((b) => b !== host)]) room = await botBack(bot, t.gameId);
    for (const bot of t.bots) await bot.setReady(room.roomId, room.settingsVersion);
    const presets = { [U(t.bots.at(-1))]: 'JOKER' };
    if (humanJoins) {
        await backToRoom(page);
        await ui.readyUi(page);
        await expect(page.getByRole('button', { name: '준비취소' })).toBeVisible();
        presets[U(user)] = 'CITIZEN';
    }
    await e2e.setRoles(presets, { roomId: room.roomId });
    const started = await host.startGame(room.roomId, room.settingsVersion);
    if (humanJoins) await expect(page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const t2 = new Table({ room, bots: t.bots, humans: humanJoins ? [user] : [] });
    t2.gameId = started.gameId;
    return t2;
}

test('A08-E-037 5명 판(사람이 방장): 판 중 설정 창에 "방관리" 탭도 "다음 게임 설정 유지" 스위치도 없음 @game', async ({ user, bots }) => {
    const page = user.page;
    const botList = await bots.spawn(4);
    const t = await hostGame({ host: user, botList, roles: { [U(user)]: 'CITIZEN', [U(botList.at(-1))]: 'JOKER' } });
    await closeReveals([page]);
    await t.advanceUntil('DAY');

    const dialog = await openIngameSettings(page);
    const tabs = dialog.getByRole('navigation', { name: '인게임 설정 탭' }).getByRole('button');
    await expect(tabs.first()).toBeVisible();
    // 방장에게만 보이던 "방관리" 탭은 탭째 없앰 (결정 2026-11-16 아침 12번)
    await expect(tabs.filter({ hasText: '방관리' })).toHaveCount(0);

    // 남은 탭을 하나씩 열어 봐도 스위치가 없음
    const count = await tabs.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
        await tabs.nth(i).click();
        await expect(dialog).not.toContainText(KEEP_SWITCH);
        await expect(dialog.getByRole('checkbox', { name: /유지/ })).toHaveCount(0);
        await expect(dialog.getByRole('switch', { name: /유지/ })).toHaveCount(0);
    }
});

test('A08-E-038 6명 판: 사람(방장) + 봇 3만 대기방으로·준비 → "게임시작"이 미리 꺼지고 까닭 글 "5명부터 시작할 수 있습니다. (지금 4명)"이 읽힘 @game', async ({ user, bots }) => {
    const t = await playHumanHosted({ user, bots, total: 6 });
    const page = user.page;
    const me = U(user);

    // 원래 방장인 사람이 먼저 들어가 방장, 봇 3이 따라 들어와 준비 → 4명
    await backToRoom(page);
    for (const bot of t.bots.slice(0, 3)) {
        const room = await botBack(bot, t.gameId);
        await bot.setReady(room.roomId, room.settingsVersion);
    }
    await ui.readyUi(page);
    await expect(seats(page)).toHaveCount(4);
    await expect(readySeats(page)).toHaveCount(4);

    // 4명 이하면 누르기 전에 단추를 꺼 두고 까닭 글을 보임 (결정 2026-11-16 낮 셋째 5번) — 막힘 창은 안 뜸
    const start = startButton(page);
    await expect(start).toBeVisible();
    await expect(start).toBeDisabled();
    await expect(startLockedReason(page)).toHaveText('5명부터 시작할 수 있습니다. (지금 4명)');
    await expectReadable(startLockedReason(page));
    await expect(blockedDialog(page)).toHaveCount(0);
    // 판은 안 시작됨
    await expect(page).toHaveURL(/\/game-matching/);
    expect(await e2e.gameOf(me), '새 판이 생기면 안 됨').toBeNull();
    const room = await waitRoom(me);
    expect(room.players).toHaveLength(4);
});

test('A08-E-039 6명 판: 4명만 돌아온 대기방에 판 밖 봇이 코드로 와 준비 → 시작 → 판 화면 @game', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const t = await playHumanHosted({ user, bots, total: 6 });
    const page = user.page;
    const me = U(user);

    await backToRoom(page);
    for (const bot of t.bots.slice(0, 3)) {
        const room = await botBack(bot, t.gameId);
        await bot.setReady(room.roomId, room.settingsVersion);
    }
    await expect(seats(page)).toHaveCount(4);

    // 새 사람(판 밖 봇)이 같은 코드로 들어와 준비 → 5명
    const [fresh] = await bots.spawn(1);
    await fresh.joinByCode(t.roomCode);
    const room = await waitRoom(me, (r) => r.players.length === 5);
    await fresh.setReady(room.roomId, room.settingsVersion);
    await e2e.setRoles({ [me]: 'CITIZEN', [U(fresh)]: 'JOKER' }, { roomId: room.roomId });
    await ui.readyUi(page);
    await expect(seats(page)).toHaveCount(5);
    await expect(readySeats(page)).toHaveCount(5);

    await startButton(page).click();

    await expect(page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const second = await e2e.gameOf(me);
    expect(second?.gameId, '새 판').not.toBe(t.gameId);
    expect(second.players.map((p) => p.uuid).sort()).toEqual([me, U(fresh), ...t.bots.slice(0, 3).map(U)].sort());
});

test('A08-E-040 5명 판: 전원 대기방으로 → 둘째 판 중 방 코드 표시 = 첫 판 코드 @game @smoke', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, host } = await playBotHosted({ user, table, total: 5 });
    const page = user.page;

    const t2 = await startSecondGame({ t, host, user });
    expect(t2.gameId).not.toBe(t.gameId);
    await closeReveals([page]);

    // 판 화면 설정 창 → "방 코드 보기"
    const settings = await openIngameSettings(page);
    await settings.getByRole('button', { name: '방 코드 보기' }).click();
    expect(await codeInDialog(page)).toBe(t.roomCode);
    expect((await t2.state())?.roomCode).toBe(t.roomCode);
});

test('A08-E-064 5명 판: 둘째 판이 끝난 뒤 "대기방으로" → 첫 판과 같은 코드 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const { t, host } = await playBotHosted({ user, table, total: 5 });
    const page = user.page;

    // 둘째 판도 광대 봇 처형으로 끝냄
    const t2 = await startSecondGame({ t, host, user });
    await planExecution(t2, user);
    await N.toEnd(t2);
    await waitResult(page);

    await backToRoom(page);
    expect(await shownRoomCode(page)).toBe(t.roomCode);
    const room = await waitRoom(U(user));
    expect(room.roomCode).toBe(t.roomCode);
});

test('A08-E-065 6명 판: 사람은 결과 화면 그대로, 봇 5가 둘째 판 시작 → 사람 "대기방으로" → 안내 글, 판 화면으로 안 끌려감 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, host } = await playBotHosted({ user, table, total: 6 });
    const page = user.page;
    const me = U(user);

    const t2 = await startSecondGame({ t, host, user, humanJoins: false });
    expect((await t2.state())?.players.map((p) => p.uuid)).not.toContain(me);
    // 둘째 판이 시작돼도 결과 화면 그대로
    await expect(page).toHaveURL(/\/gameresult/);

    await page.getByRole('button', { name: '대기방으로' }).click();

    // 대기방이 판으로 바뀌어 못 들어감 → 안내만 뜨고 그 자리
    await expect(leaveNotice(page)).toHaveAttribute('data-notice-source', 'return');
    await expect(leaveNotice(page)).not.toBeEmpty();
    await expectReadable(leaveNotice(page));
    await expect(page).toHaveURL(/\/gameresult/);
    expect((await e2e.gameOf(me))?.gameId, '여전히 첫 판 결과 화면 사람').toBe(t.gameId);
    expect((await t2.state())?.players.map((p) => p.uuid)).not.toContain(me);
});

test('A08-E-072 5명 판(정원 7·광대 1) 뒤 "로비로" → 게임 설정 화면은 지난 판 값이 아니라 처음 값(정원 10·광대 2) @game', async ({ user, table }) => {
    const page = user.page;
    const t = await table.setup({
        humans: [user],
        bots: 4,
        // 광대는 처음 값(2)과 다른 1로 둠 → 지난 판 값이 남았는지 광대 칸으로도 가려짐
        settings: { maxPlayers: 7, jokerCount: 1 },
        roles: ({ humans, bots }) => ({ [U(humans[0])]: 'CITIZEN', [U(bots[3])]: 'JOKER' }),
    });
    const s = await t.state();
    const jokers = t.bots.filter((bot) => s.players.find((p) => p.uuid === U(bot))?.role === 'JOKER');
    expect(jokers, '광대는 봇 1명이어야 함').toHaveLength(1);

    // 광대 봇이 나감 → 시민 승으로 판 끝
    await closeReveals([page]);
    await t.advanceUntil('DAY');
    for (const joker of jokers) {
        const left = await joker.request('leave_game_session', { gameId: t.gameId });
        expect(left?.ok, `광대 봇 나가기 답 ${JSON.stringify(left)}`).toBe(true);
    }
    await waitResult(page);

    // "로비로" → 확인
    page.once('dialog', (dialog) => { dialog.accept().catch(() => {}); });
    await page.getByRole('button', { name: '로비로', exact: true }).click();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });

    await openSetup(page);
    await selectTab(page, '일반');
    // 지난 판 정원 7이 아니라 처음 값 10
    expect(parseInt(await stepperValue(page, '최대 플레이어 수'), 10)).toBe(10);
    // 광대 수도 지난 판 1이 아니라 처음 값 2 (설정 화면 gameSetupOptions.js의 처음 값)
    expect(parseInt(await stepperValue(page, '광대(마피아) 플레이어 수'), 10)).toBe(2);
    await expect(page.getByRole('checkbox', { name: '코드로만 참가', exact: true })).toHaveAttribute('aria-checked', 'false');
    // 시간도 지난 판(토론 30초)이 아니라 처음 값 60초
    await selectTab(page, '회의&투표');
    expect(parseInt(await stepperValue(page, '낮 토론 시간 조절'), 10)).toBe(60);
});
