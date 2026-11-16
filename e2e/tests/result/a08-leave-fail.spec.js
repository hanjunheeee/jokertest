'use strict';

// 결과 화면 떠나기 실패 안내 브라우저 시험 (PC) — 연결이 끊겨 "로비로"·"대기방으로"를 못 갔을 때 글, 누르는 중 두 단추 잠김, 방이 없어짐·가득 참·3번 추방 안내, 안내가 단추를 안 가림, 다시 누르면 됨
// 목록 A08-판끝-같은방.md 번호 A08-E-023~028·061·070 (연결 끊김·늦은 답은 사람 화면의 웹소켓을 시험이 가운데서 잡아 흉내 냄)
const crypto = require('node:crypto');
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const { Table } = require('../../helpers/game');
const { closeReveals, waitResult, waitRoom, botsJoinAndReady } = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');

const U = (x) => x.account.uuid;
const returnButton = (page) => page.getByRole('button', { name: '대기방으로' });
const lobbyButton = (page) => page.getByRole('button', { name: '로비로', exact: true });
// 떠나기 실패 안내 (단추 줄 바로 위, data-notice-source = return / exit)
const leaveNotice = (page) => page.getByTestId('result-leave-notice');

const LOBBY_OFFLINE_NOTICE = "연결이 끊겨 로비로 가지 못했습니다. 연결을 확인한 뒤 '로비로'를 다시 눌러 주세요.";
const RETURN_OFFLINE_NOTICE = "연결이 끊겨 대기방으로 가지 못했습니다. 연결을 확인한 뒤 '대기방으로'를 다시 눌러 주세요.";

/**
 * 소켓 줄 손잡이: 사람 화면의 웹소켓을 시험이 가운데서 이어 줌 → 줄 끊기·잇기, 보내는 글 붙잡기
 * 손잡이를 건 뒤에 새로 여는 웹소켓만 잡힘 → 판 차리기(코드 입장 때 화면을 새로 엶) 전에 걸기
 * - cut(): 화면 쪽 줄만 닫음, 서버 쪽은 열어 둔 채 아무것도 안 넘김 (인터넷이 조용히 끊긴 모양), 다시 붙으려는 줄도 바로 닫음
 * - restore(): 다시 붙게 둠 (화면의 socket.io가 스스로 다시 붙음)
 * - hold() / release(): 화면 → 서버로 가는 글을 붙잡았다가 한꺼번에 보냄 (서버 답이 늦는 모양)
 */
async function tapSocketLine(page) {
    const line = { cut: false, holding: false, held: [], routes: new Set(), refused: 0 };
    await page.routeWebSocket(/\/socket\.io\//, async (ws) => {
        if (line.cut) {
            line.refused += 1;
            await ws.close().catch(() => {});
            return;
        }
        const server = ws.connectToServer();
        const route = { ws, dead: false };
        line.routes.add(route);
        ws.onMessage((message) => {
            if (route.dead) return;
            if (line.holding) {
                line.held.push(() => server.send(message));
                return;
            }
            server.send(message);
        });
        server.onMessage((message) => {
            if (!route.dead) ws.send(message);
        });
        // 화면 쪽이 닫히면 서버 쪽도 닫는 게 기본 → 시험이 끊은 줄(dead)은 서버 쪽을 그대로 둠, 화면이 스스로 닫은 줄만 서버에도 알림
        ws.onClose((code, reason) => {
            if (route.dead) return;
            line.routes.delete(route);
            Promise.resolve().then(() => server.close({ code, reason })).catch(() => {});
        });
    });
    return {
        async cut() {
            line.cut = true;
            const refusedBefore = line.refused;
            for (const route of line.routes) {
                route.dead = true;
                // 화면을 새로 열기 전의 옛 줄은 이미 없어져 닫기가 실패할 수 있음 → 넘어감
                await route.ws.close().catch(() => {});
            }
            line.routes.clear();
            // 화면이 끊긴 걸 알고 다시 붙으려다 막힌 것까지 봄 (그래야 "연결 없음" 상태가 확실함)
            await expect.poll(() => line.refused, { timeout: 20_000, message: '화면이 다시 붙으려다 막힘' }).toBeGreaterThan(refusedBefore);
        },
        restore() { line.cut = false; },
        hold() { line.holding = true; },
        release() {
            line.holding = false;
            for (const send of line.held.splice(0)) send();
        },
    };
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
 * @returns {Promise<{ t:any, host:any, others:any[] }>} host = 원래 방장 봇
 */
