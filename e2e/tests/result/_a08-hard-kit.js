'use strict';

// A08 판 끝 뒤 같은 방 시험 도구 모음 파일, 여러 사람 판 차리기·판 끝내기(탈주 없이/광대 봇 나가기)·결과 화면 단추·대기방 읽기·다음 판 시작·소켓 길목(늦추기·끊기)
// result/a08-*(어려움)·mobile/a08-*.spec.js가 씀 (이름이 .spec이 아니라 시험으로 안 돎, PC·폰 화면 둘 다)
const { expect } = require('@playwright/test');
const { e2e } = require('../../helpers/internal');
const { Table } = require('../../helpers/game');
const ui = require('../../helpers/ui');
const {
    hostGame, createRoomUi, botsJoinAndReady, waitResult, finishGame, closeReveals, stepperRow, stepperValue, setStepper, selectTab,
} = require('../room/roomHelpers');
const N = require('../ingame/b-night/_night');
const { expectReadable } = require('../../helpers/visible');

const U = (x) => x.account.uuid;
// 폰 크기 화면인지 (폰 375, PC 1280 — PC·모바일이 섞인 판에서 갈라 쓰기)
const isPhone = (page) => (page.viewportSize()?.width ?? 1280) < 600;

// 화면 글 (화면 문구 그대로 — 결과 화면·대기방·방 코드 화면)
const TEXT = Object.freeze({
    lobbyConfirm: '로비로 나가시겠습니까?',
    hostSeatNotice: '방장 자리를 비워 두었습니다. 지난 판 방장이 오지 않으면 먼저 들어온 사람이 방장이 됩니다.',
    noResult: '게임 결과를 확인할 수 없습니다',
    minPlayers: '게임을 시작하기 위한 인원 조건을 아직 충족하지 못했습니다.',
    // 4명 이하 방장 화면의 시작 잠김 까닭 글 (화면 gameStartMessages.js startShortageMessage)
    startLocked: /^5명부터 시작할 수 있습니다\. \(지금 [0-4]명\)$/,
    returnOffline: "연결이 끊겨 대기방으로 가지 못했습니다. 연결을 확인한 뒤 '대기방으로'를 다시 눌러 주세요.",
    exitOffline: "연결이 끊겨 로비로 가지 못했습니다. 연결을 확인한 뒤 '로비로'를 다시 눌러 주세요.",
    resultClosed: '결과 화면 시간이 지나 대기방으로 돌아갈 수 없습니다.',
    // 결과 화면 시간이 남았는데 끊겨 끝난 판에서 빠진 뒤 "대기방으로" (사용자 결정 2026-11-16 일곱째)
    returnDropped: "연결이 끊겨 이 판에서 빠졌습니다. '로비로'를 눌러 주세요.",
    returnFull: '대기방 정원이 가득 차 들어갈 수 없습니다.',
    codeFull: '방 정원이 가득 찼습니다.',
    codeNoRoom: '입장 코드가 올바르지 않습니다. 코드를 다시 확인해주세요.',
    codeKicked: '이 방에서 3번 추방되어 더 이상 들어갈 수 없습니다.',
    // 판 중 코드 입장 거절 글의 앞머리 (서버 글 "…방입니다."와 화면 글 "…방이라 입장할 수 없습니다."가 같이 가진 말)
    started: '이미 게임이 시작된 방',
    desertion: /^탈주로 .+ 뒤에 참여할 수 있습니다\.$/,
});

// 고르개 (PC·폰 같은 이름표)
const returnButton = (page) => page.getByRole('button', { name: '대기방으로' });
const lobbyButton = (page) => page.getByRole('button', { name: '로비로', exact: true });
const leaveNotice = (page) => page.getByTestId('result-leave-notice');
const closeTimer = (page) => page.getByTestId('result-close-timer');
const startButton = (page) => page.getByRole('button', { name: '게임시작' });
const hostSeat = (page) => page.getByTestId('matching-reserved-host-slot');
const blockedDialog = (page) => page.locator('[data-game-start-blocked]');
// 5명이 안 돼 "게임시작"이 미리 꺼졌을 때 방장 화면 버튼 줄 위 까닭 글 (PC·폰 같은 표시, 손님 화면엔 없음)
const startLockedReason = (page) => page.getByTestId('start-locked-reason');

/** 사람 n명 열기 (각자 다른 계정·다른 쿠키), o.mobile이면 폰 화면 */
async function openHumans(players, n, o = {}) {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await players.add(o));
    return out;
}

