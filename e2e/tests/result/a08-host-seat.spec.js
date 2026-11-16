'use strict';

// 판 끝 뒤 방장 자리 브라우저 시험 (PC) — 원래 방장 자리를 180초 남겨 둠("방장 자리" 칸·안내), 그동안 방장 단추 없음, 원래 방장이 오면·로비로 가면·180초 지나면 방장이 정해짐
// 목록 A08-판끝-같은방.md 번호 A08-E-012~017·047·050·062·073·075 (180초는 손잡이 closeResults로 넘김)
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable, readability } = require('../../helpers/visible');
const { closeReveals, waitResult, hostGame, waitRoom } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');

const U = (x) => x.account.uuid;
const HOST_SEAT_NOTICE = '방장 자리를 비워 두었습니다. 지난 판 방장이 오지 않으면 먼저 들어온 사람이 방장이 됩니다.';
// 방장에게만 보이는 단추
const HOST_BUTTONS = ['게임시작', '방 설정 변경', '참가자 추방'];
const startButton = (page) => page.getByRole('button', { name: '게임시작' });
// 대기방 자리 그림: 사람 자리 / "방장 자리" 칸까지 전부
const seats = (page) => page.getByRole('img', { name: /^(준비 완료한 참가자|준비 전 참가자)$/ });
const allSeats = (page) => page.getByRole('img', { name: /^(비워 둔 방장 자리|준비 완료한 참가자|준비 전 참가자)$/ });
const reservedSeat = (page) => page.getByTestId('matching-reserved-host-slot');
const reservedLabel = (page) => reservedSeat(page).getByText('방장 자리', { exact: true });
const seatNotice = (page) => page.getByText(HOST_SEAT_NOTICE, { exact: true });
// 대기방 방 정보 줄의 "앉은 수/정원" 숫자 칸 (결정 2026-11-16 오전 2번 — 보이는 글 "2/7", 읽어 주는 글 "앉은 사람 2명, 정원 7명")
const seatCount = (page) => page.getByTestId('matching-party-capacity');

// 앉은 수/정원 숫자가 그 값으로 읽히는지 (보이는 글·읽어 주는 글 둘 다)
async function expectSeatCount(page, seated, max) {
    await expect(seatCount(page).locator('[aria-hidden="true"]')).toHaveText(`${seated}/${max}`);
    await expect(seatCount(page)).toContainText(`앉은 사람 ${seated}명, 정원 ${max}명`);
    await expectReadable(seatCount(page));
}

// 그림 단추가 읽히는지: 단추 자체는 보임·화면 안·안 가려짐, 대비는 단추 위에 얹은 글 칸에서 잼
// (글자색이 그 글 칸에 걸려 있고, 그 칸은 누르기를 안 받아 가려짐 검사에서는 뺌)
async function expectButtonReadable(button) {
    await expectReadable(button, { contrast: false });
    await expectReadable(button.locator('span[aria-hidden="true"]').last(), { uncovered: false });
}

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
 * @returns {Promise<{ t:any, host:any, others:any[] }>} host = 원래 방장 봇, others = 나머지 봇
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
    return { t, host: t.bots[0], others: t.bots.slice(1) };
}

