'use strict';

// A01b 대기방 입장·준비·초대 브라우저 시험이 같이 쓰는 작은 도우미 — 봇 방 차리기·자리 준비 글 읽기·코드 입장 알림과 실패 안내 띠·봇 추방·친구·초대·공개 목록 줄·소켓 줄 가로채기
// tests/room/a01-join-*·a01-invite*·a01-ready·a01-gather-people, tests/mobile/a01-join-*·a01-invite·a01-ready만 씀 (이름이 _로 시작해 시험으로 안 셈, 공용 도우미는 불러만 씀)
const crypto = require('node:crypto');
const { expect } = require('@playwright/test');
const ui = require('../../helpers/ui');
const { e2e } = require('../../helpers/internal');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { api, botApi } = require('../../helpers/friends');
const { openFriendPanel, openTab } = require('../lobby/lobbyHelpers');
const { openRoomList, findRoomRow } = require('./roomHelpers');
// 탈주 만들기(판 앉히기·첫 낮·산 채로 나가기)는 A09 도우미 그대로 (탈주 막힘은 서버 메모리라 DB에 줄만 넣으면 안 걸림)
const A09 = require('../ingame/_a09-simple-kit');

// 화면·서버 글 (결정·목록 글 그대로, 코드 입장 화면은 거절 코드를 우리말로 바꿔 보임)
const MSG = Object.freeze({
    CODE_WRONG: '입장 코드가 올바르지 않습니다. 코드를 다시 확인해주세요.',
    CODE_FULL: '방 정원이 가득 찼습니다.',
    STARTED: '이미 게임이 시작된 방이라 입장할 수 없습니다.',
    KICK3: '이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다.',
    TOO_MANY: '입장 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
    // 공개 방 입장·초대 수락은 서버 글을 그대로 보임
    FULL: '방이 가득 찼습니다.',
    PUBLIC_GONE: '공개 방을 찾을 수 없습니다.',
    ROOM_GONE: '방을 찾을 수 없습니다.',
    INVITE_FULL: '방이 가득 차 초대를 보낼 수 없습니다.',
    IN_GAME: '진행 중인 게임이 있습니다. 게임을 끝내거나 나간 뒤에 다시 시도해주세요.',
});
// 첫 탈주 뒤 5분 막힘 중 글 (남은 시간은 그때그때 다름) → "탈주로 4분 37초 뒤에…"·"탈주로 59초 뒤에…"
// 나간 직후 1초 안이면 "5분 0초" (서버가 초를 올림 — 남은 299.5초 → 5분 0초)
const DESERTED = /^탈주로 (?:5분 0초|(?:[0-4]분 )?\d{1,2}초) 뒤에 참여할 수 있습니다\.$/;
// 자리 준비 글
const R = '준비완료';
const W = '대기중';
// 서버에 없는 코드: 서버 코드는 0·1·I·O를 안 씀 (backend/utils/roomCode.js 글자 목록)
const NO_SUCH_CODE = 'Z0Z1Z0';

const U = (x) => x.account.uuid;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 같은 값 n개 → seats(R, 2, W) = ['준비완료', '준비완료', '대기중'] */
function seats(...pairs) {
    const out = [];
    for (let i = 0; i < pairs.length; i += 1) {
        const value = pairs[i];
        const n = typeof pairs[i + 1] === 'number' ? pairs[(i += 1)] : 1;
        for (let k = 0; k < n; k += 1) out.push(value);
    }
    return out;
}

// ── 봇 방 ──────────────────────────────────────────────

/** 봇 준비 (거절이면 던짐) */
async function botReady(bot, room, isReady = true) {
    const reply = await bot.setReady(room.roomId, room.settingsVersion, isReady);
    if (!reply?.ok) throw new Error(`봇 준비 실패: ${reply?.code ?? '답 없음'}`);
}

/**
 * 봇 방 차리기: 첫 봇이 방장, 나머지는 코드로 들어옴 (ready면 전부 준비)
 * @param {{ spawn: Function }} bots fixtures의 bots
 * @param {{ max:number, count?:number, accessType?:'code'|'open', ready?:boolean, settings?:object }} o count = 방장 포함 봇 수
 * @returns {Promise<{ host:any, guests:any[], all:any[], room:any, code:string, title:string }>}
 */
async function botRoom(bots, { max, count = 1, accessType = 'code', ready = false, settings = {} }) {
    const all = await bots.spawn(count);
    const [host, ...guests] = all;
    const room = await host.createRoom({ maxPlayers: max, accessType, ...settings });
    for (const g of guests) await g.joinByCode(room.roomCode);
    if (ready) for (const b of all) await botReady(b, room);
    return { host, guests, all, room, code: room.roomCode, title: `${host.nickname}의 방` };
}

