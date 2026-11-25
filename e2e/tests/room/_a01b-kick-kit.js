'use strict';

// A01b 추방·방장 브라우저 시험 몫 도우미, 대기방 고르개·방 차리기(사람·봇 방장, PC·폰)·봇 추방·화면 소켓 길목(알림 막기·답 붙잡기·끊기)
// room/a01-kick*·a01-host*, mobile/a01-kick*·a01-host* 시험이 씀 (공용 아님 — 다른 영역은 안 씀)
const crypto = require('node:crypto');
const { expect } = require('@playwright/test');
const { e2e } = require('../../helpers/internal');
const ui = require('../../helpers/ui');
const { sleep } = require('../../helpers/wait');
const { expectReadable } = require('../../helpers/visible');
const { createRoomUi } = require('./roomHelpers');

// 대기방 다시 붙기 기다림 (07글 1-5 "15초")
const ROOM_GRACE_MS = 15_000;
// 추방 답 기다림 (화면이 8초 넘게 답이 없으면 "결과 모름")
const KICK_ACK_MS = 8_000;

// 화면 글 (목록 글·결정에 적힌 그대로)
const TEXT = Object.freeze({
    kickTitle: '플레이어 추방',
    kickSubtitle: '추방할 플레이어를 선택하세요.',
    kickNotice: '추방을 누르면 확인 없이 바로 내보냅니다.',
    alreadyLeft: '이미 방에서 나간 참가자입니다.',
    emptyTargets: '추방할 수 있는 참가자가 없습니다.',
    codeKicked: '이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다.',
    // 합친 뒤 글: 두 줄로 나눔 (frontend matching/constants/roomMessages.js DELETE_CONFIRM, appConfirm으로 띄움)
    deleteConfirm: '방을 삭제하면 모든 참가자가 나가게 됩니다.\n삭제하시겠습니까?',
    // 단추 꺼진 까닭 글은 방 확인 상태마다 다르나 끝은 같음 (끊김·확인 중·확인 실패)
    lockedReasonEnd: /추방할 수 없습니다\.$/,
});

const U = (x) => x.account.uuid;
const nick = (x) => x.account.nickname;
// 폰 크기 화면인지 (폰 375, PC 1280)
const isPhone = (page) => (page.viewportSize()?.width ?? 1280) < 600;

/** 대기방 인원 이름표 "파티 인원 N명" (PC·폰 같은 이름표) */
const party = (page, n) => page.locator(`[aria-label="파티 인원 ${n}명"]`);
async function expectParty(page, n, o = {}) {
    await expect(party(page, n)).toHaveCount(1, o);
}
/** 지금 화면 인원 숫자 (이름표에서 읽음, 없으면 null) */
async function partyNumber(page) {
    const label = await page.locator('[aria-label^="파티 인원 "]').first().getAttribute('aria-label').catch(() => null);
    const m = /파티 인원 (\d+)명/.exec(label ?? '');
    return m ? Number(m[1]) : null;
}
/** 앉은 수/정원 칸의 보이는 글 (예 "4/6", 읽어 주는 글은 뺌) */
const capacity = (page) => page.getByTestId('matching-party-capacity').locator('[aria-hidden="true"]');
/** 자리 "대기중" 글 (준비 안 한 자리마다 하나 — 단추 글엔 "대기중"이 없음) */
const waitingBadges = (page) => page.getByText('대기중', { exact: true });

// 방장 단추·추방 창 고르개
const kickButton = (page) => page.getByRole('button', { name: '참가자 추방', exact: true });
const kickDialog = (page) => page.getByRole('dialog', { name: TEXT.kickTitle });
// 창 안 닫기(X) — 창 밖 덮개도 같은 이름이라 창 안에서만 찾음
const kickClose = (page) => kickDialog(page).getByRole('button', { name: '플레이어 추방 닫기' });
// 그 사람 줄 (이름으로), 줄 단추는 하나뿐이라 이름 없이 찾음 ("추방"이 "추방 보내는 중"으로 바뀌어도 같은 단추)
const kickRow = (page, who) => kickDialog(page).getByRole('listitem').filter({ hasText: nick(who) });
const kickRowButton = (page, who) => kickRow(page, who).getByRole('button');
const lockedReason = (page) => page.getByTestId('kick-locked-reason');

/** 방장 화면에 쓰는 단추 넷 (결정「기다림」 방장 단추) */
const HOST_BUTTONS = Object.freeze(['게임시작', '방 삭제하기', '방 설정 변경', '참가자 추방']);
const hostButton = (page, name) => page.getByRole('button', { name, exact: true });

