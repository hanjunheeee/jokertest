'use strict';

// 밤·직업·승패 시험(인게임 B) 공용 도구 파일, 역할 정하기·밤 차례까지 넘기기·밤 행동 화면 누르기·카드 상태·결과 화면 읽기
// b-night 폴더 시험들만 씀 (helpers/는 안 고침)
const { expect } = require('@playwright/test');

const ACTION_LABELS = Object.freeze({ JOKER: '암살', DOCTOR: '보호', GUARD: '조사', WITCH_HUNTER: '확인' });
const TURN_MESSAGES = Object.freeze({
    JOKER: '광대의 시간입니다',
    DOCTOR: '의사의 시간입니다',
    GUARD: '경비원의 시간입니다',
    WITCH_HUNTER: '마녀사냥꾼의 시간입니다',
});
const TURN_TAGS = Object.freeze({ JOKER: '[밤-광대]', DOCTOR: '[밤-의사]', GUARD: '[밤-경비원]', WITCH_HUNTER: '[밤-마녀사냥꾼]' });
const ROLE_NAMES = Object.freeze({ JOKER: '광대', CITIZEN: '시민', DOCTOR: '의사', GUARD: '경비원', WITCH_HUNTER: '마녀사냥꾼' });

/** 받침 따라 조사 붙이기: josa('경비원', '이', '가') → '경비원이' */
function josa(word, withFinal, withoutFinal) {
    const code = word.charCodeAt(word.length - 1) - 0xac00;
    const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
    return word + (hasFinal ? withFinal : withoutFinal);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 직접 구성 방 설정: custom({ JOKER: 1, DOCTOR: 1 }) → 광대 수 맞춘 settings
 * @param {{JOKER?:number,DOCTOR?:number,GUARD?:number,WITCH_HUNTER?:number}} counts
 */
function custom(counts, extra = {}) {
    const roleCounts = { JOKER: 1, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...counts };
    return { jokerCount: roleCounts.JOKER, roleCompositionMode: 'custom', roleCounts, ...extra };
}

/**
 * 역할 고정 함수: 사람들 역할 + 봇 순서대로 역할 (null이면 안 정함)
 * @param {string[]} humanRoles 사람 순서대로
 * @param {(string|null)[]} botRoles 봇 순서대로
 */
function roles(humanRoles, botRoles = []) {
    return ({ humans, bots }) => {
        const out = {};
        humanRoles.forEach((role, i) => { if (role && humans[i]) out[humans[i].account.uuid] = role; });
        botRoles.forEach((role, i) => { if (role && bots[i]) out[bots[i].account.uuid] = role; });
        return out;
    };
}

// 단계를 넘기기 전에 봇이 낼 틈 (투표·재판·밤 차례는 봇이 400ms마다 스냅샷을 보고 내서, 바로 넘기면 못 낸 채 마감됨)
function settleMsFor(s) {
    if (s.phase === 'TRIBUNAL') return 1300;
    if (s.phase === 'DAY' && s.dayPhase === 'DAY_VOTE') return 1300;
    if (s.phase === 'NIGHT' && s.nightTurnRole) return 1100;
    return 250;
}

/**
 * 조건 될 때까지 단계 넘기기 (봇 행동 틈을 단계마다 줌), t.advanceUntil 대신 씀
 * @param {*} t 판
 * @param {(s:any)=>boolean} match
 */
async function advanceUntilSettled(t, match, { stepDelayMs = 400, maxSteps = 60, allowEnd = false } = {}) {
    for (let i = 0; i < maxSteps; i += 1) {
        const s = await t.state();
        if (!s) return null;
        if (match(s)) return s;
        if (s.phase === 'ENDED') {
            if (allowEnd) return s;
            throw new Error(`판이 먼저 끝남 (winner=${s.winResult?.winner})`);
        }
        await sleep(settleMsFor(s));
        const again = await t.state();
        if (!again) return null;
        if (match(again)) return again;
        // 틈 사이에 단계가 바뀌었으면 다시 봄 (바뀐 단계 마감을 바로 돌리지 않게)
        if (again.phase !== s.phase || again.dayIndex !== s.dayIndex || again.dayPhase !== s.dayPhase || again.nightTurnRole !== s.nightTurnRole) continue;
        await t.advance();
        await sleep(stepDelayMs);
    }
    throw new Error('단계 못 맞춤');
}

/** 사람 하나를 새 계정·새 브라우저 창으로 바꿔 끼움 (시험 코드가 같은 객체를 계속 쓰게 속만 바꿈) */
async function renewHuman(h) {
    const ui = require('../../../helpers/ui');
    const accounts = require('../../../helpers/accounts');
    const { DESKTOP } = require('../../../helpers/fixtures');
    const browser = h.page.context().browser();
    const old = h.page.context();
    const context = await browser.newContext(DESKTOP);
    const account = await accounts.createAccount();
    const page = await context.newPage();
    await ui.loginViaApi(context, account);
    await ui.gotoLobby(page);
    h.account = account;
    h.page = page;
    h.context = context;
    // 옛 창은 닫음 (옛 판은 남은 봇과 함께 시험 끝에 정리됨)
    await old.close().catch(() => {});
}

/**
 * 판 차리기 + 역할 맞추기: table.setup 뒤 서버 역할을 읽어 사람 역할이 바라는 대로인지 확인하고,
 * 봇 배열(t.bots)을 역할 바람(botRoles) 순서에 맞게 다시 줄 세움
 * (시험 손잡이의 역할 미리 정하기는 서로 바꿔 끼우는 방식이라 여럿 정하면 가끔 봇 몇이 못 맞음 → 봇은 순서를 바꿔 맞춤, 자리 순서는 그대로)
 * @param {*} table fixtures의 table
 * @param {{humans:any[], bots:number, settings?:object, humanRoles?:string[], botRoles?:(string|null)[]}} o
 */
async function setup(table, { humans, bots, settings = {}, humanRoles = [], botRoles = [] }) {
    let t = null;
    let s = null;
    for (let attempt = 1; ; attempt += 1) {
        t = await table.setup({ humans, bots, settings, roles: roles(humanRoles, botRoles) });
        s = await t.state();
        const wrong = humanRoles.some((role, i) => role && s.players.find((p) => p.uuid === humans[i].account.uuid)?.role !== role);
        if (!wrong) break;
        // 미리 정한 역할은 서버 전체가 같이 쓰는 표라 다른 시험의 지우기와 겹치면 사라짐 → 사람을 새 계정·새 창으로 바꿔 새 판 (3번까지)
        if (attempt >= 3) throw new Error('사람 역할을 3번 다 못 맞춤');
        console.warn(`[e2e] 사람 역할 못 맞춤 → 새 사람으로 다시 (${attempt})`);
        await t.stopBots().catch(() => {});
        for (const h of humans) await renewHuman(h);
    }
    const roleOf = (uuid) => s.players.find((p) => p.uuid === uuid)?.role;
    const pool = [...t.bots];
    const ordered = new Array(t.bots.length).fill(null);
    // 원래 자리 봇이 이미 맞으면 그대로 둠
    botRoles.forEach((role, i) => {
        if (role && roleOf(t.bots[i].account.uuid) === role) {
            ordered[i] = t.bots[i];
            pool.splice(pool.indexOf(t.bots[i]), 1);
        }
    });
    // 못 맞은 자리는 남은 봇 중 그 역할 (자리 순서 앞부터)
    botRoles.forEach((role, i) => {
        if (!role || ordered[i]) return;
        const k = pool.findIndex((b) => roleOf(b.account.uuid) === role);
        if (k < 0) throw new Error(`봇 ${i} 역할 ${role} 자리가 모자람 (구성 확인)`);
        ordered[i] = pool.splice(k, 1)[0];
    });
    for (let i = 0; i < ordered.length; i += 1) if (ordered[i] === null) ordered[i] = pool.shift();
    if (ordered.some((b, i) => b !== t.bots[i])) console.warn('[e2e] 봇 역할 순서 다시 맞춤');
    t.bots = ordered;
    return t;
}

/** 밤 그 역할 차례까지 넘기기 (dayIndex 주면 그 밤) */
function toTurn(t, role, { dayIndex = null, stepDelayMs = 400, maxSteps = 60 } = {}) {
    return advanceUntilSettled(
        t,
        (s) => s.phase === 'NIGHT' && s.nightTurnRole === role && (dayIndex === null || s.dayIndex === dayIndex),
        { stepDelayMs, maxSteps },
    );
}

/** 밤 들어갈 때까지 (dayIndex 주면 그 밤) */
function toNight(t, { dayIndex = null, stepDelayMs = 400 } = {}) {
    return advanceUntilSettled(t, (s) => s.phase === 'NIGHT' && (dayIndex === null || s.dayIndex === dayIndex), { stepDelayMs });
}

/** 낮 들어갈 때까지 (dayIndex 주면 그 낮) */
function toDay(t, { dayIndex = null, stepDelayMs = 400 } = {}) {
    return advanceUntilSettled(t, (s) => s.phase === 'DAY' && (dayIndex === null || s.dayIndex === dayIndex), { stepDelayMs });
}

/** 판 끝날 때까지 → 끝난 판 요약 */
function toEnd(t, { stepDelayMs = 400, maxSteps = 90 } = {}) {
    return advanceUntilSettled(t, (s) => s.phase === 'ENDED', { stepDelayMs, maxSteps, allowEnd: true });
}

/** 봇이 받은 밤 차례 시작 순서 (그 밤만) */
function turnOrder(bot, dayIndex) {
    return bot.events
        .filter((r) => r.event === 'night_turn_started' && r.payload?.dayIndex === dayIndex)
        .map((r) => r.payload.role);
}

/** 봇이 받은 사건 payload 목록 */
function eventsOf(bot, event) {
    return bot.events.filter((r) => r.event === event).map((r) => r.payload);
}

/** 카드 누름 칸 (닉네임으로) */
function cardButton(page, nickname) {
    return page.locator('[role="button"][aria-haspopup="menu"]').filter({ has: page.locator(`[data-ingame-player-nickname="${nickname}"]`) });
}

/** 카드 상태 칸 (data-ingame-player-status: alive·dead·disconnected) */
function cardStatus(page, nickname) {
    return page.locator(`[data-ingame-player-nickname="${nickname}"]`);
}

/** 카드가 그 상태가 될 때까지 */
async function expectCard(page, nickname, status, timeout = 15000) {
    await expect(cardStatus(page, nickname)).toHaveAttribute('data-ingame-player-status', status, { timeout });
}

/** 떠 있는 안내 창 확인 눌러 닫기, 닫은 수 돌려줌 */
async function closeNotices(page, { names = ['단계 전환 안내', '밤 역할 안내'] } = {}) {
    let closed = 0;
    for (const name of names) {
        const dialog = page.getByRole('dialog', { name });
        if (await dialog.isVisible().catch(() => false)) {
            await dialog.getByRole('button', { name: '확인' }).click({ timeout: 2000 }).catch(() => {});
            closed += 1;
        }
    }
    return closed;
}

/** 밤 성공 연출 끝 '최종 결과' 창 뜨면 확인 (광대·대상이 보는 창, 이름이 '밤 조사 결과'와 같아 따로 찾음) */
async function closeFinalStatus(page) {
    const final = page.locator('[data-ingame-night-success-final]');
    // 감싼 div는 크기가 없어 isVisible이 늘 거짓 → 개수로 봄
    if ((await final.count()) > 0) await final.getByRole('button', { name: '확인' }).click({ timeout: 2000 }).catch(() => {});
}

/** 역할 공개 창 닫기 (떠 있으면) */
async function closeRoleReveal(page) {
    const dialog = page.getByRole('dialog', { name: '내 역할 보기' });
    if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: '확인' }).click().catch(() => {});
}