// 사람이 방장인 판(화면으로 방 만듦, 사람 1 + 봇 total-1) → 광대 봇 처형으로 시민 승 → 결과 화면
async function playHumanHosted({ user, bots, total, settings = {} }) {
    const botList = await bots.spawn(total - 1);
    const t = await hostGame({
        host: user, botList, settings,
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

// 결과 화면 "로비로" → 확인 창에서 "확인" (창 글 돌려줌)
async function leaveToLobby(page) {
    let message = null;
    page.once('dialog', (dialog) => {
        message = dialog.message();
        dialog.accept().catch(() => {});
    });
    await page.getByRole('button', { name: '로비로', exact: true }).click();
    await expect.poll(() => message, { message: '"로비로" 확인 창' }).not.toBeNull();
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
    return message;
}

test('A08-E-012 6명 판: 방장 아닌 사람이 먼저 "대기방으로" → 첫 칸 "방장 자리", 안내 글이 읽힘 @game @smoke', async ({ user, table }) => {
    await playBotHosted({ user, table, total: 6 });
    const page = user.page;
    await backToRoom(page);

    // 자리 2칸: 맨 앞이 비워 둔 방장 자리, 그다음이 나
    await expect(allSeats(page)).toHaveCount(2);
    await expect(allSeats(page).first()).toHaveAttribute('alt', '비워 둔 방장 자리');
    await expect(reservedSeat(page)).toHaveCount(1);
    // 이름표는 그림 위에 얹혀 누르기를 안 받는 글이라 가려짐 검사만 뺌 (크기·화면 안·대비는 봄)
    await expectReadable(reservedLabel(page), { uncovered: false });
    await expectReadable(seatNotice(page));
});

test('A08-E-013 6명 판: 방장이 없는 동안 들어온 사람에게 시작·설정·추방 단추 없음 @game', async ({ user, table }) => {
    await playBotHosted({ user, table, total: 6 });
    const page = user.page;
    await backToRoom(page);
    await expect(reservedSeat(page)).toHaveCount(1);

    for (const name of HOST_BUTTONS) {
        await expect(page.getByRole('button', { name }), `${name} 단추`).toHaveCount(0);
    }
    // 화면이 빈 게 아님: 방장 아닌 사람 단추는 보임
    await expectButtonReadable(page.getByRole('button', { name: '방 나가기' }));
    await expectButtonReadable(page.getByRole('button', { name: '준비완료' }));
    const room = await waitRoom(U(user));
    expect(room.hostUuid).toBeNull();
});

test('A08-E-014 7명 판: 원래 방장 봇이 "대기방으로" → 방장 자리 칸·안내 사라지고 봇이 방장 @game', async ({ user, table }) => {
    const { t, host } = await playBotHosted({ user, table, total: 7 });
    const page = user.page;
    await backToRoom(page);
    await expect(reservedSeat(page)).toHaveCount(1);
    await expect(seatNotice(page)).toBeVisible();

    await botBack(host, t.gameId);

    await expect(reservedSeat(page)).toHaveCount(0);
    await expect(seatNotice(page)).toHaveCount(0);
    await expect(seats(page)).toHaveCount(2);
    // 방장은 봇 → 내 화면엔 방장 단추가 없음
    await expect(startButton(page)).toHaveCount(0);
    const room = await waitRoom(U(user), (r) => r.hostUuid === U(host));
    expect(room.players.map((p) => p.uuid).sort()).toEqual([U(user), U(host)].sort());
});

test('A08-E-015 5명 판: 사람이 먼저 들어간 뒤 원래 방장 봇이 "로비로" → 내 화면에 시작 단추 @game', async ({ user, table }) => {
    const { t, host } = await playBotHosted({ user, table, total: 5 });
    const page = user.page;
    await backToRoom(page);
    await expect(reservedSeat(page)).toHaveCount(1);
    await expect(startButton(page)).toHaveCount(0);

    // 봇의 "로비로" = 끝난 판 나가기
    const left = await host.request('leave_game_session', { gameId: t.gameId });
    expect(left?.ok, `방장 봇 로비로 답 ${JSON.stringify(left)}`).toBe(true);

    await expectButtonReadable(startButton(page));
    await expect(reservedSeat(page)).toHaveCount(0);
    await waitRoom(U(user), (r) => r.hostUuid === U(user));
});

test('A08-E-016 6명 판: 사람이 먼저 들어가고 원래 방장 봇은 결과 화면 그대로 → 180초 지나면 내 화면에 시작 단추 @game', async ({ user, table }) => {
    const { t } = await playBotHosted({ user, table, total: 6 });
    const page = user.page;
    await backToRoom(page);
    await expect(reservedSeat(page)).toHaveCount(1);
    await expect(startButton(page)).toHaveCount(0);

    // 180초 규칙 자체를 보는 케이스가 아니라 손잡이로 넘김 (진짜 180초는 A08-H-035)
    const closed = await t.closeResults();
    expect(closed.fired).toBe(true);

    await expectButtonReadable(startButton(page));
    await expect(reservedSeat(page)).toHaveCount(0);
    await waitRoom(U(user), (r) => r.hostUuid === U(user));
});

test('A08-E-017 5명 판: 원래 방장인 사람이 첫째로 "대기방으로" → 바로 방장(시작·설정 단추), 방장 자리 칸 없음 @game', async ({ user, bots }) => {
    await playHumanHosted({ user, bots, total: 5 });
    const page = user.page;
    await backToRoom(page);

    await expectButtonReadable(startButton(page));
    await expectButtonReadable(page.getByRole('button', { name: '방 설정 변경' }));
    await expect(reservedSeat(page)).toHaveCount(0);
    await expect(seatNotice(page)).toHaveCount(0);
    await expect(seats(page)).toHaveCount(1);
    await waitRoom(U(user), (r) => r.hostUuid === U(user));
});

test('A08-E-047 6명 판: 사람이 원래 방장, 봇 2가 대기방에 들어간 뒤 사람이 "로비로" → 서버 방의 방장 = 먼저 들어온 봇 @game', async ({ user, bots }) => {
    const t = await playHumanHosted({ user, bots, total: 6 });
    const page = user.page;
    const [first, second] = t.bots;

    // 먼저 들어온 차례: first → second (원래 방장 자리는 남겨 둔 채)
    const roomAtFirst = await botBack(first, t.gameId);
    expect(roomAtFirst.hostUuid).toBeNull();
    await botBack(second, t.gameId);

    await leaveToLobby(page);

    const room = await waitRoom(U(first), (r) => r.hostUuid !== null);
    expect(room.hostUuid).toBe(U(first));
    expect(room.players.map((p) => p.uuid)).not.toContain(U(user));
});

test('A08-E-050 7명 판: 사람 + 봇 1 들어감(방장 자리 남김) → 인원 "2/7", 방장 자리 칸은 안 셈 @game', async ({ user, table }) => {
    const { t, others } = await playBotHosted({ user, table, total: 7 });
    const page = user.page;
    await backToRoom(page);
    await botBack(others[0], t.gameId);

    // 칸은 3개(방장 자리 + 2명)지만 인원은 2
    await expect(reservedSeat(page)).toHaveCount(1);
    await expect(seats(page)).toHaveCount(2);
    await expectSeatCount(page, 2, 7);
});

test('A08-E-062 6명 판: "방장 자리" 이름표 글자 대비 4.5 이상 @game', async ({ user, table }) => {
    await playBotHosted({ user, table, total: 6 });
    const page = user.page;
    await backToRoom(page);
    await expect(reservedLabel(page)).toBeVisible();

    const measured = await readability(reservedLabel(page));
    expect(measured.ratio, `글자 ${measured.color} / 바탕 ${measured.background}`).toBeGreaterThanOrEqual(4.5);
    expect(measured.inViewport).toBe(true);
});

test('A08-E-073 6명 판: 원래 방장인 사람이 180초 뒤 코드로 오면 보통 사람 (먼저 들어온 봇이 방장) @game', async ({ user, bots }) => {
    const t = await playHumanHosted({ user, bots, total: 6 });
    const page = user.page;
    const [first, second] = t.bots;
    await botBack(first, t.gameId);
    await botBack(second, t.gameId);

    // 결과 화면 닫힘 → 사람은 로비로, 방장 자리 남김도 끝
    const closed = await t.closeResults();
    expect(closed.fired).toBe(true);
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });

    await ui.joinRoomByCodeUi(page, t.roomCode);
    await expect(seats(page)).toHaveCount(3);
    await expect(startButton(page)).toHaveCount(0);
    await expect(reservedSeat(page)).toHaveCount(0);
    const room = await waitRoom(U(user), (r) => r.players.length === 3);
    expect(room.hostUuid).toBe(U(first));
});

test('A08-E-075 6명 판(정원 6): 봇 5가 먼저 들어가 정원이 찼어도 원래 방장인 사람은 들어감 → 6/6, 방장 @game', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const t = await playHumanHosted({ user, bots, total: 6, settings: { maxPlayers: 6 } });
    const page = user.page;
    for (const bot of t.bots) await botBack(bot, t.gameId);

    await backToRoom(page);

    await expect(seats(page)).toHaveCount(6);
    await expectSeatCount(page, 6, 6);
    await expectButtonReadable(startButton(page));
    const room = await waitRoom(U(user), (r) => r.players.length === 6);
    expect(room.hostUuid).toBe(U(user));
});