/**
 * 직업 표 만들기: 광대로 둘 사람·봇만 주면 나머지 사람은 시민 (안 적은 봇은 서버가 남은 직업으로 채움)
 * @example rolesFor([a, b], [b, bot]) // { a: 'CITIZEN', b: 'JOKER', bot: 'JOKER' }
 */
function rolesFor(humans, jokers) {
    return {
        ...Object.fromEntries(humans.map((h) => [U(h), 'CITIZEN'])),
        ...Object.fromEntries(jokers.map((x) => [U(x), 'JOKER'])),
    };
}

/** 미리 정한 직업이 서버 판에 그대로 들어갔는지 (안 맞으면 판이 다른 쪽으로 끝남) → 판 요약 */
async function expectRoles(gameId, wanted) {
    const s = await e2e.game(gameId);
    for (const [uuid, role] of Object.entries(wanted)) {
        expect(s.players.find((p) => p.uuid === uuid)?.role, `미리 정한 직업 (${uuid})`).toBe(role);
    }
    return s;
}

/** 서버 판 값에서 광대인 봇 하나 찾기 (미리 정한 직업이 가끔 다른 봇으로 맞바뀜) — 광대가 사람이거나 빼야 할 봇이면 바로 알림 */
async function findJokerBot(t, botList, { not = null } = {}) {
    const s = await t.state();
    const jokers = s.players.filter((p) => p.role === 'JOKER').map((p) => p.uuid);
    expect(jokers, '광대는 1명').toHaveLength(1);
    const joker = botList.find((bot) => U(bot) === jokers[0]);
    expect(joker, '광대는 봇이어야 함 (사람은 시민)').toBeTruthy();
    expect(joker === not, '방장 봇은 광대가 아니어야 함 (판 끝까지 방장으로 남게)').toBe(false);
    return joker;
}

/**
 * 봇 방장 판 차리기 (광대 1): 사람은 시민, 광대는 맨 뒤 봇 (방장 봇 = 맨 앞 봇은 판 끝까지 남게 광대로 안 둠)
 * @returns {Promise<{ t:any, joker:any, host:any }>} joker = 광대 봇(서버 값으로 다시 찾음), host = 방장 봇
 */
async function seatTable(table, humans, botCount, settings = {}) {
    const t = await table.setup({
        humans, bots: botCount, settings,
        roles: ({ bots }) => rolesFor(humans, [bots.at(-1)]),
    });
    const host = t.bots[0];
    const joker = await findJokerBot(t, t.bots, { not: host });
    return { t, joker, host };
}

/**
 * 사람 방장 판 차리기 (PC 화면으로 방 만듦, 광대 1): 사람은 시민, 광대는 맨 뒤 봇
 * @param {object} settings 설정 화면 칸 (roomHelpers fillSettings: code·maxPlayers·discussion·vote·tribunal·night)
 * @returns {Promise<{ t:any, joker:any, botList:any[] }>} joker = 광대 봇(서버 값으로 다시 찾음)
 */
async function seatHosted(bots, host, guests, botCount, settings = {}) {
    const botList = await bots.spawn(botCount);
    const roles = rolesFor([host, ...guests], [botList.at(-1)]);
    const t = await hostGame({ host, guests, botList, roles, settings });
    const joker = await findJokerBot(t, botList);
    return { t, joker, botList };
}

/** 광대 봇이 판에서 나감 → 산 광대 0명 → 시민 승으로 판 끝 (그 봇은 탈주라 뒤에 못 씀, 판에 광대가 하나일 때) */
async function jokerLeaves(t, joker) {
    const reply = await joker.request('leave_game_session', { gameId: t.gameId });
    expect(reply?.ok, `광대 봇 나가기 답 ${JSON.stringify(reply)}`).toBe(true);
}

/** 봇 표로 광대 봇을 처형 → 시민 승 (아무도 안 나가 탈주 없음, 처형된 봇도 "대기방으로" 됨), 봇 표가 기권보다 많아야 재판이라 먼저 셈 */
async function voteOutJoker(t, joker) {
    const victim = U(joker);
    await t.assertBotsCanExecute(victim);
    t.playBots((bot) => ({ dayVote: bot === joker ? 'abstain' : victim, tribunal: 'GUILTY', night: 'skip' }));
    await closeReveals(t.humans.map((h) => h.page));
    await finishGame(t, { stepDelayMs: 1200 });
    await t.stopBots();
}

