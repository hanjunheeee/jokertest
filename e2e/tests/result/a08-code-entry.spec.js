'use strict';

// 판 중·판 끝 뒤 코드 입장 브라우저 시험 (PC) — 판 중엔 "이미 시작된 방", 판 끝 뒤엔 새 사람·죽고 나간 사람도 들어옴, 0명 공개 방은 목록에 없음, 아무도 안 오면 방 없음, 탈주 대기·3번 추방 거절 글, 친구 초대
// 목록 A08-판끝-같은방.md 번호 A08-E-032~036·043~045·069 (사람은 판 밖이거나 판 도중 빠짐, 180초는 손잡이 closeResults로 넘김)
const crypto = require('node:crypto');
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { Table } = require('../../helpers/game');
const friends = require('../../helpers/friends');
const { closeReveals, waitResult, waitRoom, botsJoinAndReady, openRoomList, findRoomRow } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');

const U = (x) => x.account.uuid;
const seats = (page) => page.getByRole('img', { name: /^(준비 완료한 참가자|준비 전 참가자)$/ });
const startButton = (page) => page.getByRole('button', { name: '게임시작' });
// 입장 거절 글: 판 중(조각) / 방 없음(화면 글 그대로 — 없어진 방 코드는 없는 코드와 같은 답 ROOM_CODE_MISMATCH, "이미 끝난 게임" 글 아님)
const STARTED_TEXT = '이미 게임이 시작된 방';
const NO_ROOM_TEXT = '입장 코드가 올바르지 않습니다. 코드를 다시 확인해주세요.';

// 서버 값으로 광대 봇 찾기 (미리 정한 직업이 가끔 안 맞음)
async function jokerBotOf(t) {
    const s = await t.state();
    const jokerUuid = s.players.find((p) => p.role === 'JOKER')?.uuid;
    const joker = t.bots.find((bot) => U(bot) === jokerUuid);
    expect(joker, '광대는 봇이어야 함').toBeTruthy();
    return joker;
}

/**
 * 봇만의 판(봇 방장, total명) 시작 — 사람은 판 밖
 * @returns {Promise<{ t:any, host:any, others:any[] }>} host = 방장 봇
 */
async function openBotGame({ table, total, settings = {} }) {
    const t = await table.setup({
        humans: [],
        bots: total,
        settings,
        roles: ({ bots }) => ({ [U(bots.at(-1))]: 'JOKER' }),
    });
    return { t, host: t.bots[0], others: t.bots.slice(1) };
}

// 봇 표로 광대 봇을 처형해 시민 승으로 판을 끝냄 (봇 표가 기권보다 많은지 먼저 봄)
async function endByExecution(t) {
    const joker = await jokerBotOf(t);
    await t.assertBotsCanExecute(U(joker));
    t.playBots((bot) => ({ dayVote: bot === joker ? 'abstain' : U(joker), tribunal: 'GUILTY', night: 'skip' }));
    const end = await N.toEnd(t);
    expect(end?.phase ?? 'ENDED', '판 끝').toBe('ENDED');
    return joker;
}

// 봇이 "대기방으로" (return_to_room)
async function botBack(bot, gameId) {
    const reply = await bot.request('return_to_room', { gameId });
    expect(reply?.ok, `봇 대기방으로 답 ${JSON.stringify(reply)}`).toBe(true);
    return reply.room;
}

// 방장 봇이 대기방에서 한 사람 추방 (화면이 보내는 값 그대로: 지금 방 내용에서 방·자리 번호를 읽어 보냄)
async function botKick(hostBot, targetUuid) {
    const current = await hostBot.request('get_current_room', {});
    const room = current?.room;
    expect(room, '방장 봇의 방').toBeTruthy();
    const seatOf = (uuid) => room.players.find((p) => p.uuid === uuid)?.membershipId;
    const reply = await hostBot.request('kick_room_player', {
        requestId: crypto.randomUUID(),
        bootEpoch: room.bootEpoch,
        roomId: room.roomId,
        roomInstanceId: room.roomInstanceId,
        requesterMembershipId: seatOf(U(hostBot)),
        targetUuid,
        targetMembershipId: seatOf(targetUuid),
    });
    expect(reply?.ok, `추방 답 ${JSON.stringify(reply)}`).toBe(true);
}

// 나가기 확인 창이 뜨면 "확인"
const acceptDialog = (dialog) => { dialog.accept().catch(() => {}); };