/** "참가자 추방" 눌러 창 열기 (방 확인이 끝나 켜질 때까지 기다림) */
async function openKick(page) {
    await expect(kickButton(page)).toBeEnabled({ timeout: 20_000 });
    await kickButton(page).click();
    await expect(kickDialog(page)).toBeVisible();
}

/** 화면으로 한 사람 추방: 창 열기 → 그 줄 "추방" 한 번 → 창이 닫힐 때까지 */
async function kickUi(page, who) {
    await openKick(page);
    await kickRowButton(page, who).click();
    await expect(kickDialog(page)).toHaveCount(0);
    await expect.poll(async () => (await e2e.roomOf(U(who)))?.roomId ?? null, { message: '추방된 사람 방 자리 없음' }).toBeNull();
}

/** 서버 방 명단 uuid들 */
async function seatsOf(uuid) {
    return ((await e2e.roomOf(uuid))?.players ?? []).map((p) => p.uuid);
}

/**
 * 폰 설정 화면에서 방 만들기 (처음 값 정원 10 → "최대 플레이어 수 감소"로 맞춤) → 서버 방 값
 * 정원은 서버 값으로 한 번 더 봄 (화살표 누른 수가 틀려도 바로 알게)
 */
async function createRoomOnPhone(person, { maxPlayers = 10 } = {}) {
    const page = person.page;
    await page.goto('/game-setup');
    const make = page.getByRole('button', { name: '게임 만들기' });
    await expect(make).toBeEnabled();
    const down = page.getByRole('button', { name: '최대 플레이어 수 감소', exact: true });
    for (let n = 10; n > maxPlayers; n -= 1) await down.click();
    await make.click();
    await expect(page).toHaveURL(/\/game-matching/);
    let room = null;
    await expect.poll(async () => { room = await e2e.roomOf(U(person)); return Boolean(room); }).toBe(true);
    expect(room.settings?.maxPlayers, '폰에서 정한 정원').toBe(maxPlayers);
    return room;
}

/** 사람이 방장인 방 (PC는 설정 화면 도우미, 폰은 위 함수) → 서버 방 값 */
function humanRoom(person, { maxPlayers = 6, open = false } = {}) {
    if (isPhone(person.page)) return createRoomOnPhone(person, { maxPlayers });
    return createRoomUi(person, { maxPlayers, code: !open });
}

/** 봇 n명 띄워 그 방에 코드로 입장 → 봇 목록 */
async function joinBots(bots, n, roomCode) {
    if (n <= 0) return [];
    const list = await bots.spawn(n);
    for (const bot of list) await bot.joinByCode(roomCode);
    return list;
}

/** 봇 방장 방 만들기 → { host, room } (accessType 기본 code, open이면 공개) */
async function botRoom(bots, { maxPlayers = 6, open = false } = {}) {
    const [host] = await bots.spawn(1);
    const room = await host.createRoom({ maxPlayers, ...(open ? { accessType: 'open' } : {}) });
    return { host, room };
}

/** 봇들 준비 (방 설정 버전은 지금 서버 값) */
async function readyBots(list, anyUuid) {
    const room = await e2e.roomOf(anyUuid);
    for (const bot of list) await bot.setReady(room.roomId, room.settingsVersion);
}

/** 봇 방 나가기 (화면 "방 나가기"와 같은 사건) → 서버 방 자리가 없어질 때까지 */
async function botLeave(bot) {
    bot.emit('leave_room');
    await expect.poll(async () => (await e2e.roomOf(U(bot)))?.roomId ?? null, { message: '봇 방 자리 없음' }).toBeNull();
}

/** 방장 봇이 대기방에서 한 사람 추방 (화면이 보내는 값 그대로: 지금 방 내용에서 방·자리 번호를 읽어 보냄) */
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
    expect(reply.status, '추방 답 상태').toBe('KICKED');
    return reply;
}

/** 봇 코드 입장이 거절되는지 → 거절 글 (들어가면 실패) */
async function botJoinRejected(bot, roomCode) {
    try {
        await bot.joinByCode(roomCode);
    } catch (error) {
        return String(error?.message ?? error);
    }
    throw new Error(`봇${bot.index}이 들어가 버림 (거절이어야 함)`);
}

/** 방 코드 화면에서 코드 넣고 "참여하기" → 거절 안내 글 (PC는 브라우저 알림, 폰은 양피지 안내 창) */
async function codeEntryAlert(page, code) {
    await page.goto('/roomInvite');
    await page.getByRole('textbox', { name: /방 코드/ }).first().click();
    await page.keyboard.type(code);
    return ui.captureAlert(page, () => page.getByRole('button', { name: '참여하기' }).click());
}