/** 이미 있는 방에 봇 n개 더 (코드로) → 새 봇들 */
async function addBots(bots, room, n, { ready = false } = {}) {
    const list = await bots.spawn(n);
    for (const b of list) await b.joinByCode(room.roomCode);
    if (ready) for (const b of list) await botReady(b, room);
    return list;
}

/** 사람 방장 방에 봇 n개 들어옴 (서버 방 값을 다시 읽어 준비) → 새 봇들 */
async function botsIntoHumanRoom(bots, hostUuid, n, { ready = false } = {}) {
    const room = await e2e.roomOf(hostUuid);
    const list = await bots.spawn(n);
    for (const b of list) await b.joinByCode(room.roomCode);
    if (ready) for (const b of list) await botReady(b, room);
    return list;
}

/** 다음 판 직업 정해 두기: 방장 봇 광대 · 나머지 시민 (방은 customRoleSettings({ JOKER: 1 })로 만든 것) */
async function fixBotRoles(r) {
    const roles = Object.fromEntries(r.all.map((b, i) => [b.uuid, i === 0 ? 'JOKER' : 'CITIZEN']));
    await e2e.setRoles(roles, { roomId: r.room.roomId });
}

/**
 * 봇만 앉은 판 시작 (count명 전부 준비 → 직업 정함 → 방장 시작) → botRoom 값 + gameId
 * 직업은 늘 정해 둠: 광대 1(방장 봇) + 나머지 시민 (직접 지정 구성이라 인원이 바뀌어도 맞음)
 */
async function botGame(bots, { count, max = count, accessType = 'code' }) {
    const r = await botRoom(bots, { max, count, accessType, ready: true, settings: customRoleSettings({ JOKER: 1 }) });
    await fixBotRoles(r);
    const started = await r.host.startGame(r.room.roomId, r.room.settingsVersion);
    return { ...r, gameId: started.gameId };
}

/** 봇 방장이 방 지우기 */
async function botDelete(host) {
    const reply = await host.request('delete_room', {});
    if (!reply?.ok) throw new Error(`봇 방 지우기 실패: ${reply?.code ?? '답 없음'}`);
}

/** 서버 방 인원 (방장 uuid로) */
async function roomSize(hostUuid) {
    return (await e2e.roomOf(hostUuid))?.players?.length ?? 0;
}

// ── 대기방 화면 ────────────────────────────────────────

/**
 * 자리 준비 글들 (자리 차례 = 들어온 차례), PC·모바일 같은 모양: 자리 칸(div) 안 실루엣 그림 옆 글
 * 단추 안 글("준비완료" 단추)은 div 바로 밑이 아니라 안 잡힘
 */
const seatBadges = (page) => page.locator('xpath=//div[img]/span[normalize-space(.)="준비완료" or normalize-space(.)="대기중"]');

/** 자리 글이 그 차례대로 보일 때까지 → expectSeats(page, seats(R, 4, W)) */
async function expectSeats(page, list, { timeout = 15_000 } = {}) {
    await expect(seatBadges(page)).toHaveText(list, { timeout });
}

/** 파티 인원 글 */
async function expectParty(page, n, { timeout = 15_000 } = {}) {
    await expect(page.getByText(`파티 인원 ${n}명`)).toBeVisible({ timeout });
}

/** 대기방 확인이 끝나 준비 단추가 켜질 때까지 (방 확인 전엔 준비·추방이 잠김) */
async function waitVerified(page, { timeout = 20_000 } = {}) {
    await expect(page.getByRole('button', { name: /^(준비완료|준비취소)$/ })).toBeEnabled({ timeout });
}

// ── 코드 입장 화면 ─────────────────────────────────────

const joinButton = (page) => page.getByRole('button', { name: '참여하기' });

/** 코드 입장 화면 열고 코드 치기 (PC 6칸 / 모바일 한 칸, 첫 칸부터 치면 다음 칸으로 넘어감) */
async function typeCode(page, code) {
    await page.goto('/roomInvite');
    await page.getByRole('textbox', { name: /방 코드/ }).first().click();
    await page.keyboard.type(code);
}

/** 코드 치고 "참여하기" → 뜬 알림 글 (PC 브라우저 알림 창, 모바일 양피지 안내 창) */
async function codeAlert(page, code, o = {}) {
    await typeCode(page, code);
    return ui.captureAlert(page, () => joinButton(page).click(), o);
}

/** PC 코드 입장 화면의 실패 안내 띠 글 (알림 창을 닫은 뒤에도 화면에 남음, 모바일엔 띠가 없음) */
const entryNotice = (page) => page.getByTestId('entry-failure-notice').locator('span');