/** '사망 후 선택' 창 뜨면 관전 계속하기 */
async function keepWatching(page) {
    const dialog = page.getByRole('dialog', { name: '사망 후 선택' });
    if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: '관전 계속하기' }).click().catch(() => {});
}

/** 카드 눌러 메뉴 열기 → 메뉴 locator (안내 창이 막고 있으면 닫으면서 다시) */
async function openCardMenu(page, nickname, { timeout = 25000 } = {}) {
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    await expect(async () => {
        await closeRoleReveal(page);
        await closeNotices(page);
        await closeFinalStatus(page);
        await keepWatching(page);
        if (!(await menu.isVisible().catch(() => false))) {
            await cardButton(page, nickname).click({ timeout: 1500 });
        }
        await expect(menu).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout });
    return menu;
}

/**
 * 카드를 눌러도 메뉴가 안 열리는지 (안내 창 닫고 눌러 본 뒤 잠깐 봄)
 */
async function expectNoCardMenu(page, nickname) {
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    await expect(async () => {
        await closeRoleReveal(page);
        await closeNotices(page);
        await closeFinalStatus(page);
        await keepWatching(page);
        await cardButton(page, nickname).click({ timeout: 1500 });
    }).toPass({ timeout: 25000 });
    await sleep(600);
    if (await menu.isVisible().catch(() => false)) {
        const items = await menu.getByRole('menuitem').allInnerTexts().catch(() => []);
        throw new Error(`메뉴가 열림: [${items.join(', ')}]`);
    }
}