/**
 * 확인 창 글을 받고 accept면 확인·아니면 취소 → 글
 * PC는 브라우저 확인 창(window.confirm), 모바일은 합친 뒤 appConfirm이 양피지 확인 창(alertdialog "확인")으로 뜸 (frontend-mobile shared/ui/modal/parchment/ParchmentConfirmHost.jsx) → 먼저 뜬 쪽을 받음 (30초까지)
 */
function answerNextConfirm(page, accept) {
    return new Promise((resolve, reject) => {
        let done = false;
        const onDialog = (dialog) => {
            if (done) return;
            done = true;
            const message = dialog.message();
            const answer = accept ? dialog.accept() : dialog.dismiss();
            answer.catch(() => {}).finally(() => resolve(message));
        };
        page.once('dialog', onDialog);
        const box = page.getByRole('alertdialog', { name: '확인', exact: true });
        const deadline = Date.now() + 30_000;
        (async () => {
            while (!done && Date.now() < deadline) {
                if (await box.isVisible().catch(() => false)) {
                    done = true;
                    page.off('dialog', onDialog);
                    // 글 칸은 줄바꿈을 그대로 둠 → textContent로 읽어 창 글과 같게 견줌
                    const message = await box.locator('p').first().textContent();
                    await box.getByRole('button', { name: accept ? '확인' : '취소', exact: true }).click();
                    resolve(message);
                    return;
                }
                await sleep(100);
            }
            if (!done) reject(new Error('확인 창이 안 뜸 (30초)'));
        })().catch(reject);
    });
}

/** 사람이 방장인 방 + 봇 botCount명 → 화면 인원이 맞을 때까지 → { room, list } */
async function hostRoom(user, bots, { maxPlayers = 6, botCount = 0, open = false } = {}) {
    const room = await humanRoom(user, { maxPlayers, open });
    const list = await joinBots(bots, botCount, room.roomCode);
    await expectParty(user.page, 1 + botCount);
    return { room, list };
}

/** 봇 방장 방에 봇 botCount명 + 사람 입장 → 화면 인원이 맞을 때까지 → { host, room, list } */
async function guestRoom(user, bots, { maxPlayers = 6, botCount = 0 } = {}) {
    const { host, room } = await botRoom(bots, { maxPlayers });
    const list = await joinBots(bots, botCount, room.roomCode);
    await ui.joinRoomByCodeUi(user.page, room.roomCode);
    await expectParty(user.page, 2 + botCount);
    return { host, room, list };
}

/**
 * 대상 봇이 먼저 나갔는데 방장 화면은 모르는 모습 → 그 줄 "추방" → 실패 글까지 (정원 6 · 사람 방장 + 봇 4)
 * 방장 화면의 player_left_room만 버려 "아직 앉아 있음"으로 보이게 함 → { gate, list, gone, error }
 */
async function kickAfterLeave(user, bots) {
    const page = user.page;
    const gate = await socketGate(page);
    const { list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 4 });
    const gone = list[0];
    gate.drop.add('player_left_room');
    await botLeave(gone);
    // 서버가 보낸 나감 알림을 길목이 버렸는지 (안 왔으면 "모름"이 아니라 늦은 것뿐)
    await expect.poll(() => gate.dropped.length, { message: '나감 알림 버림' }).toBeGreaterThan(0);
    await expectParty(page, 5);
    await openKick(page);
    await kickRowButton(page, gone).click();
    const error = kickDialog(page).getByTestId('kick-error');
    await expect(error).toHaveText(TEXT.alreadyLeft);
    return { gate, list, gone, error };
}

/**
 * 줄 "추방"을 누른 순간부터 서버 답을 붙잡음 → 8초 뒤 "결과 모름" 글까지 (정원 6 · 사람 방장 + 봇 4)
 * 요청은 서버에 감(서버는 추방함), 답만 화면에 안 옴 → { gate, list, target, unknown, pressedAt }
 */
async function kickWithoutAnswer(user, bots) {
    const page = user.page;
    const gate = await socketGate(page);
    const { list } = await hostRoom(user, bots, { maxPlayers: 6, botCount: 4 });
    const target = list[0];
    await openKick(page);
    gate.hold();
    const pressedAt = Date.now();
    await kickRowButton(page, target).click();
    const unknown = kickDialog(page).getByTestId('kick-unknown');
    await expect(unknown).toBeVisible({ timeout: KICK_ACK_MS + 5_000 });
    return { gate, list, target, unknown, pressedAt };
}