/**
 * 광대 봇이 밤마다 한 명씩 암살 → 광대 수 ≥ 나머지가 되면 광대 승 (아무도 안 나가 탈주 없음, 죽은 봇도 "대기방으로" 됨)
 * 낮엔 아무도 표를 안 내 재판 없이 밤으로 감, 사람이 같은 편 광대여도 봇 표 하나로 대상이 정해짐
 * @param {any[]} jokerBots 광대인 봇들 (다 같은 사람을 찍음)
 * @param {string[]} victims 밤 순서대로 죽일 사람 uuid (5명 판 광대 2 → 1명, 6명 판 광대 2 → 2명)
 */
async function killByNight(t, jokerBots, victims) {
    let dayIndex = null;
    for (const victim of victims) {
        const s = await N.toTurn(t, 'JOKER', dayIndex === null ? {} : { dayIndex });
        for (const bot of jokerBots) {
            const reply = await N.botNight(t, bot, victim);
            expect(reply?.ok, `밤 암살 답 ${JSON.stringify(reply)}`).toBe(true);
        }
        dayIndex = s.dayIndex + 1;
    }
    await N.toEnd(t);
}

/** 사람 광대가 화면으로 암살 → 광대 2 : 나머지 2 → 광대 승 (사람만 있는 5명 판, 아무도 안 나감) */
async function killByHuman(t, joker, victim) {
    const nickname = victim.account.nickname;
    await N.toTurn(t, 'JOKER');
    await N.nightActUi(joker.page, nickname, '암살');
    // 고른 것이 서버에 들어갔는지: 같은 카드 메뉴에 "취소하기"가 생김
    await expect(async () => {
        const menu = await N.openCardMenu(joker.page, nickname, { timeout: 5000 });
        await expect(menu.getByRole('menuitem', { name: '취소하기', exact: true })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    await N.toEnd(t);
}

/**
 * 봇 + 사람 몇이 광대 봇에게 투표(사람은 PC 화면 카드 메뉴) → 재판 → 봇 유죄 → 처형 → 시민 승
 * 사람이 많은 판(예: 사람 5 + 봇 5)은 봇 표만으로 기권을 못 넘어서 씀, 아무도 안 나가 탈주 없음
 */
async function voteOutWithHumans(t, joker, voters) {
    const victim = U(joker);
    const others = t.bots.filter((bot) => bot !== joker);
    await t.advanceUntil('DAY_VOTE');
    for (const bot of others) {
        const reply = await bot.request('cast_day_vote', { gameId: t.gameId, targetId: victim });
        expect(reply?.ok, `봇 낮 표 답 ${JSON.stringify(reply)}`).toBe(true);
    }
    // 서버가 받은 표시: 다시 연 광대 카드 메뉴가 "투표취소" (사람을 찍어도 기권 단추는 안 잠김, 사용자 결정 2026-11-18)
    for (const h of voters) {
        const menu = await N.openCardMenu(h.page, joker.nickname);
        await menu.getByRole('menuitem', { name: '투표하기', exact: true }).click();
        await expect(menu).toBeHidden();
        await expect(async () => {
            const again = await N.openCardMenu(h.page, joker.nickname);
            await expect(again.getByRole('menuitem', { name: '투표취소', exact: true })).toBeVisible({ timeout: 1500 });
        }).toPass({ timeout: 15_000 });
        await h.page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
    }
    // 투표 마감 → 재판 (최다 득표가 기권보다 많아야 열림)
    await t.advance();
    await expect.poll(async () => (await t.state())?.phase, { timeout: 20_000, message: '투표 마감 뒤 재판' }).toBe('TRIBUNAL');
    const s = await t.state();
    expect(s.tribunal?.defendantUuid, '피고 = 광대 봇').toBe(victim);
    for (const bot of others) {
        const reply = await bot.request('cast_tribunal_vote', { gameId: t.gameId, dayIndex: s.dayIndex, vote: 'GUILTY' });
        expect(reply?.ok, `봇 재판 표 답 ${JSON.stringify(reply)}`).toBe(true);
    }
    await finishGame(t, { stepDelayMs: 1200 });
}

/**
 * 판 중 산 사람이 PC 위 줄 "게임 나가기" → 브라우저 확인 창에서 확인 → 판 화면을 벗어남 (산 채로 나가면 탈주)
 * 연출·안내 창이 단추를 가리고 있으면 닫으면서 눌릴 때까지 다시 누름
 */
async function leaveGameUi(page) {
    const accept = (dialog) => { dialog.accept().catch(() => {}); };
    page.on('dialog', accept);
    try {
        await expect(async () => {
            await ui.closeOverlays(page, { keepWatching: false });
            await page.getByRole('button', { name: '게임 나가기', exact: true }).click({ timeout: 2000 });
        }).toPass({ timeout: 30_000 });
        await expect(page).not.toHaveURL(/\/ingame/, { timeout: 15_000 });
    } finally {
        page.off('dialog', accept);
    }
}

/**
 * 폰 결과 화면의 한 판 끝 광고 창 (광고 자리가 켜진 빌드·개발 서버에서만 뜸): 뜨면 "닫기"가 나올 때까지 기다렸다 닫음
 * 광고 꾸러미를 못 받으면 창이 "닫기" 전에 스스로 닫힘(InterstitialAd onEmpty) → 닫기 단추가 나오거나 창이 사라지거나 둘 중 하나까지
 */
async function closeAdIfShown(page) {
    const ad = page.getByRole('dialog', { name: '광고' });
    const shown = await ad.waitFor({ state: 'visible', timeout: 2500 }).then(() => true, () => false);
    if (!shown) return;
    const close = ad.getByRole('button', { name: '닫기' });
    await expect(async () => {
        if (await close.isVisible().catch(() => false)) await close.click({ timeout: 2000 });
        await expect(ad).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
}

/**
 * 밤 암살로 끝난 판은 결과 화면 앞에 낮 시작 연출(암살 영상 + 글)이 뜸 — 시험 브라우저가 영상을 못 틀면 글 창으로 바뀌어 "확인"을 눌러야 결과 화면으로 넘어감
 * 영상이 막혀 뜬 "건너뛰기"·글 창 "확인"을 눌러 가며 결과 화면 주소가 될 때까지 (처형·나가기로 끝난 판은 그냥 기다림, PC·폰 같은 표시)
 */
async function passDawnToResult(page) {
    const skip = page.locator('[data-ingame-night-success-kill]').getByRole('button', { name: '건너뛰기' });
    await expect(async () => {
        if (!/\/gameresult/.test(page.url())) {
            if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
            await N.closeDawnReport(page);
        }
        await expect(page).toHaveURL(/\/gameresult/, { timeout: 1500 });
    }).toPass({ timeout: 60_000 });
}

/** 사람들 화면이 결과 화면 본체까지 (낮 시작 연출·결과 영상 넘기기 포함, 폰은 광고 창이 뜨면 닫음) */
async function allAtResult(people) {
    await Promise.all(people.map(async (p) => {
        await passDawnToResult(p.page);
        await waitResult(p.page);
        if (isPhone(p.page)) await closeAdIfShown(p.page);
    }));
}

/** 결과 화면 "대기방으로" → 대기방 화면 */
async function pressReturn(page) {
    await returnButton(page).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 20_000 });
}

/** 결과 화면 "로비로" → 브라우저 확인 창 글 돌려줌 (accept면 확인, 아니면 취소) */
async function pressLobby(page, { accept = true } = {}) {
    const asked = page.waitForEvent('dialog', { timeout: 10_000 });
    const clicking = lobbyButton(page).click();
    const dialog = await asked;
    const message = dialog.message();
    if (accept) await dialog.accept();
    else await dialog.dismiss();
    await clicking;
    return message;
}

/** 결과 화면 "로비로" → 확인 → 로비 화면 */
async function leaveToLobby(page) {
    expect(await pressLobby(page), '확인 창 글').toBe(TEXT.lobbyConfirm);
    await expect(page).toHaveURL(/\/lobby/, { timeout: 15_000 });
}

/** 봇이 "대기방으로" (return_to_room) → 서버가 준 방 내용 */
async function botReturn(bot, gameId) {
    const reply = await bot.request('return_to_room', { gameId });
    expect(reply?.ok, `봇 대기방으로 답 ${JSON.stringify(reply)}`).toBe(true);
    return reply.room;
}

/** 봇이 결과 화면에서 "로비로" (끝난 판 나가기) */
async function botToLobby(bot, gameId) {
    const reply = await bot.request('leave_game_session', { gameId });
    expect(reply?.ok, `봇 로비로 답 ${JSON.stringify(reply)}`).toBe(true);
}

/** 서버 방 값에서 그 사람이 앉은 방 명단 (uuid 목록, 들어온 순서) — 방에 없으면 빈 목록 */
async function seatsOf(uuid) {
    return ((await e2e.roomOf(uuid))?.players ?? []).map((p) => p.uuid);
}

/** 대기방 화면 인원 글 "파티 인원 N명" (PC·폰 같은 이름표) */
async function expectParty(page, n) {
    await expect(page.locator(`[aria-label="파티 인원 ${n}명"]`)).toHaveCount(1);
}

/** 대기방 "초대코드 공유" 창에 그 방 코드가 적혀 있는지 (PC는 칸 6개 값, 폰은 묶음 이름표), 보고 창 닫음 */
async function expectRoomCodeShown(page, code) {
    const open = page.getByRole('button', { name: '초대코드 공유' });
    // 방 확인이 끝나야 눌림
    await expect(open).toBeEnabled({ timeout: 20_000 });
    await open.click();
    if (isPhone(page)) {
        await expect(page.getByRole('group', { name: `방코드 ${code}`, exact: true })).toBeVisible();
    } else {
        const cells = page.getByRole('dialog', { name: '방코드' }).getByRole('textbox', { name: /방 코드 \d번째 자리/ });
        await expect.poll(async () => (await cells.evaluateAll((els) => els.map((el) => el.value))).join('')).toBe(code);
    }
    await page.getByRole('button', { name: '방코드 팝업 닫기' }).click();
}

/** 방 코드 화면에 코드만 적어 둠 ("참여하기"는 안 누름) */
async function typeRoomCode(page, code) {
    await page.goto('/roomInvite');
    await page.getByRole('textbox', { name: /방 코드/ }).first().click();
    await page.keyboard.type(code);
}

/**
 * 방 코드 화면에서 코드 넣고 "참여하기" → 거절 안내 글 (PC는 브라우저 알림, 폰은 양피지 안내 창)
 * close:false면 폰 안내 창을 안 닫음 (글이 읽히는지 볼 때)
 */
async function codeEntryAlert(page, code, { close = true } = {}) {
    await typeRoomCode(page, code);
    return ui.captureAlert(page, () => page.getByRole('button', { name: '참여하기' }).click(), { close });
}

/** 폰 설정 화면에서 처음 값(정원 10·자동 구성·광대 1)으로 방 만들기 → 서버 방 값 */
function createRoomOnPhone(person) {
    return openPhoneRoom(person);
}

/** 폰 설정 화면에서 방 만들기 (oneJoker면 광대 칸을 1로 맞춤 — 처음 값이 이미 1이라 지금은 안 바뀜, 예전 처음 값 2 때 쓰던 것) */
async function openPhoneRoom(person, { oneJoker = false } = {}) {
    const page = person.page;
    await page.goto('/game-setup');
    if (oneJoker) {
        await selectTab(page, '일반');
        await setStepper(page, '광대(마피아) 플레이어 수', 1);
    }
    const make = page.getByRole('button', { name: '게임 만들기' });
    await expect(make).toBeEnabled();
    await make.click();
    await expect(page).toHaveURL(/\/game-matching/);
    let room = null;
    await expect.poll(async () => { room = await e2e.roomOf(U(person)); return Boolean(room); }).toBe(true);
    return room;
}

/** 로비에 있는 사람이 새 방 만들기 → 서버 방 값 (PC는 설정 화면 도우미, 폰은 처음 값 그대로) */
function createRoomAny(person) {
    return isPhone(person.page) ? createRoomOnPhone(person) : createRoomUi(person, {});
}

// 사람 준비 누르고 "준비취소"로 바뀔 때까지 (이미 준비한 사람은 그대로 둠)
async function readyHumans(humans) {
    for (const h of humans) {
        const cancel = h.page.getByRole('button', { name: '준비취소' });
        if (!(await cancel.isVisible().catch(() => false))) await ui.readyUi(h.page);
        await expect(cancel).toBeVisible();
    }
}

// 봇 준비 (돌아온 방은 방 id가 새것이라 지금 서버 값으로)
async function readyBots(botList, room) {
    for (const bot of botList) {
        const reply = await bot.setReady(room.roomId, room.settingsVersion);
        expect(reply?.ok, `봇 준비 답 ${JSON.stringify(reply)}`).toBe(true);
    }
}

/**
 * 돌아온 대기방에서 다음 판 시작 (사람 방장이 화면으로): 봇·손님 준비 → 직업 예약 → 방장 준비·게임시작 → 새 판
 * @returns {Promise<Table>} 새 판 (bots = botList)
 */
async function startByHuman(host, guests, botList, roles = null) {
    const room = await e2e.roomOf(U(host));
    await readyBots(botList, room);
    await readyHumans(guests);
    if (roles) await e2e.setRoles(roles, { roomId: room.roomId });
    await readyHumans([host]);
    await startButton(host.page).click();
    for (const p of [host, ...guests]) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const game = await e2e.gameOf(U(host));
    const t = new Table({ room, bots: botList, humans: [host, ...guests] });
    t.gameId = game.gameId;
    return t;
}

/**
 * 돌아온 대기방에서 다음 판 시작 (방장 봇이 소켓으로): 봇·사람 준비 → 직업 예약 → 시작 → 새 판
 * @param {any[]} botList 방에 있는 봇 전부 (방장 봇 포함)
 * @returns {Promise<Table>} 새 판 (bots = botList)
 */
async function startByBot(hostBot, humans, botList, roles = null) {
    const room = await e2e.roomOf(U(hostBot));
    await readyBots(botList, room);
    await readyHumans(humans);
    if (roles) await e2e.setRoles(roles, { roomId: room.roomId });
    const started = await hostBot.startGame(room.roomId, room.settingsVersion);
    for (const h of humans) await expect(h.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const t = new Table({ room, bots: botList, humans });
    t.gameId = started.gameId;
    return t;
}

/**
 * 폰 사람 방장 판 차리기 (폰 화면으로 정원 10·자동 구성·광대 1 방 만듦): 손님은 코드로 입장, 사람은 시민·광대는 맨 뒤 봇
 * @returns {Promise<{ t:any, joker:any, botList:any[] }>} joker = 광대 봇(서버 값으로 다시 찾음)
 */
async function seatPhoneHosted(bots, host, guests, botCount) {
    const room = await openPhoneRoom(host, { oneJoker: true });
    expect(room.settings?.jokerCount, '방 광대 수').toBe(1);
    for (const g of guests) await ui.joinRoomByCodeUi(g.page, room.roomCode);
    const botList = await bots.spawn(botCount);
    await botsJoinAndReady(botList, U(host), room.roomCode);
    await readyHumans(guests);
    await expectParty(host.page, 1 + guests.length + botCount);
    await e2e.setRoles(rolesFor([host, ...guests], [botList.at(-1)]), { roomId: room.roomId });
    await readyHumans([host]);
    await startButton(host.page).click();
    for (const p of [host, ...guests]) await expect(p.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    const game = await e2e.gameOf(U(host));
    const t = new Table({ room, bots: botList, humans: [host, ...guests] });
    t.gameId = game.gameId;
    const joker = await findJokerBot(t, botList);
    return { t, joker, botList };
}

/**
 * "게임시작"이 인원 모자람으로 막혔는지 (PC·폰 같은 표시): 단추가 미리 꺼져 있고 까닭 글이 읽힘, 막힘 창은 안 뜸
 * 결정(2026-11-16 낮 셋째 5번): 4명 이하면 누르기 전에 꺼 두고 까닭 글 → 부르기 전에 단추를 누르지 않음 (꺼진 단추는 눌림을 기다리다 시간 초과)
 * count를 주면 글의 "지금 N명"까지 맞춰 봄
 */
async function expectStartBlocked(page, { count = null } = {}) {
    await expect(startButton(page)).toBeDisabled();
    const reason = startLockedReason(page);
    await expect(reason).toHaveText(count === null ? TEXT.startLocked : `5명부터 시작할 수 있습니다. (지금 ${count}명)`);
    await expectReadable(reason);
    await expect(blockedDialog(page)).toHaveCount(0);
}

/**
 * 돌아온 대기방 설정 창(방장만 열림)에 적힌 값 읽고 닫기 — PC·폰 같은 이름표
 * @returns {Promise<{ codeOnly:boolean, maxPlayers:number, jokers:number|null, discussion:number, vote:number, tribunal:number, night:number }>}
 */
async function readRoomSettings(page) {
    const num = async (label) => parseInt(await stepperValue(page, label), 10);
    await page.getByRole('button', { name: '방 설정 변경' }).click();
    await selectTab(page, '일반');
    const codeOnly = (await page.getByRole('checkbox', { name: '코드로만 참가', exact: true }).getAttribute('aria-checked')) === 'true';
    const maxPlayers = await num('최대 플레이어 수');
    // 광대 수 줄은 역할 구성이 "직접 지정"이면 안 보임 → 그땐 null
    const jokerLabel = '광대(마피아) 플레이어 수';
    const jokers = (await stepperRow(page, jokerLabel).count()) > 0 ? await num(jokerLabel) : null;
    await selectTab(page, '회의&투표');
    const out = {
        codeOnly,
        maxPlayers,
        jokers,
        discussion: await num('낮 토론 시간 조절'),
        vote: await num('낮 투표 시간 조절'),
        tribunal: await num('재판 시간 조절'),
        night: await num('밤 행동 시간 조절'),
    };
    await page.getByRole('button', { name: '설정 변경 취소' }).click();
    return out;
}

/** 서버가 정한 결과 화면 닫힘 시각 (판 끝 시각 + 180초, ms) — 결과 화면에 남아 있는 봇의 판 상태 답에서 읽음 */
async function closesAtOf(bot, gameId) {
    const snap = await bot.snapshot(gameId);
    expect(Number.isFinite(snap?.resultClosesAt), `판 상태 답에 닫힘 시각 (${JSON.stringify(snap?.resultClosesAt)})`).toBe(true);
    return snap.resultClosesAt;
}

/** 결과 화면 남은 초 (data-seconds-left 숫자) */
async function secondsLeft(page) {
    return Number(await closeTimer(page).getAttribute('data-seconds-left'));
}

/** 진짜 시간 기다림: 그 시각(ms)까지 쉼 — 180초 규칙을 손잡이 없이 보는 시험만 씀 */
function sleepUntil(at) {
    return new Promise((resolve) => { setTimeout(resolve, Math.max(0, at - Date.now())); });
}

/**
 * 화면 소켓 길목: 서버 답 늦추기·연결 끊기 (다음 page.goto부터 새 소켓이 이 길로 감 → 판 차리기 전에 걸기)
 * gate.delayMs = 4000  서버 → 화면 값을 그만큼 늦게 넘김 (순서는 그대로)
 * await gate.cut()      열린 소켓을 닫고 새 접속도 거절, 화면이 다시 붙으려다 거절당한 것까지 기다림 (= 화면이 끊긴 것을 앎)
 * await gate.restore()  다시 붙게 풀고 새 접속이 열릴 때까지 기다림
 */
async function gateSocket(page) {
    const gate = { delayMs: 0, offline: false, opened: 0, refused: 0, pairs: [] };
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
        if (gate.offline) {
            gate.refused += 1;
            ws.close();
            return;
        }
        const server = ws.connectToServer();
        gate.opened += 1;
        gate.pairs.push({ ws, server });
        // 늦춘 값이 뒤에 온 값보다 늦게 가지 않게 이 소켓의 마지막 넘길 시각을 기억
        let lastAt = 0;
        ws.onMessage((message) => server.send(message));
        server.onMessage((message) => {
            const at = Math.max(Date.now() + gate.delayMs, lastAt);
            lastAt = at;
            const pass = () => { try { ws.send(message); } catch { /* 이미 닫힌 소켓 */ } };
            if (at <= Date.now()) pass();
            else setTimeout(pass, at - Date.now());
        });
    });
    gate.cut = async () => {
        gate.offline = true;
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
        await expect.poll(() => gate.opened, { timeout: 30_000, message: '화면 소켓이 다시 붙음' }).toBeGreaterThan(before);
    };
    return gate;
}

module.exports = {
    U, isPhone, TEXT, returnButton, lobbyButton, leaveNotice, closeTimer, startButton, hostSeat, blockedDialog, startLockedReason,
    openHumans, rolesFor, expectRoles, findJokerBot, seatTable, seatHosted, jokerLeaves, voteOutJoker, killByNight, killByHuman, voteOutWithHumans,
    leaveGameUi, closeAdIfShown, allAtResult, pressReturn, pressLobby, leaveToLobby, botReturn, botToLobby, seatsOf, expectParty, expectRoomCodeShown,
    typeRoomCode, codeEntryAlert, createRoomOnPhone, createRoomAny, readyHumans, readyBots, startByHuman, startByBot, seatPhoneHosted, expectStartBlocked,
    readRoomSettings, closesAtOf, secondsLeft, sleepUntil, gateSocket,
};