/**
 * 밤 행동 화면으로 내기: 카드 누름 → 메뉴의 '암살'·'보호'·'조사'·'확인'
 */
async function nightActUi(page, nickname, label) {
    const menu = await openCardMenu(page, nickname);
    const item = menu.getByRole('menuitem', { name: label, exact: true });
    await expect(item).toBeEnabled();
    await item.click();
    await expect(menu).toBeHidden();
}

/** 밤 건너뛰기 버튼 */
function skipButton(page) {
    return page.locator('[data-ingame-phase-action="nightSkip"]');
}

/** 밤 건너뛰기 버튼 누르기 (안내 창 닫으면서) */
async function nightSkipUi(page) {
    const skip = skipButton(page);
    await expect(async () => {
        await closeNotices(page);
        await expect(skip).toBeEnabled({ timeout: 1000 });
        await skip.click({ timeout: 1000 });
    }).toPass({ timeout: 25000 });
}

/**
 * 화면 기록 걸기: 밤 역할 안내 창이 뜰 때마다 역할을 적음, autoConfirm이면 '단계 전환 안내'는 바로 확인 누름
 * (판 화면에 들어온 뒤 부름, SPA라 결과 화면까지 기록이 남음)
 */
async function recordUi(page, { autoConfirm = true } = {}) {
    await page.evaluate((auto) => {
        if (window.__nightRec) return;
        const rec = { turns: [], privateResults: [], finals: [], kills: 0, waits: 0, entrances: [], videos: [] };
        window.__nightRec = rec;
        let lastTurnEl = null;
        let lastPrivate = null;
        let lastFinal = null;
        let lastKill = null;
        let lastWait = null;
        let lastEntrance = null;
        const scan = () => {
            const turnEl = document.querySelector('[data-night-turn-role]');
            if (turnEl && turnEl !== lastTurnEl) rec.turns.push(turnEl.getAttribute('data-night-turn-role'));
            lastTurnEl = turnEl;
            const priv = document.querySelector('[data-ingame-night-private-result]');
            if (priv && priv !== lastPrivate) rec.privateResults.push(priv.innerText.replace(/\s+/g, ' ').trim());
            lastPrivate = priv;
            const fin = document.querySelector('[data-ingame-night-success-final]');
            if (fin && fin !== lastFinal) rec.finals.push(fin.getAttribute('data-ingame-night-success-final'));
            lastFinal = fin;
            const kill = document.querySelector('[data-ingame-night-success-kill]');
            if (kill && kill !== lastKill) rec.kills += 1;
            lastKill = kill;
            // 연출 영상 주소 (같은 창이 영상만 바꿔 이어 틀어서 주소가 바뀔 때마다 적음)
            const video = document.querySelector('[data-ingame-night-success-source-video]');
            const src = video ? (video.getAttribute('src') || '').split('/').pop() : null;
            if (src && src !== rec.videos[rec.videos.length - 1]) rec.videos.push(src);
            const wait = document.querySelector('[data-ingame-night-presentation-wait]');
            if (wait && wait !== lastWait) rec.waits += 1;
            lastWait = wait;
            const ent = document.querySelector('[data-ingame-phase-entrance]');
            if (ent && ent !== lastEntrance) rec.entrances.push(ent.getAttribute('data-ingame-phase-entrance'));
            lastEntrance = ent;
            if (auto && ent) {
                const btn = [...ent.querySelectorAll('button')].find((b) => b.innerText.trim() === '확인');
                if (btn) setTimeout(() => btn.click(), 50);
            }
        };
        new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, attributes: true });
        scan();
    }, autoConfirm);
}

