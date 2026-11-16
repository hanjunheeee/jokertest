'use strict';

// 끊김·나가기·탈주 브라우저 시험(간단 줄)이 같이 쓰는 작은 도우미 — 판 앉히기·봇 끊기/붙이기·확인 창과 알림 글 받기·방 만들기/입장 눌러 보기
// tests/**/a09-*.spec.js(목록 A09-E-001~120)만 씀 (이름이 .spec이 아니라 시험으로 안 셈, 공용 도우미는 안 고치고 불러만 씀)
const { expect } = require('@playwright/test');
const ui = require('../../helpers/ui');
const { sleep } = require('../../helpers/wait');
const night = require('./b-night/_night');
const L = require('./a-day/_lib');
const { openSetup, openRoomList, findRoomRow, waitResult } = require('../room/roomHelpers');

// 산 사람 나가기 확인 창에 꼭 있어야 하는 줄 (결정 "나가기 창": 패배·골드·탈주 제한)
const EXIT_ALIVE_LINES = Object.freeze([
    '지금 나가면 패배로 기록되고 골드를 못 받습니다.',
    '나간 뒤 한동안 다른 방에 들어갈 수 없습니다 (오늘 1번째 5분, 2번째 30분, 3번째부터 1일).',
]);
// 죽은 사람 창의 벌 없음 글 (확인 창·사망 창 같은 글)
const EXIT_DEAD_LINE = '사망한 뒤라 나가도 탈주가 아니며, 골드는 판이 끝나면 그대로 받습니다.';
const EXIT_RESULT_TEXT = '로비로 나가시겠습니까?';
// 60초 못 돌아와 빠진 사람에게 뜨는 까닭 글
const FORFEIT_TEXT = '연결이 끊겨 이 게임에서 제외되었습니다. 다시 참여할 수 없습니다.';
// 첫 탈주 직후 글: 5분에서 몇 초 지난 값 (나간 지 10초 안에 눌러 봄)
const COOLDOWN_JUST_NOW = /^탈주로 4분 5\d초 뒤에 참여할 수 있습니다\.$/;
// 첫 탈주 막힘 중 글: 5분 안 어느 때든 (목록 찾기처럼 몇 초 더 걸리는 길)
const COOLDOWN_FIRST = /^탈주로 4분 \d{1,2}초 뒤에 참여할 수 있습니다\.$/;
// 진짜 시간 허용 폭 ±1.5초 (시험_계획 3-5, 늘려서 덮지 않음)
const SLACK_MS = 1500;
const GRACE_MS = 60_000;

const U = (x) => x.account.uuid;
const rowOf = (s, uuid) => s?.players.find((p) => p.uuid === uuid) ?? null;
const roleOf = (s, uuid) => rowOf(s, uuid)?.role ?? null;
// 소켓이 붙어 있는 봇인지 (끊어 둔 봇은 표를 못 냄)
const isUp = (bot) => bot.socket?.connected === true;

/**
 * 판 앉히기: 사람 1 + 봇 n-1, 내 직업만 미리 정하고 봇 직업은 서버 판 요약에서 읽어 씀 (botsOf)
 * @param {{ n:number, role?:string, settings?:object, closeReveal?:boolean }} o n = 판 인원(5~10)
 * @returns {Promise<import('../../helpers/game').Table>}
 */
async function seat(table, user, { n, role = 'CITIZEN', settings = {}, closeReveal = true } = {}) {
    const t = await table.setup({ humans: [user], bots: n - 1, settings, roles: { [U(user)]: role } });
    const s = await t.state();
    expect(s.players.length, '판 인원').toBe(n);
    expect(roleOf(s, U(user)), '미리 정한 내 직업').toBe(role);
    if (closeReveal) await ui.readRoleReveal(user.page);
    return t;
}

/** 그 직업 봇들 (판 요약 기준) → E2eBot[] */
function botsOf(t, s, role) {
    return t.bots.filter((b) => roleOf(s, U(b)) === role);
}

