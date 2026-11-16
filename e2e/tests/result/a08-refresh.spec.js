'use strict';

// 판 끝 뒤 새로고침 브라우저 시험 (PC) — 결과 화면에서 새로고침하면 그 판에서 빠져 "게임 결과를 확인할 수 없습니다", 로비에서 방 만들기·코드로 그 방 입장 됨, 대기방에 들어간 뒤 새로고침은 같은 대기방 그대로
// 목록 A08-판끝-같은방.md 번호 A08-E-029~031·049
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { closeReveals, waitResult, createRoomUi, waitRoom } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');

const U = (x) => x.account.uuid;
const seats = (page) => page.getByRole('img', { name: /^(준비 완료한 참가자|준비 전 참가자)$/ });
const noResultTitle = (page) => page.getByText('게임 결과를 확인할 수 없습니다', { exact: true });
const backToLobbyButton = (page) => page.getByRole('button', { name: '로비로 돌아가기' });

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

// 봇이 "대기방으로" (return_to_room)
async function botBack(bot, gameId) {
    const reply = await bot.request('return_to_room', { gameId });
    expect(reply?.ok, `봇 대기방으로 답 ${JSON.stringify(reply)}`).toBe(true);
    return reply.room;
}

// 결과 화면에서 새로고침 → "결과 없음" 화면이 될 때까지
async function reloadToNoResult(page) {
    await page.reload();
    await expect(noResultTitle(page)).toBeVisible({ timeout: 20_000 });
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

test('A08-E-029 5명 판 결과 화면에서 새로고침 → "게임 결과를 확인할 수 없습니다" + "로비로 돌아가기" @game @smoke', async ({ user, table }) => {
    await playToResult({ user, table, total: 5 });
    const page = user.page;

    await reloadToNoResult(page);

    await expectReadable(noResultTitle(page));
    await expectReadable(backToLobbyButton(page));
    // 결과 화면 단추·명단은 없음 (그 판에서 빠짐)
    await expect(page.getByRole('button', { name: '대기방으로' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: '가면무도회 참가자 정체' })).toHaveCount(0);
    await expect.poll(() => e2e.gameOf(U(user)), { message: '서버에서도 끝난 판 묶임이 풀림' }).toBeNull();
});

test('A08-E-030 5명 판 결과 화면 새로고침 뒤 "로비로 돌아가기" → 로비에서 방 만들기 됨 @game', async ({ user, table }) => {
    await playToResult({ user, table, total: 5 });
    const page = user.page;
    await reloadToNoResult(page);

    await backToLobbyButton(page).click();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });

    const room = await createRoomUi(user);
    await expect(page).toHaveURL(/\/game-matching/);
    expect(room.hostUuid).toBe(U(user));
    expect(room.players.map((p) => p.uuid)).toEqual([U(user)]);
});

test('A08-E-031 6명 판: 봇 1이 대기방으로 간 뒤 사람이 결과 화면 새로고침 → 로비 → 같은 코드로 그 대기방 @game', async ({ user, table }) => {
    const { t, others } = await playToResult({ user, table, total: 6 });
    const page = user.page;
    const seated = others[0];
    await botBack(seated, t.gameId);

    await reloadToNoResult(page);
    await backToLobbyButton(page).click();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });

    await ui.joinRoomByCodeUi(page, t.roomCode);
    expect(await shownRoomCode(page)).toBe(t.roomCode);
    await expect(seats(page)).toHaveCount(2);
    const room = await waitRoom(U(user), (r) => r.players.length === 2);
    expect(room.players.map((p) => p.uuid).sort()).toEqual([U(user), U(seated)].sort());
});

test('A08-E-049 5명 판: 전원 대기방으로 간 뒤 사람이 새로고침 → 같은 대기방 그대로 @game', async ({ user, table }) => {
    const { t, host, others } = await playToResult({ user, table, total: 5 });
    const page = user.page;
    for (const bot of [host, ...others]) await botBack(bot, t.gameId);
    await page.getByRole('button', { name: '대기방으로' }).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    await expect(seats(page)).toHaveCount(5);

    await page.reload();

    await expect(page).toHaveURL(/\/game-matching/);
    await expect(seats(page)).toHaveCount(5, { timeout: 20_000 });
    expect(await shownRoomCode(page)).toBe(t.roomCode);
    // 서버 방 명단에 그대로 5명 (새로고침으로 빠지지 않음)
    const room = await waitRoom(U(user), (r) => r.players.length === 5);
    expect(room.roomCode).toBe(t.roomCode);
    expect(room.hostUuid).toBe(U(host));
});