/** 화면 기록 읽기 */
function readUi(page) {
    return page.evaluate(() => window.__nightRec ?? null);
}

/** 서버 기준 그 사람이 죽었는지까지 */
async function waitDead(t, uuid) {
    await expect.poll(async () => (await t.player(uuid))?.alive, { timeout: 15000 }).toBe(false);
}

/** 판 요약에서 사람 줄 */
const rowOf = (s, uuid) => s.players.find((p) => p.uuid === uuid);
const aliveCount = (s) => s.players.filter((p) => p.alive).length;

/** 결과 화면까지: /gameresult → 연출 영상 건너뛰기(뜨면) → 승패 띠 */
async function reachResult(page, { timeout = 60000 } = {}) {
    await expect(page).toHaveURL(/\/gameresult/, { timeout });
    const skip = page.getByRole('button', { name: '건너뛰기' });
    const banner = page.getByText(/^(승리|패배)$/);
    await expect(async () => {
        if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
        await expect(banner).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 45000 });
}

/** 결과 화면 MVP 칸 */
function mvpPanel(page) {
    return page.getByRole('complementary', { name: 'MVP 플레이어' });
}

/** 봇 하나로 밤 행동 직접 보내기 → 서버 답 { ok, code } */
function botNight(t, bot, targetId) {
    return bot.request('submit_night_action', { gameId: t.gameId, targetId });
}