/** 실패 안내 띠 글이 그 글(글자 또는 정규식)이고 읽힘 (PC만) */
async function expectEntryNotice(page, text) {
    await expect(entryNotice(page)).toHaveText(text);
    await expectReadable(entryNotice(page));
}

/**
 * 방장 봇이 대기방에서 한 사람 추방 (화면이 보내는 값 그대로: 지금 방 값에서 방·자리 번호를 읽어 보냄)
 * tests/result/a08-code-entry.spec.js botKick과 같은 모양
 */
async function botKick(host, targetUuid) {
    const current = await host.request('get_current_room', {});
    const room = current?.room;
    if (!room) throw new Error('방장 봇의 방이 없음');
    const seatOf = (uuid) => room.players.find((p) => p.uuid === uuid)?.membershipId;
    const reply = await host.request('kick_room_player', {
        requestId: crypto.randomUUID(),
        bootEpoch: room.bootEpoch,
        roomId: room.roomId,
        roomInstanceId: room.roomInstanceId,
        requesterMembershipId: seatOf(host.uuid),
        targetUuid,
        targetMembershipId: seatOf(targetUuid),
    });
    if (!reply?.ok) throw new Error(`추방 실패: ${JSON.stringify(reply)}`);
}

/** 사람이 코드로 들어옴 → 봇 방장이 추방 → 방 목록, 3번 (4번째 입장은 시험이 직접) */
async function kickedThrice(person, host, code) {
    for (let i = 0; i < 3; i += 1) {
        await ui.joinRoomByCodeUi(person.page, code);
        await waitVerified(person.page);
        await botKick(host, U(person));
        await expect(person.page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    }
}

/**
 * 탈주 만들기: 사람 1 + 봇 n-1 판 → 첫 낮 → 산 채로 나감 (방 목록 화면) → 그때부터 5분 막힘
 * @returns {Promise<import('../../helpers/game').Table>}
 */
async function desert(table, person, { n = 5 } = {}) {
    const t = await A09.seat(table, person, { n });
    await A09.toDay(t);
    await A09.leaveAlive(person.page);
    return t;
}

// ── 친구·초대 ──────────────────────────────────────────

/** 봇이 친구 신청 → 사람이 수락 (판·방 들어가기 전에 맺어 둠) */
async function befriendBot(person, bot) {
    await botApi(bot, 'POST', '/friends/requests', { receiverId: U(person) });
    let request = null;
    await expect.poll(async () => {
        const incoming = await api(person, 'GET', '/friends/requests/incoming');
        request = incoming.find((r) => r.id === bot.uuid) ?? null;
        return request !== null;
    }, { timeout: 10_000, message: '받은 친구 신청' }).toBe(true);
    await api(person, 'PUT', `/friends/requests/${request.request_id}/accept`);
}

/** 대기방에 있는 봇이 사람을 게임 초대 (HTTP, 화면이 보내는 값과 같음) */
async function botInvite(bot, receiverUuid) {
    return botApi(bot, 'POST', '/friends/invites', { receiverId: receiverUuid, creationKey: crypto.randomUUID() });
}

/** 봇이 받은 대기 중 초대 id (보낸 사람으로 찾음) */
async function inviteIdFor(bot, senderUuid) {
    let found = null;
    await expect.poll(async () => {
        const data = await botApi(bot, 'GET', '/friends/invites');
        const list = Array.isArray(data) ? data : (data?.invites ?? []);
        found = list.find((i) => i.senderId === senderUuid && i.status === 'PENDING') ?? null;
        return found !== null;
    }, { timeout: 10_000, message: '봇이 받은 초대' }).toBe(true);
    return found.inviteId;
}

/** 봇이 받은 초대 수락 → 답 (ok가 아니면 던짐) */
async function botAccept(bot, senderUuid) {
    const inviteId = await inviteIdFor(bot, senderUuid);
    const reply = await bot.request('accept_game_invite', { inviteId });
    if (!reply?.ok) throw new Error(`봇 초대 수락 실패: ${JSON.stringify(reply)}`);
    return reply;
}

/** 봇이 받은 초대 거절 */
async function botDecline(bot, senderUuid) {
    const inviteId = await inviteIdFor(bot, senderUuid);
    return botApi(bot, 'POST', `/friends/invites/${encodeURIComponent(inviteId)}/decline`);
}

/** 로비 친구 창 → "게임 초대" 탭 → 받은 초대 목록 */
async function openInvites(page) {
    await openFriendPanel(page);
    await openTab(page, '게임 초대');
    const list = page.getByRole('list', { name: '받은 게임 초대' });
    await expect(list).toBeVisible();
    return list;
}

/** 받은 초대 줄 하나 (보낸 사람 닉네임으로) */
const inviteRow = (page, nickname) => page.getByRole('list', { name: '받은 게임 초대' }).locator('[data-invite-id]').filter({ hasText: nickname });
const acceptButton = (row) => row.getByRole('button', { name: '초대 수락' });
const inviteError = (row) => row.locator('[data-invite-error]');

/** 대기방 "친구 초대" 단추 → 친구 초대 창 */
async function openInviteModal(page) {
    await page.getByRole('button', { name: '친구 초대' }).click();
    const dialog = page.getByRole('dialog', { name: '친구초대' });
    await expect(dialog).toBeVisible();
    return dialog;
}
/** 친구 초대 창 닫기 (Esc — 바깥 덮개 단추와 닫기 단추 이름이 같아 키로 닫음) */
async function closeInviteModal(page) {
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '친구초대' })).toHaveCount(0);
}
const inviteFriendButton = (page, nickname) => page.getByRole('button', { name: `${nickname} 게임 초대` });
const invitingButton = (page, nickname) => page.getByRole('button', { name: `${nickname} 초대 보내는 중` });