async function playToResult({ user, table, total }) {
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

// 봇이 "대기방으로" (return_to_room) → 들어간 방 내용
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

// "로비로" 누르고 확인 창에서 "확인"
async function confirmLobby(page) {
    let message = null;
    page.once('dialog', (dialog) => {
        message = dialog.message();
        dialog.accept().catch(() => {});
    });
    await lobbyButton(page).click();
    await expect.poll(() => message, { message: '"로비로" 확인 창' }).not.toBeNull();
}

// 코드 넣고 "참여하기" → 뜬 알림 글 (PC는 입장 거절 글을 브라우저 알림 창으로 띄움)
async function enterCodeForAlert(page, roomCode) {
    await page.goto('/roomInvite');
    await page.getByRole('textbox', { name: /방 코드/ }).first().click();
    await page.keyboard.type(roomCode);
    return ui.captureAlert(page, () => page.getByRole('button', { name: '참여하기' }).click());
}

test('A08-E-023 5명 판 결과 화면: 연결이 끊긴 채 "로비로" → 확인 → "연결이 끊겨 로비로 가지 못했습니다…" 안내가 읽힘 @game', async ({ user, table }) => {
    const page = user.page;
    const line = await tapSocketLine(page);
    await playToResult({ user, table, total: 5 });

    await line.cut();
    await confirmLobby(page);

    await expect(leaveNotice(page)).toHaveText(LOBBY_OFFLINE_NOTICE);
    await expect(leaveNotice(page)).toHaveAttribute('data-notice-source', 'exit');
    await expectReadable(leaveNotice(page));
    // 못 갔으니 결과 화면 그대로
    await expect(page).toHaveURL(/\/gameresult/);
});

test('A08-E-024 5명 판 결과 화면: 연결이 끊긴 채 "대기방으로" → "연결이 끊겨 대기방으로 가지 못했습니다…" 안내가 읽힘 @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const line = await tapSocketLine(page);
    await playToResult({ user, table, total: 5 });

    await line.cut();
    await returnButton(page).click();

    await expect(leaveNotice(page)).toHaveText(RETURN_OFFLINE_NOTICE);
    await expect(leaveNotice(page)).toHaveAttribute('data-notice-source', 'return');
    await expectReadable(leaveNotice(page));
    await expect(page).toHaveURL(/\/gameresult/);
});

test('A08-E-025 6명 판 결과 화면: 서버 답이 늦는 동안 "대기방으로" → "이동 중..", "로비로"도 꺼짐 @game', async ({ user, table }) => {
    const page = user.page;
    const line = await tapSocketLine(page);
    await playToResult({ user, table, total: 6 });

    // 화면이 보내는 글을 붙잡아 답이 안 오게 함
    line.hold();
    await returnButton(page).click();

    const pending = page.getByRole('button', { name: '이동 중..' });
    await expectButtonReadable(pending);
    await expect(pending).toBeDisabled();
    await expect(lobbyButton(page)).toBeDisabled();
    await expect(page).toHaveURL(/\/gameresult/);

    // 붙잡은 글을 보내면 원래대로 대기방으로 감 (누르는 중 잠김이 풀려 끝까지 감)
    line.release();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
});

test('A08-E-026 7명 판: 원래 방장 봇이 대기방으로 간 뒤 방을 지움 → 사람 "대기방으로" → "대기방이 이미 없어져…" 안내가 읽힘 @game', async ({ user, table }) => {
    const { t, host } = await playToResult({ user, table, total: 7 });
    const page = user.page;

    await botBack(host, t.gameId);
    const deleted = await host.request('delete_room', {});
    expect(deleted?.ok, `방 삭제 답 ${JSON.stringify(deleted)}`).toBe(true);

    await returnButton(page).click();

    await expect(leaveNotice(page)).toHaveText("대기방이 이미 없어져 돌아갈 수 없습니다. '로비로'를 눌러 주세요.");
    await expectReadable(leaveNotice(page));
    await expect(page).toHaveURL(/\/gameresult/);
});

test('A08-E-027 6명 판(정원 6): 방장 자리 1칸을 남긴 채 5명이 차면 사람 "대기방으로" → "대기방 정원이 가득 차…" 안내 @game', async ({ user, table, bots }) => {
    const { t, others } = await playToResult({ user, table, total: 6 });
    const page = user.page;

    // 원래 방장 봇은 결과 화면 그대로(자리 1칸 남김), 다른 봇 4 + 판 밖 봇 1 = 5명 → 남긴 칸까지 6칸이 다 참
    for (const bot of others) await botBack(bot, t.gameId);
    const [outsider] = await bots.spawn(1);
    await outsider.joinByCode(t.roomCode);
    await waitRoom(U(outsider), (r) => r.players.length === 5);

    await returnButton(page).click();

    await expect(leaveNotice(page)).toHaveText('대기방 정원이 가득 차 들어갈 수 없습니다.');
    await expectReadable(leaveNotice(page));
    await expect(page).toHaveURL(/\/gameresult/);
});