/** 그 직업 봇 하나 (없으면 바로 던짐 — 구성이 생각과 다름) */
function botOf(t, s, role, index = 0) {
    const bot = botsOf(t, s, role)[index];
    if (!bot) throw new Error(`${role} 봇이 ${index + 1}명 안 됨 (구성 확인)`);
    return bot;
}

const toDay = (t, dayIndex = 1) => night.toDay(t, { dayIndex });
const toNight = (t, dayIndex = null) => night.toNight(t, { dayIndex });
/** 다음 낮 투표 단계까지 (손잡이, 이미 낮 투표면 그대로) → 판 요약 */
const toVote = (t) => t.advanceUntil((s) => s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE');

/** 떠 있는 연출 창 닫기 (단계 안내·밤 차례·역할 창·낮 시작 글 창), keepWatching이면 사망 창도 "관전 계속하기" */
async function clear(page, { keepWatching = false } = {}) {
    await ui.closeOverlays(page, { keepWatching, clickTimeoutMs: 1500 });
    await night.closeDawnReport(page);
}

/** 봇들 낮 표 (거절이면 던짐) */
async function botsVote(t, voters, targetUuid) {
    for (const bot of voters) {
        const r = await bot.request('cast_day_vote', { gameId: t.gameId, targetId: targetUuid });
        if (!r?.ok) throw new Error(`봇 낮 표 실패: ${r?.code ?? '답 없음'}`);
    }
}

/** 봇들 재판 표 */
async function botsJudge(t, voters, vote) {
    const s = await t.state();
    for (const bot of voters) {
        const r = await bot.request('cast_tribunal_vote', { gameId: t.gameId, dayIndex: s.dayIndex, vote });
        if (!r?.ok) throw new Error(`봇 재판 표 실패: ${r?.code ?? '답 없음'}`);
    }
}

/**
 * 붙어 있는 산 봇들이 그 사람을 찍고 투표 마감(손잡이) → 낮을 벗어난 판 요약과 찍은 봇들
 * 사람은 안 냄(기권) — 최다 득표가 기권보다 많아야 재판이라 모자라면 바로 던짐
 * 찍힌 사람이 그 순간 끊겨 있으면 표가 넉넉해도 재판 없이 밤 (낮 판정 값 DEFENDANT_DISCONNECTED) → 돌려준 단계는 부른 쪽이 봄
 */
async function voteOut(t, targetUuid) {
    const s = await toVote(t);
    const alive = s.players.filter((p) => p.alive && p.isParticipating !== false);
    const voters = t.bots.filter((b) => isUp(b) && U(b) !== targetUuid && rowOf(s, U(b))?.alive === true);
    if (voters.length <= alive.length - voters.length) {
        throw new Error(`봇 표 ${voters.length} ≤ 기권 ${alive.length - voters.length} → 재판 없이 밤으로 감 (인원 확인)`);
    }
    await botsVote(t, voters, targetUuid);
    await t.advance();
    const after = await L.waitState(t, (g) => g.phase !== 'DAY');
    return { state: after, voters };
}

/** 봇 표로 그 사람 처형 (재판 유죄) → 죽은 뒤 판 요약 */
async function execute(t, targetUuid) {
    const { state, voters } = await voteOut(t, targetUuid);
    if (state.phase !== 'TRIBUNAL') throw new Error(`재판이 안 열림: ${state.phase}`);
    await botsJudge(t, voters, 'GUILTY');
    await t.advance();
    return L.waitState(t, (g) => rowOf(g, targetUuid)?.alive === false, { message: '처형됨' });
}

/** 봇 소켓 끊기 (탭 닫은 것과 같음, 서버는 그때부터 60초 기다림) */
function dropBot(bot) {
    bot.socket.disconnect();
}

/** 끊은 봇 다시 붙이기 → 판 상태를 물어 기다림이 풀릴 때까지 */
async function returnBot(t, bot) {
    bot.socket.connect();
    await expect.poll(async () => Boolean(await bot.snapshot(t.gameId)), { timeout: 20_000, message: '봇 다시 붙음' }).toBe(true);
}

// 그 사람 말고 붙어 있는 봇 하나 (끊김·탈락 알림을 대신 받아 봄)
function watcherOf(t, uuid) {
    const bot = t.bots.find((b) => isUp(b) && U(b) !== uuid);
    if (!bot) throw new Error('알림을 받아 볼 봇이 없음');
    return bot;
}

// 붙어 있는 봇이 그 알림을 받은 때 (since 뒤 것만) → ms 시각
async function seenAt(t, uuid, event, match, since, timeoutMs) {
    const bot = watcherOf(t, uuid);
    await bot.waitForEvent(event, { since, match, timeoutMs });
    return bot.events.find((r) => r.event === event && r.at >= since && match(r.payload)).at;
}

/** 서버가 그 사람 끊김을 알린 때 (session_player_connection_changed) → ms 시각, 서버의 60초는 이때부터 셈 */
function droppedAt(t, uuid, since, { timeoutMs = 20_000 } = {}) {
    return seenAt(t, uuid, 'session_player_connection_changed', (p) => p?.uuid === uuid && p.isConnected === false, since, timeoutMs);
}

/** 서버가 그 사람 돌아옴을 알린 때 → ms 시각 */
function returnedAt(t, uuid, since, { timeoutMs = 20_000 } = {}) {
    return seenAt(t, uuid, 'session_player_connection_changed', (p) => p?.uuid === uuid && p.isConnected === true, since, timeoutMs);
}

/** 서버가 그 사람 탈락을 알린 때 (player_eliminated) → ms 시각 */
function eliminatedAt(t, uuid, since, { timeoutMs = 20_000 } = {}) {
    return seenAt(t, uuid, 'player_eliminated', (p) => p?.victimUuid === uuid, since, timeoutMs);
}

/** 끊김 60초를 손잡이로 바로 끝냄 → 그 사람이 탈락 명단에 들었는지까지 (60초 규칙 자체를 안 보는 케이스만) */
async function expire(t, uuid) {
    const r = await t.expireGraces();
    expect(r.fired, '손잡이가 60초를 끝낸 사람').toContain(uuid);
    return r;
}

/** 그 시각까지 진짜로 기다림 (진짜 시간 규칙 확인에만) */
async function sleepUntil(at) {
    const wait = at - Date.now();
    if (wait > 0) await sleep(wait);
}

/** PC: 남은 시간 자리를 시간 바로 고정 (다음에 화면을 읽을 때부터 — 판에 들어가기 전에 부름, 개발 서버 기본값은 채팅 틀) */
async function pinTimebar(page) {
    await page.evaluate(() => {
        try { window.localStorage.setItem('joker.ingame.timerPlacement', 'timebar'); } catch { /* 저장 막힘 */ }
    });
}

// PC 시간 바 (단계 글 "[낮-토론과 투표]"·남은 시간은 펼친 바에만 보임)
const timebar = (page) => page.locator('[aria-label$="일 시간 흐름"]');

/**
 * PC: 접힌 시간 바 펼치기 — 새로고침하면 다시 접힘
 * 재판 연출 중엔 시간 바가 저절로 펼쳐져 "접기" 단추만 있음 → 바로 돌아감
 * locked는 화면이 아직 재판 상태를 못 받아 "확대" 단추가 남은 틈에만 씀: 재판 창이 곧 판을 덮으니 눌림 사건만 보냄
 */
async function expandBar(page, { locked = false } = {}) {
    const bar = timebar(page);
    const open = bar.locator('button[aria-label="시간흐름바 확대"]');
    const close = bar.locator('button[aria-label="시간흐름바 접기"]');
    await expect(async () => {
        if ((await close.count()) > 0) return;
        if (locked) {
            await open.dispatchEvent('click', {}, { timeout: 1500 });
        } else {
            await clear(page);
            await open.click({ timeout: 1500 });
        }
        await expect(close).toHaveCount(1, { timeout: 1000 });
    }).toPass({ timeout: 20_000 });
}

/** PC: 펼친 시간 바의 남은 초 ("00:15" → 15) */
async function barSeconds(page) {
    const text = await timebar(page).locator('[role="timer"]').innerText();
    const m = /(\d+):(\d+)/.exec(text);
    if (!m) throw new Error(`남은 시간 글을 못 읽음: ${text}`);
    return Number(m[1]) * 60 + Number(m[2]);
}

// 판 화면 위 줄 "게임 나가기" 단추 (사망 창 안 같은 이름 단추와 구별)
const exitButton = (page) => page.locator('[aria-label="인게임 컨트롤"] button[aria-label="게임 나가기"]');
const deadChoice = (page) => page.getByRole('dialog', { name: '사망 후 선택' });
const leaveNotice = (page) => page.getByRole('dialog', { name: '게임 나가기 안내' });
const tribunalWindow = (page) => page.locator('[data-ingame-tribunal-presentation]');
// 카드 (PC 판·모바일 띠 같은 표시): data-ingame-player-status = alive·dead·disconnected
const cardOf = (page, nickname) => page.locator(`[data-ingame-player-nickname="${nickname}"]`).first();
// 카드 위 상태 그림 (연결 끊김·사망 배지)
const badgeOf = (page, nickname) => cardOf(page, nickname).locator('img[src*="ingame-status"]');

/**
 * 동작이 띄운 확인 창(window.confirm) 글 받기 — accept면 확인, 아니면 취소 (그 사이 뜬 알림 창은 닫기만)
 * PC·모바일 둘 다 브라우저 확인 창이라 글만 봄
 * @returns {Promise<string>} 확인 창 글
 */
async function withConfirm(page, action, { accept }) {
    let message = null;
    const onDialog = (dialog) => {
        if (dialog.type() !== 'confirm') { dialog.accept().catch(() => {}); return; }
        message = dialog.message();
        (accept ? dialog.accept() : dialog.dismiss()).catch(() => {});
    };
    page.on('dialog', onDialog);
    try {
        await action();
        await expect.poll(() => message, { timeout: 10_000, message: '확인 창이 뜸' }).not.toBeNull();
    } finally {
        page.off('dialog', onDialog);
    }
    return message;
}

/** 위 줄 "게임 나가기" 누르고 확인 창 글 받기 (연출 창이 판을 막으면 닫으면서) */
function pressExit(page, { accept }) {
    return withConfirm(page, async () => {
        await expect(async () => {
            await clear(page);
            await exitButton(page).click({ timeout: 1500 });
        }).toPass({ timeout: 25_000 });
    }, { accept });
}

/** 산 채로 나가기: 확인 → 방 목록 화면까지 */
async function leaveAlive(page) {
    const message = await pressExit(page, { accept: true });
    await expect(page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    return message;
}

// 처형 뒤 추방 연출 (판 화면을 덮음)
const expulsionOf = (page) => page.locator('[data-ingame-tribunal-expulsion]');

/** 연출 창 닫기 + 추방 연출 넘기기 (추방 연출은 글 단계에서 누르면 바로 끝남) */
async function calm(page) {
    await clear(page);
    const expulsion = expulsionOf(page).last();
    if (await expulsion.isVisible().catch(() => false)) await expulsion.click({ timeout: 500, force: true }).catch(() => {});
}

/** 처형 뒤 추방 연출이 끝날 때까지 (판 끝 결과 화면은 이 연출이 끝나야 넘어감) */
async function pastExpulsion(page) {
    await expect(async () => {
        await calm(page);
        await expect(expulsionOf(page)).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 30_000 });
}

/** 사망 창이 뜰 때까지 (추방 연출·단계 안내를 닫으면서) → 창 */
async function waitDeadChoice(page) {
    const dialog = deadChoice(page);
    await expect(async () => {
        await calm(page);
        await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 40_000 });
    return dialog;
}

/** 사망 창의 "게임 나가기" 누르고 확인 창 글 받기 */
async function pressDeadExit(page, { accept }) {
    const dialog = await waitDeadChoice(page);
    return withConfirm(page, () => dialog.getByRole('button', { name: '게임 나가기' }).click(), { accept });
}

/** 방 만들기 화면에서 "게임 만들기" → 대기방까지 (탈주 글이 뜨면 주소가 안 바뀌어 실패) */
async function createRoomOk(page) {
    await openSetup(page);
    await page.getByRole('button', { name: '게임 만들기' }).click();
    await expect(page).toHaveURL(/\/game-matching/, { timeout: 15_000 });
}

/** 방 만들기 화면에서 "게임 만들기" → 뜬 알림 글 (close:false면 모바일 안내 창을 안 닫음) */
async function createRoomAlert(page, o = {}) {
    await openSetup(page);
    return ui.captureAlert(page, () => page.getByRole('button', { name: '게임 만들기' }).click(), o);
}

/** 코드 입력 화면에서 코드 넣고 "참여하기" → 뜬 알림 글 */
async function joinByCodeAlert(page, roomCode, o = {}) {
    await page.goto('/roomInvite');
    await page.getByRole('textbox', { name: /방 코드/ }).first().click();
    await page.keyboard.type(roomCode);
    return ui.captureAlert(page, () => page.getByRole('button', { name: '참여하기' }).click(), o);
}

/** 공개 방 목록에서 그 방 줄 고르기 (쪽을 넘기며 찾음) → 줄 */
async function pickPublicRoom(page, title) {
    await openRoomList(page);
    const row = await findRoomRow(page, title, { timeoutMs: 30_000 });
    expect(row, `공개 방 목록에 "${title}" 줄`).not.toBeNull();
    await row.click();
    return row;
}
const enterPicked = (page) => page.getByRole('button', { name: '선택한 방 입장' });
// 모바일 안내 창(브라우저 알림 창 대신 뜨는 양피지 창)의 글과 닫기
const noticeText = (page) => page.getByRole('alertdialog', { name: '안내' }).last().getByRole('paragraph').first();
const closeNotice = (page) => page.getByRole('alertdialog', { name: '안내' }).last().getByRole('button', { name: '확인' }).click();

/**
 * 봇 표로 광대 봇을 처형해 시민 승으로 판 끝 → 결과 화면까지 (사람은 안 냄)
 * @returns {Promise<{ joker:any, list:any }>} 처형된 광대 봇, 결과 명단 칸
 */
async function toCitizenWin(t, page) {
    const s = await t.state();
    const jokers = botsOf(t, s, 'JOKER').filter((b) => rowOf(s, U(b))?.alive === true);
    if (jokers.length !== 1) throw new Error(`산 광대 봇이 1명이 아님 (${jokers.length}명) — 광대 1명 판에서만 씀`);
    const [joker] = jokers;
    // 봇 표를 하나씩 직접 보냄 (뒤에서 도는 봇 계획을 안 써서 끊어 둔 봇이 있어도 안 엉킴)
    const end = await execute(t, U(joker));
    if (end.phase !== 'ENDED') throw new Error(`광대를 처형했는데 판이 안 끝남: ${end.phase}`);
    await pastExpulsion(page);
    const list = await waitResult(page);
    // 폰 결과 화면은 결과판 1.5초 뒤 전면 광고 창이 덮음 → 닫아 둠 (뒤에서 결과 화면 단추를 누르거나 읽기 확인을 하므로)
    if ((page.viewportSize()?.width ?? 1280) < 600) await ui.closeResultAd(page);
    return { joker, list };
}

module.exports = {
    EXIT_ALIVE_LINES, EXIT_DEAD_LINE, EXIT_RESULT_TEXT, FORFEIT_TEXT, COOLDOWN_JUST_NOW, COOLDOWN_FIRST, SLACK_MS, GRACE_MS,
    U, rowOf, roleOf, isUp, seat, botsOf, botOf, toDay, toNight, toVote, clear, botsVote, botsJudge, voteOut, execute,
    dropBot, returnBot, droppedAt, returnedAt, eliminatedAt, expire, sleepUntil, pinTimebar, timebar, expandBar, barSeconds,
    exitButton, deadChoice, leaveNotice, tribunalWindow, cardOf, badgeOf, withConfirm, pressExit, leaveAlive, calm, pastExpulsion, waitDeadChoice, pressDeadExit,
    createRoomOk, createRoomAlert, joinByCodeAlert, pickPublicRoom, enterPicked, noticeText, closeNotice, toCitizenWin,
};