/** 판 끝까지 단계 넘기기 → 마지막 요약 */
async function advanceToEnd(t, { stepDelayMs = 450, maxSteps = 80 } = {}) {
    for (let i = 0; i < maxSteps; i += 1) {
        const s = await t.state();
        if (!s) return null;
        if (s.phase === 'ENDED') return s;
        await t.advance();
        await sleep(stepDelayMs);
    }
    throw new Error('판이 안 끝남');
}

/** 봇 스냅샷의 공개 승패 (끝난 판, mvp·reveals 포함) */
async function publicWinResult(t, botIndex = 0) {
    const snap = await t.bots[botIndex].snapshot(t.gameId);
    return snap?.winResult ?? null;
}

module.exports = {
    ACTION_LABELS, TURN_MESSAGES, TURN_TAGS, ROLE_NAMES, josa, sleep, custom, roles, setup, advanceUntilSettled, toTurn, toNight, toDay, toEnd, turnOrder, eventsOf,
    cardButton, cardStatus, expectCard, closeNotices, closeFinalStatus, closeRoleReveal, keepWatching, openCardMenu, expectNoCardMenu,
    nightActUi, skipButton, nightSkipUi, recordUi, readUi, waitDead, rowOf, aliveCount, reachResult, mvpPanel, botNight,
    advanceToEnd, publicWinResult,
};