test('A08-E-028 8명 판: 판 전 2번 추방 + 판 뒤 대기방에서 1번 추방 → 코드로 다시 들어오면 3번 추방 거절 글 @game', async ({ user, bots }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const me = U(user);
    const all = await bots.spawn(7);
    const [host, ...others] = all;
    const created = await host.createRoom({ maxPlayers: 8 });

    // 판 전: 방장 봇이 사람을 2번 추방 (그때마다 사람은 코드로 다시 들어옴 — 2번까지는 들어와짐)
    for (let n = 1; n <= 2; n += 1) {
        await ui.joinRoomByCodeUi(page, created.roomCode);
        await waitRoom(me);
        await botKick(host, me);
        await expect.poll(() => e2e.roomOf(me), { message: `추방 ${n}번째 뒤 방에서 빠짐` }).toBeNull();
    }
    await ui.joinRoomByCodeUi(page, created.roomCode);

    // 봇 6 입장·전원 준비 → 시작 (8명 판), 광대는 맨 끝 봇
    const room = await botsJoinAndReady(others, U(host), created.roomCode);
    await host.setReady(room.roomId, room.settingsVersion);
    await ui.readyUi(page);
    await e2e.setRoles({ [me]: 'CITIZEN', [U(all.at(-1))]: 'JOKER' }, { roomId: room.roomId });
    const started = await host.startGame(room.roomId, room.settingsVersion);
    await expect(page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const t = new Table({ room: created, bots: all, humans: [user] });
    t.gameId = started.gameId;

    await planExecution(t, user);
    await N.toEnd(t);
    await waitResult(page);

    // 판 뒤: 사람·원래 방장 봇이 같은 방으로 → 방장 봇이 1번 더 추방 (판 전 2번 + 1번 = 3번)
    await returnButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
    await botBack(host, t.gameId);
    await waitRoom(me, (r) => r.hostUuid === U(host));
    await botKick(host, me);
    await expect.poll(() => e2e.roomOf(me), { message: '3번째 추방 뒤 방에서 빠짐' }).toBeNull();

    const message = await enterCodeForAlert(page, t.roomCode);
    expect(message).toContain('3번 추방');
    await expect(page).not.toHaveURL(/\/game-matching/);
});

test('A08-E-061 5명 판 결과 화면: 실패 안내가 떠도 두 단추를 안 가림 (단추 가운데 점이 단추 자신) @game', async ({ user, table }) => {
    const page = user.page;
    const line = await tapSocketLine(page);
    await playToResult({ user, table, total: 5 });

    // A08-E-024와 같은 상태: 연결이 끊긴 채 "대기방으로" → 안내가 뜸
    await line.cut();
    await returnButton(page).click();
    await expect(leaveNotice(page)).toHaveText(RETURN_OFFLINE_NOTICE);

    // 가려짐 검사 포함: 안내 글과 두 단추 모두 가운데 점에 자기 자신이 있음
    await expectReadable(leaveNotice(page));
    await expectButtonReadable(returnButton(page));
    await expectButtonReadable(lobbyButton(page));
    await expect(returnButton(page)).toBeEnabled();
    await expect(lobbyButton(page)).toBeEnabled();
});

test('A08-E-070 5명 판 결과 화면: 연결이 끊겨 "대기방으로" 실패 → 다시 이어진 뒤 다시 누르면 대기방으로 감 @game', async ({ user, table }) => {
    const page = user.page;
    const line = await tapSocketLine(page);
    const { t } = await playToResult({ user, table, total: 5 });

    await line.cut();
    await returnButton(page).click();
    await expect(leaveNotice(page)).toHaveText(RETURN_OFFLINE_NOTICE);

    // 줄을 다시 이음 → 화면이 스스로 다시 붙은 뒤 "다시 눌러 주세요" 대로 누르면 들어감 (아직 안 붙었으면 같은 안내가 다시 뜨니 될 때까지 누름)
    line.restore();
    await expect(async () => {
        if (!/\/game-matching/.test(page.url())) await returnButton(page).click({ timeout: 2000 });
        await expect(page).toHaveURL(/\/game-matching/, { timeout: 3000 });
    }).toPass({ timeout: 40_000 });

    const room = await waitRoom(U(user));
    expect(room.roomCode).toBe(t.roomCode);
});