// ── 공개 방 목록 ───────────────────────────────────────

const enterButton = (page) => page.getByRole('button', { name: '선택한 방 입장' });

/** 방 목록 열고 그 방 줄 찾기 (쪽 넘기며) → 줄 */
async function findRow(page, title) {
    await openRoomList(page);
    const row = await findRoomRow(page, title, { timeoutMs: 30_000 });
    expect(row, `공개 방 목록에 "${title}" 줄`).not.toBeNull();
    return row;
}

/** 방 목록에서 그 방 줄 고르기 → 줄 */
async function pickRow(page, title) {
    const row = await findRow(page, title);
    await row.click();
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    return row;
}

/**
 * 지금 목록에서 그 방 줄 읽는 이름 (첫 쪽부터 끝 쪽까지 한 번 훑음), 없으면 null
 * → '봇이름의 방, 3/9명, …' — 다른 시험 방이 생기고 없어져 쪽이 바뀌어도 다시 훑어 찾음
 */
async function rowLabel(page, title) {
    const panel = page.getByRole('region', { name: '공개 방 목록' });
    const prev = panel.getByRole('button', { name: '이전 페이지' });
    while (await prev.isEnabled().catch(() => false)) await prev.click();
    for (let i = 0; i < 30; i += 1) {
        const row = panel.getByRole('button', { name: new RegExp(`^${escapeRe(title)},`) });
        if (await row.count() > 0) return row.first().getAttribute('aria-label');
        const next = panel.getByRole('button', { name: '다음 페이지' });
        if (!(await next.isEnabled().catch(() => false))) return null;
        await next.click();
    }
    return null;
}

// ── 소켓 줄 가로채기 ───────────────────────────────────

/** socket.io 사건 글 모양 → '42["이름",…]'·'4217["이름",…]'(답 번호 붙은 것) */
const eventFrame = (name) => {
    const re = new RegExp(`^42\\d*\\["${escapeRe(name)}"`);
    return (message) => typeof message === 'string' && re.test(message);
};

/**
 * 화면 소켓 줄 가운데 끼기 (다음 page.goto부터 새로 붙는 줄에 걸림)
 * up(글, tap) → 'drop'(안 보냄)·'hold'(잡아 둠)·그 밖(그대로) — 화면 → 서버
 * down(글, tap) → 'drop'·그 밖 — 서버 → 화면
 * 잡아 둔 것은 tap.release()로 보냄
 */
async function tapSocket(page, { up = () => null, down = () => null } = {}) {
    const tap = { on: false, held: [] };
    tap.release = () => { for (const send of tap.held.splice(0)) send(); };
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
        const server = ws.connectToServer();
        ws.onMessage((message) => {
            const verdict = up(message, tap);
            if (verdict === 'drop') return;
            if (verdict === 'hold') { tap.held.push(() => server.send(message)); return; }
            server.send(message);
        });
        server.onMessage((message) => {
            if (down(message, tap) === 'drop') return;
            ws.send(message);
        });
    });
    return tap;
}

module.exports = {
    MSG, DESERTED, R, W, NO_SUCH_CODE, U, seats,
    botReady, botRoom, addBots, botsIntoHumanRoom, fixBotRoles, customRoleSettings, botGame, botDelete, roomSize,
    seatBadges, expectSeats, expectParty, waitVerified,
    joinButton, typeCode, codeAlert, entryNotice, expectEntryNotice, botKick, kickedThrice, desert,
    befriendBot, botInvite, inviteIdFor, botAccept, botDecline, openInvites, inviteRow, acceptButton, inviteError,
    openInviteModal, closeInviteModal, inviteFriendButton, invitingButton,
    enterButton, findRow, pickRow, rowLabel,
    eventFrame, tapSocket,
};