// 코드 넣고 "참여하기" → 뜬 알림 글 (PC는 입장 거절 글을 브라우저 알림 창으로 띄움)
async function enterCodeForAlert(page, roomCode) {
    await page.goto('/roomInvite');
    await page.getByRole('textbox', { name: /방 코드/ }).first().click();
    await page.keyboard.type(roomCode);
    return ui.captureAlert(page, () => page.getByRole('button', { name: '참여하기' }).click());
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

test('A08-E-032 5명 봇 판 진행 중: 판 밖 사람이 그 코드 입력 → "이미 게임이 시작된 방" 글 @game', async ({ user, table }) => {
    const { t } = await openBotGame({ table, total: 5 });
    const page = user.page;
    expect((await t.state())?.phase, '판 진행 중').not.toBe('ENDED');

    const message = await enterCodeForAlert(page, t.roomCode);

    // 판 중엔 "이미 시작된 방" (방 없음 글이 아님)
    expect(message).toContain(STARTED_TEXT);
    expect(message).not.toContain(NO_ROOM_TEXT);
    await expect(page).not.toHaveURL(/\/game-matching/);
    expect(await e2e.roomOf(U(user))).toBeNull();
});

test('A08-E-033 5명 봇 판이 끝난 뒤: 판 밖 사람이 그 코드 입력 → 대기방 @game @smoke', async ({ user, table }) => {
    const { t } = await openBotGame({ table, total: 5 });
    const page = user.page;
    await endByExecution(t);

    await ui.joinRoomByCodeUi(page, t.roomCode);

    expect(await shownRoomCode(page)).toBe(t.roomCode);
    await expect(seats(page)).toHaveCount(1);
    const room = await waitRoom(U(user));
    expect(room.roomCode).toBe(t.roomCode);
    expect(room.players.map((p) => p.uuid)).toEqual([U(user)]);
    expect(room.players[0].isReady).toBe(false);
});

test('A08-E-034 6명 공개 방 봇 판 끝: 0명일 땐 방 목록에 안 보임 → 봇 1이 대기방으로 가면 목록에 나타남 @game', async ({ user, table }) => {
    const { t, host, others } = await openBotGame({ table, total: 6, settings: { accessType: 'open' } });
    const page = user.page;
    const title = `${host.nickname}의 방`;
    await endByExecution(t);

    await openRoomList(page);
    // 다시 열린 방은 아직 0명 → 목록에 없음 (쪽을 넘겨 가며 몇 초 찾아봄)
    expect(await findRoomRow(page, title, { timeoutMs: 4000 }), '0명 방이 목록에 보임').toBeNull();

    await botBack(others[0], t.gameId);

    const row = await findRoomRow(page, title, { timeoutMs: 15_000 });
    expect(row, '첫 사람이 들어온 뒤에도 목록에 없음').not.toBeNull();
    await expectReadable(row, { contrast: false });
    await expect(row).toHaveAccessibleName(new RegExp(`${title}, 1/6명`));
});

test('A08-E-035 5명 봇 판 끝, 아무도 "대기방으로" 안 누름 → 180초 뒤 그 코드 입력 → 방 없음 글 (이미 시작 글 아님) @game', async ({ user, table }) => {
    const { t } = await openBotGame({ table, total: 5 });
    const page = user.page;
    await endByExecution(t);

    const closed = await t.closeResults();
    expect(closed.fired).toBe(true);

    const message = await enterCodeForAlert(page, t.roomCode);

    expect(message).toBe(NO_ROOM_TEXT);
    expect(message).not.toContain(STARTED_TEXT);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A08-E-036 6명 봇 판 끝, 봇 1만 대기방으로 → 180초 뒤에도 방이 남음: 사람 코드 입력 → 대기방, 그 봇이 방장 @game', async ({ user, table }) => {
    const { t, others } = await openBotGame({ table, total: 6 });
    const page = user.page;
    await endByExecution(t);
    // 원래 방장이 아닌 봇 하나만 들어감 (방장 자리는 남겨 둔 채)
    const stayer = others[0];
    const roomAtReturn = await botBack(stayer, t.gameId);
    expect(roomAtReturn.hostUuid).toBeNull();

    const closed = await t.closeResults();
    expect(closed.fired).toBe(true);

    await ui.joinRoomByCodeUi(page, t.roomCode);
    await expect(seats(page)).toHaveCount(2);
    // 방장은 먼저 들어와 있던 봇 → 내 화면엔 시작 단추가 없음
    await expect(startButton(page)).toHaveCount(0);
    const room = await waitRoom(U(user), (r) => r.players.length === 2);
    expect(room.roomCode).toBe(t.roomCode);
    expect(room.hostUuid).toBe(U(stayer));
});

test('A08-E-043 6명 판: 사람이 판 중 산 채로 나감 → 봇 판 끝 → 그 코드 입력 → "탈주로 ○분 ○초 뒤에 참여할 수 있습니다" 꼴 글 @game', async ({ user, table }) => {
    const page = user.page;
    const t = await table.setup({
        humans: [user],
        bots: 5,
        roles: ({ humans, bots }) => ({ [U(humans[0])]: 'CITIZEN', [U(bots.at(-1))]: 'JOKER' }),
    });
    const joker = await jokerBotOf(t);
    await closeReveals([page]);
    await t.advanceUntil('DAY');

    // 산 채로 "게임 나가기" → 확인 창에서 확인 (안내 창이 가리고 있으면 닫고 다시)
    page.on('dialog', acceptDialog);
    await expect(async () => {
        if (!/\/ingame/.test(page.url())) return;
        await ui.closeOverlays(page, { keepWatching: false });
        await page.getByRole('button', { name: '게임 나가기', exact: true }).click({ timeout: 2000 });
        await expect(page).not.toHaveURL(/\/ingame/, { timeout: 5000 });
    }).toPass({ timeout: 40_000 });
    page.off('dialog', acceptDialog);
    await expect.poll(async () => (await t.player(U(user)))?.isParticipating, { message: '서버에서 사람이 판에서 빠짐' }).toBe(false);

    // 광대 봇이 나가 시민 승으로 판 끝
    const left = await joker.request('leave_game_session', { gameId: t.gameId });
    expect(left?.ok, `광대 봇 나가기 답 ${JSON.stringify(left)}`).toBe(true);
    await expect.poll(async () => (await t.state())?.phase ?? 'ENDED', { message: '판 끝' }).toBe('ENDED');

    const message = await enterCodeForAlert(page, t.roomCode);

    expect(message).toMatch(/탈주로 .+ 뒤에 참여할 수 있습니다/);
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A08-E-044 7명 판: 사람이 처형된 뒤 나감 → 봇 판 끝 → 그 코드 입력 → 대기방 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const me = U(user);
    const t = await table.setup({
        humans: [user],
        bots: 6,
        roles: ({ humans, bots }) => ({ [U(humans[0])]: 'CITIZEN', [U(bots.at(-1))]: 'JOKER' }),
    });
    const joker = await jokerBotOf(t);

    // 1일 낮: 봇 6이 사람을 찍고 유죄 → 사람 처형 (판은 계속: 광대 1 : 나머지 5)
    await t.assertBotsCanExecute(me);
    t.playBots({ dayVote: me, tribunal: 'GUILTY', night: 'skip' });
    await closeReveals([page]);
    await N.advanceUntilSettled(t, (s) => s.players.find((p) => p.uuid === me)?.alive === false);

    // 죽은 뒤 "사망 후 선택" 창에서 게임 나가기 → 확인
    // (처형 영상이 끝나야 창이 뜨고, 단계 안내 창이 가리면 닫고 다시)
    const deadChoice = page.getByRole('dialog', { name: '사망 후 선택' });
    await expect(deadChoice).toBeVisible({ timeout: 60_000 });
    page.on('dialog', acceptDialog);
    await expect(async () => {
        if (!/\/ingame/.test(page.url())) return;
        await ui.closeOverlays(page, { keepWatching: false, names: ['단계 전환 안내', '밤 역할 안내', '알림'] });
        await deadChoice.getByRole('button', { name: '게임 나가기' }).click({ timeout: 3000 });
        await expect(page).not.toHaveURL(/\/ingame/, { timeout: 5000 });
    }).toPass({ timeout: 60_000 });
    page.off('dialog', acceptDialog);
    await expect.poll(() => e2e.gameOf(me), { message: '서버에서 사람의 판 묶임이 풀림' }).toBeNull();

    // 광대 봇이 나가 시민 승으로 판 끝
    const left = await joker.request('leave_game_session', { gameId: t.gameId });
    expect(left?.ok, `광대 봇 나가기 답 ${JSON.stringify(left)}`).toBe(true);
    await expect.poll(async () => (await t.state())?.phase ?? 'ENDED', { message: '판 끝' }).toBe('ENDED');

    // 죽고 나간 사람은 탈주가 아니라 판 끝 뒤 코드로 다시 들어옴
    await ui.joinRoomByCodeUi(page, t.roomCode);
    expect(await shownRoomCode(page)).toBe(t.roomCode);
    const room = await waitRoom(me);
    expect(room.roomCode).toBe(t.roomCode);
});

test('A08-E-045 5명 판: 판 전에 3번 추방된 사람은 봇 판이 끝난 뒤에도 그 코드로 못 들어옴 → 추방 거절 글 @game', async ({ user, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const me = U(user);
    const all = await bots.spawn(5);
    const [host, ...others] = all;
    const created = await host.createRoom({ maxPlayers: 6 });

    // 판 전: 사람이 들어올 때마다 방장 봇이 추방, 3번
    for (let n = 1; n <= 3; n += 1) {
        await ui.joinRoomByCodeUi(page, created.roomCode);
        await waitRoom(me);
        await botKick(host, me);
        await expect.poll(() => e2e.roomOf(me), { message: `추방 ${n}번째 뒤 방에서 빠짐` }).toBeNull();
    }

    // 봇 5명 판 → 끝
    const room = await botsJoinAndReady(others, U(host), created.roomCode);
    await host.setReady(room.roomId, room.settingsVersion);
    await e2e.setRoles({ [U(all.at(-1))]: 'JOKER' }, { roomId: room.roomId });
    const started = await host.startGame(room.roomId, room.settingsVersion);
    const t = new Table({ room: created, bots: all, humans: [] });
    t.gameId = started.gameId;
    await endByExecution(t);

    const message = await enterCodeForAlert(page, created.roomCode);

    // 추방 기록이 다시 연 방에도 남음
    expect(message).toContain('3번 추방');
    await expect(page).not.toHaveURL(/\/game-matching/);
    expect(await e2e.roomOf(me)).toBeNull();
});

test('A08-E-069 6명 판 끝 뒤 대기방에서 친구(판 밖 봇) 초대 → 수락 → 명단에 친구 @game', async ({ user, table, bots }) => {
    test.setTimeout(180_000);
    const page = user.page;
    const me = U(user);
    const [friend] = await bots.spawn(1);
    // 친구 맺기: 사람이 신청 → 봇이 수락
    await friends.api(user, 'POST', '/friends/requests', { receiverId: U(friend) });
    const incoming = await friends.botApi(friend, 'GET', '/friends/requests/incoming');
    const request = incoming.find((row) => row.id === me);
    expect(request, '봇이 받은 친구 신청').toBeTruthy();
    await friends.botApi(friend, 'PUT', `/friends/requests/${request.request_id}/accept`);

    const t = await table.setup({
        humans: [user],
        bots: 5,
        roles: ({ humans, bots: list }) => ({ [U(humans[0])]: 'CITIZEN', [U(list.at(-1))]: 'JOKER' }),
    });
    const joker = await jokerBotOf(t);
    await t.assertBotsCanExecute(U(joker));
    t.playBots((bot) => ({ dayVote: bot === joker ? 'abstain' : U(joker), tribunal: 'GUILTY', night: 'skip' }));
    await closeReveals([page]);
    await N.toEnd(t);
    await waitResult(page);

    await page.getByRole('button', { name: '대기방으로' }).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    await expect(seats(page)).toHaveCount(1);

    // 친구 초대 창 → 그 친구 줄 초대 단추
    await page.getByRole('button', { name: '친구 초대', exact: true }).click();
    await page.getByRole('button', { name: `${friend.nickname} 게임 초대` }).click();

    // 봇이 받은 초대를 수락 (수락은 소켓으로)
    let invite = null;
    await expect.poll(async () => {
        const snapshot = await friends.botApi(friend, 'GET', '/friends/invites');
        invite = snapshot?.invites?.[0] ?? null;
        return invite !== null;
    }, { message: '봇에게 초대가 옴', timeout: 15_000 }).toBe(true);
    const accepted = await friend.request('accept_game_invite', { inviteId: invite.inviteId });
    expect(accepted?.ok, `초대 수락 답 ${JSON.stringify(accepted)}`).toBe(true);

    await expect(seats(page)).toHaveCount(2);
    const room = await waitRoom(me, (r) => r.players.length === 2);
    expect(room.roomCode).toBe(t.roomCode);
    expect(room.players.map((p) => p.uuid).sort()).toEqual([me, U(friend)].sort());
});