/**
 * 그림 단추(그림 위에 글 얹음)가 읽히는지: 단추는 보임·화면 안·안 가려짐, 글은 대비
 * 글 칸이 누르기 막힘(pointer-events none)이라 글 칸 자체는 "가려짐"으로 잡혀서 둘로 나눠 봄
 */
async function expectLabelButtonReadable(button, label) {
    await expectReadable(button, { contrast: false });
    await expectReadable(button.getByText(label, { exact: true }), { uncovered: false });
}

/** 정한 시각까지 진짜로 기다림 (15초 규칙을 보는 시험만 씀) */
async function sleepUntil(at) {
    const wait = at - Date.now();
    if (wait > 0) await sleep(wait);
}

/**
 * 화면 소켓 길목 (다음 page.goto부터 새 소켓이 이 길로 감 → 방 차리기 전에 걸기)
 * gate.drop.add('player_left_room')  서버 → 화면 그 알림만 버림 (대상이 나간 것을 방장 화면이 모르게)
 * gate.hold() / gate.release()        서버 → 화면 값을 붙잡았다가 순서대로 넘김 (= 답이 안 옴, 소켓은 그대로)
 * await gate.cut() / gate.restore()   소켓을 닫고 다시 붙기도 거절 / 다시 붙게 풂 (= 연결 끊김)
 * 오프라인(context.setOffline)은 이미 열린 웹소켓을 못 끊어 열린 것은 이 길목이 닫음
 * 끊긴 동안 다시 붙기는 오프라인으로 실패시킴: 길목이 그냥 닫으면 화면 socket.io가 실패로 안 보고 접속 제한 20초를 다 기다려
 * 다시 붙기가 20초 넘게 늦어짐(대기방 자리 남김 15초를 넘겨 방에서 빠짐), 오프라인 실패는 오류로 보여 1~3초 뒤 다시 붙음
 */
async function socketGate(page) {
    const gate = { drop: new Set(), dropped: [], holding: false, held: [], offline: false, opened: 0, refused: 0, pairs: [] };
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
        if (gate.offline) {
            gate.refused += 1;
            // 오프라인이라 서버 연결이 실패 → 화면 소켓에 오류·닫힘이 감
            ws.connectToServer();
            return;
        }
        const server = ws.connectToServer();
        gate.opened += 1;
        gate.pairs.push({ ws, server });
        ws.onMessage((message) => server.send(message));
        server.onMessage((message) => {
            const text = typeof message === 'string' ? message : '';
            // socket.io 알림 글 모양: 42["사건이름",{...}]
            if ([...gate.drop].some((event) => text.includes(`["${event}"`))) {
                gate.dropped.push(text);
                return;
            }
            const pass = () => { try { ws.send(message); } catch { /* 이미 닫힌 소켓 */ } };
            if (gate.holding) gate.held.push(pass);
            else pass();
        });
    });
    gate.hold = () => { gate.holding = true; };
    gate.release = () => {
        gate.holding = false;
        for (const pass of gate.held.splice(0)) pass();
    };
    gate.cut = async () => {
        gate.offline = true;
        await page.context().setOffline(true);
        const before = gate.refused;
        for (const { ws, server } of gate.pairs.splice(0)) {
            await Promise.resolve(ws.close()).catch(() => {});
            await Promise.resolve(server.close()).catch(() => {});
        }
        await expect.poll(() => gate.refused, { timeout: 20_000, message: '화면이 다시 붙으려다 거절됨' }).toBeGreaterThan(before);
    };
    gate.restore = async () => {
        const before = gate.opened;
        gate.offline = false;
        await page.context().setOffline(false);
        await expect.poll(() => gate.opened, { timeout: 30_000, message: '화면 소켓이 다시 붙음' }).toBeGreaterThan(before);
    };
    return gate;
}

module.exports = {
    ROOM_GRACE_MS, KICK_ACK_MS, TEXT, HOST_BUTTONS,
    U, nick, isPhone, party, expectParty, partyNumber, capacity, waitingBadges,
    kickButton, kickDialog, kickClose, kickRow, kickRowButton, lockedReason, hostButton, openKick, kickUi, seatsOf,
    createRoomOnPhone, humanRoom, joinBots, botRoom, readyBots, botLeave, botKick, botJoinRejected, codeEntryAlert,
    hostRoom, guestRoom, kickAfterLeave, kickWithoutAnswer, expectLabelButtonReadable, answerNextConfirm, sleepUntil, socketGate,
};
