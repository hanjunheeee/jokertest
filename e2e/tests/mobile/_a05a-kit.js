'use strict';

// A05a 밤 시험(차례·능력·밤 결과) 도구 모음 파일, 직업 맞춘 판 차리기·봇 처형·밤 차례 돌리기·카드 메뉴 누르기·결과 창과 사망 카드 확인 (폰·PC 화면 둘 다)
// mobile/a05-*.spec.js와 ingame/a05-*-hard.spec.js가 씀 (이름이 .spec이 아니라 시험으로 안 돎)
const { expect } = require('@playwright/test');
const ui = require('../../helpers/ui');
const { expectReadable } = require('../../helpers/visible');
const night = require('../ingame/b-night/_night');
const { openRoster, closeRoster, rosterRowOf, expectPlayerStatus, talk } = require('./_talk');

const { ACTION_LABELS, TURN_MESSAGES, ROLE_NAMES } = night;
// 밤 차례가 도는 순서 (서버와 같음)
const TURN_ROLES = Object.freeze(['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']);
// 암살 실패 글 (화면 문구)
const ASSASSIN_FAILED_TEXT = '이번 밤의 암살이 실패했습니다.';
// 판 화면이 폰 배치인지 (폰 375, PC 1280)
const isPhone = (page) => (page.viewportSize()?.width ?? 1280) < 600;
const uuidOf = (x) => x.account.uuid;
const nickOf = (x) => x.nickname ?? x.account.nickname;

/**
 * 판 차리기: 사람·봇 직업을 정해 시작 → 서버가 준 직업 확인 → 사람 화면 역할 창 닫고 화면 기록 걺
 * 밤 차례 시간은 기본 120초 (화면을 누르는 동안 차례가 저절로 안 닫히게, 진짜 시간 시험만 30초로 줌)
 * @param {*} table fixtures의 table
 * @param {object} o
 * @param {any[]} o.humans 브라우저 사람들
 * @param {number} o.bots 봇 수
 * @param {string[]} o.humanRoles 사람 순서대로 직업
 * @param {(string|null)[]} [o.botRoles] 봇에게 줄 직업 (모자라면 던짐)
 * @param {object} [o.settings] 방 설정 (night.custom(...)·{ jokerCount: 2 } 등)
 * @param {boolean} [o.autoConfirm=true] "낮이·밤이 되었습니다" 창과 낮 시작 글 창을 화면 기록이 바로 확인할지
 * @returns {Promise<{ t:any, humans:any[], bots:Record<string, any[]>, nick:(uuid:string)=>string }>} bots는 직업별 봇 목록
 */
async function seat(table, { humans, bots, humanRoles, botRoles = [], settings = {}, autoConfirm = true }) {
    const t = await table.setup({ humans, bots, settings: { nightActionTime: 120, ...settings }, roles: night.roles(humanRoles, botRoles) });
    const s = await t.state();
    const roleOf = (uuid) => s.players.find((p) => p.uuid === uuid)?.role;
    humans.forEach((h, i) => {
        if (roleOf(uuidOf(h)) !== humanRoles[i]) throw new Error(`사람 ${i + 1} 직업이 ${humanRoles[i]}가 아님 (받은 것: ${roleOf(uuidOf(h))})`);
    });
    // 봇은 자리 순서 말고 서버가 준 직업으로 묶음 → { JOKER: [봇], CITIZEN: [봇, 봇] }
    const byRole = { JOKER: [], DOCTOR: [], GUARD: [], WITCH_HUNTER: [], CITIZEN: [] };
    for (const bot of t.bots) byRole[roleOf(uuidOf(bot))].push(bot);
    for (const role of TURN_ROLES) {
        const wanted = botRoles.filter((r) => r === role).length;
        if (byRole[role].length < wanted) throw new Error(`${role} 봇이 ${wanted}명이어야 하는데 ${byRole[role].length}명`);
    }
    await Promise.all(humans.map((h) => ui.readRoleReveal(h.page)));
    for (const h of humans) await night.recordUi(h.page, { autoConfirm, autoConfirmDawn: autoConfirm });
    return { t, humans, bots: byRole, nick: (uuid) => s.players.find((p) => p.uuid === uuid)?.nickname };
}

/** 판 요약이 조건에 맞을 때까지 기다림 (단계를 넘기지 않음) → 마지막 판 요약 */
async function waitState(t, match, message = '판 상태 기다림', timeout = 20000) {
    let last = null;
    await expect.poll(async () => { last = await t.state(); return Boolean(last && match(last)); }, { timeout, message }).toBe(true);
    return last;
}

/**
 * 봇 표만으로 한 사람 처형 (낮 투표 → 재판 유죄), 사람은 아무것도 안 냄 → 끝나면 그날 밤
 * 봇 표는 요청을 하나씩 보내고 답을 받은 뒤 단계를 넘김 (봇이 못 낸 채 마감되지 않게)
 */
async function executeByBots(t, victimUuid) {
    await t.assertBotsCanExecute(victimUuid);
    const s = await t.advanceUntil((g) => g.phase === 'DAY' && g.dayPhase === 'DAY_VOTE');
    const alive = new Set(s.players.filter((p) => p.alive).map((p) => p.uuid));
    const voters = t.bots.filter((b) => alive.has(uuidOf(b)) && uuidOf(b) !== victimUuid);
    for (const bot of voters) {
        const r = await bot.request('cast_day_vote', { gameId: t.gameId, targetId: victimUuid });
        if (!r?.ok) throw new Error(`봇 낮 표 거절: ${r?.code}`);
    }
    await t.advance();
    await waitState(t, (g) => g.phase === 'TRIBUNAL' && g.tribunal?.defendantUuid === victimUuid, '재판 열림');
    for (const bot of voters) {
        const r = await bot.request('cast_tribunal_vote', { gameId: t.gameId, dayIndex: s.dayIndex, vote: 'GUILTY' });
        if (!r?.ok) throw new Error(`봇 재판 표 거절: ${r?.code}`);
    }
    await t.advance();
    return waitState(t, (g) => g.players.find((p) => p.uuid === victimUuid)?.alive === false, '처형됨');
}

/** 그 날 밤까지 단계 넘기기 (낮엔 아무도 표를 안 내 재판 없이 밤, 지나가는 밤 차례는 아무도 안 고름) */
function toNight(t, dayIndex) {
    return t.advanceUntil((s) => s.phase === 'NIGHT' && s.dayIndex === dayIndex, { stepDelayMs: 400 });
}

/** 지금 밤의 그 직업 차례까지 앞 차례를 넘김 (앞 차례는 아무도 안 고른 채 닫힘) */
async function stepToTurn(t, role) {
    for (let i = 0; i < 6; i += 1) {
        const s = await waitState(t, (g) => g.phase !== 'NIGHT' || Boolean(g.nightTurnRole), '밤 차례 열림');
        if (s.phase !== 'NIGHT') throw new Error(`${role} 차례가 안 열리고 밤이 끝남`);
        if (s.nightTurnRole === role) return s;
        await t.advance();
        await waitState(t, (g) => g.phase !== 'NIGHT' || g.nightTurnRole !== s.nightTurnRole, '차례 닫힘');
    }
    throw new Error(`${role} 차례 못 맞춤`);
}

/**
 * 그 차례 산 사람이 다 냈다는 서버 알림(마감 당김)을 봇이 받았는지 → 화면·요청으로 낸 것이 정말 받아졌다는 뜻
 * (화면의 건너뛰기 단추는 보내는 중에도 꺼져서, 거절된 것을 낸 것으로 잘못 보지 않게 서버 알림으로 한 번 더 봄)
 */
async function expectTurnFilled(t, role, dayIndex) {
    await t.bots[0].waitForEvent('phase_settle_started', {
        match: (p) => p?.phase === 'NIGHT' && p.role === role && p.dayIndex === dayIndex,
        timeoutMs: 10000,
    });
}

/** playNight 계획에서 "보기만 하는 차례" 표시: 그 직업 산 사람이 다 내지 않는 차례 (다 냈는지 확인을 건너뜀) */
const watch = (fn) => Object.assign((s) => fn(s), { watchOnly: true });

/**
 * 밤 한 번 돌리기: 차례가 열릴 때마다 plan[직업]()을 부르고(봇은 요청, 사람은 화면) 끝나면 그 차례를 손잡이로 닫음
 * plan[직업]은 그 직업 산 사람이 전부 내는 것으로 봄 → 다 냈다는 서버 알림까지 확인 (일부만 내거나 보기만 하면 watch(fn)로 감쌈)
 * plan에 없는 직업 차례는 아무도 안 낸 채 닫힘 (건너뜀으로 셈), "다 고르면 5초" 규칙을 보는 시험엔 안 씀
 * @param {*} t 판
 * @param {Partial<Record<'JOKER'|'DOCTOR'|'GUARD'|'WITCH_HUNTER', (s:any)=>Promise<void>>>} [plan]
 * @returns {Promise<{ turns:string[], after:any }>} 열린 차례 순서, 밤이 끝난 뒤 판 요약
 */
async function playNight(t, plan = {}) {
    const turns = [];
    const first = await waitState(t, (s) => s.phase === 'NIGHT', '밤 시작');
    const inNight = (s) => s.phase === 'NIGHT' && s.dayIndex === first.dayIndex;
    for (let i = 0; i < 8; i += 1) {
        const s = await waitState(t, (g) => !inNight(g) || Boolean(g.nightTurnRole), '밤 차례 열림');
        if (!inNight(s)) return { turns, after: s };
        const role = s.nightTurnRole;
        turns.push(role);
        const step = plan[role];
        if (step) {
            await step(s);
            if (!step.watchOnly) await expectTurnFilled(t, role, s.dayIndex);
        }
        // 다 골라 5초 뒤 저절로 닫혔으면 손잡이를 안 부름 (다음 차례를 잘못 닫지 않게)
        const now = await t.state();
        if (now && inNight(now) && now.nightTurnRole === role) await t.advance();
        await waitState(t, (g) => !inNight(g) || g.nightTurnRole !== role, `${role} 차례 닫힘`);
    }
    throw new Error('밤이 안 끝남');
}

/** 봇 밤 행동 보내기 (targetId null = 건너뛰기), 서버가 거절하면 던짐 */
async function botPick(t, bot, targetId) {
    const r = await night.botNight(t, bot, targetId);
    if (!r?.ok) throw new Error(`봇 밤 행동 거절: ${r?.code}`);
}

// 폰(세로 카톡형)엔 카드 판·초상 띠가 없음 → 플레이어 목록 시트(밤엔 "직업 행동")의 그 사람 줄이 카드 메뉴 대신 (frontend-mobile roster/RosterRow.jsx)
const phoneCard = (page, nickname) => rosterRowOf(page, nickname);
/** 그 사람 카드 (폰은 목록 시트 줄 — 목록을 먼저 열어야 보임, PC는 판 카드) */
const card = (page, nickname) => (isPhone(page) ? phoneCard(page, nickname) : night.cardButton(page, nickname));
const cardMenu = (page) => page.getByRole('menu', { name: '플레이어 행동' });
// 메뉴 항목은 단추에 보이는 글로 고름 (PC 밤 행동 단추는 읽기 이름이 "닉네임 암살"처럼 대상 이름이 앞에 붙어 이름으로 안 고름)
const menuItem = (menu, label) => menu.getByRole('menuitem').filter({ has: menu.page().getByText(label, { exact: true }) });
const resultDialog = (page) => page.getByRole('dialog', { name: '밤 조사 결과', exact: true });
const turnNotice = (page, role) => page.locator(`[data-night-turn-role="${role}"]`);
const deadCards = (page) => page.locator('[data-ingame-player-nickname][data-ingame-player-status="dead"]');

/** 낮 시작 연출 넘기기: 글 창(의사가 살림·영상이 못 틀어져 바뀐 글)은 확인, 암살 영상이 제때 안 끝나 뜬 건너뛰기는 누름 */
async function passDawn(page) {
    const report = page.locator('[data-ingame-dawn-report]');
    if ((await report.count()) > 0) await report.getByRole('button', { name: '확인', exact: true }).click({ timeout: 1500 }).catch(() => {});
    const skip = page.locator('[data-ingame-night-success-kill]').getByRole('button', { name: '건너뛰기', exact: true });
    if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1500 }).catch(() => {});
}

/** 추방 연출 넘기기: 영상이 멈춰 뜬 건너뛰기(PC)는 누르고, 글만 남은 단계면 화면을 눌러 바로 끝냄 */
async function passExpulsion(page) {
    const overlay = page.locator('[data-ingame-tribunal-expulsion]');
    if ((await overlay.count()) === 0) return false;
    const skip = overlay.getByRole('button', { name: '건너뛰기', exact: true });
    if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1500 }).catch(() => {});
    else if ((await overlay.locator('video').count()) === 0) await overlay.click({ timeout: 1500 }).catch(() => {});
    return true;
}

// 판 화면 누르기를 막는 창 (밤 결과 창은 시험이 직접 보고 닫아서 뺌)
const BLOCKER_DIALOGS = Object.freeze(['내 역할 보기', '단계 전환 안내', '밤 역할 안내']);

/** 판 화면을 가리는 창 닫기: 역할·단계·차례 안내 확인, 낮 시작 연출 넘김, 추방 글 누름, 사망 뒤 선택은 관전 계속 */
async function clearBlockers(page, { rounds = 4 } = {}) {
    for (let r = 0; r < rounds; r += 1) {
        let closed = false;
        for (const name of BLOCKER_DIALOGS) {
            const dialog = page.getByRole('dialog', { name, exact: true }).first();
            if (!(await dialog.isVisible().catch(() => false))) continue;
            await dialog.getByRole('button', { name: '확인', exact: true }).click({ timeout: 1500 }).catch(() => {});
            closed = true;
        }
        await passDawn(page);
        if (await passExpulsion(page)) closed = true;
        const dead = page.getByRole('dialog', { name: '사망 후 선택', exact: true });
        if (await dead.isVisible().catch(() => false)) {
            await dead.getByRole('button', { name: '관전 계속하기', exact: true }).click({ timeout: 1500 }).catch(() => {});
            closed = true;
        }
        if (!closed) return;
    }
}

/** 열린 카드 메뉴 닫기 (없으면 그냥 지나감, 폰은 목록 시트 닫기) */
async function closeMenu(page) {
    if (isPhone(page)) {
        if (await talk.roster(page).isVisible().catch(() => false)) await closeRoster(page);
        return;
    }
    const menu = cardMenu(page);
    if (!(await menu.isVisible().catch(() => false))) return;
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
}

/** 카드를 눌러 메뉴 열기 → 메뉴 (가리는 창이 있으면 닫으면서 다시, 추방 영상이 끝날 때까지도 기다림) */
async function openMenu(page, nickname, { timeout = 45000 } = {}) {
    // 폰: 목록 시트를 열고 그 사람 줄 (줄 안 menuitem이 카드 메뉴 항목, 연출 창이 목록을 닫으면 다시 엶)
    if (isPhone(page)) {
        const row = phoneCard(page, nickname);
        await expect(async () => {
            await clearBlockers(page);
            await openRoster(page, { timeout: 3000 });
            await expect(row).toHaveCount(1, { timeout: 1000 });
        }).toPass({ timeout });
        return row;
    }
    const menu = cardMenu(page);
    await expect(async () => {
        await clearBlockers(page);
        if (!(await menu.isVisible().catch(() => false))) await card(page, nickname).click({ timeout: 1500 });
        await expect(menu).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout });
    return menu;
}

/** 카드 메뉴 항목 누르기 (예: '투표하기'·'암살'·'보호'·'조사'·'확인') */
async function pick(page, nickname, label) {
    const menu = await openMenu(page, nickname);
    const item = menuItem(menu, label);
    await expect(item).toBeEnabled();
    await item.click();
    // 폰 목록 시트는 고른 뒤에도 열려 있음 → 닫음
    if (isPhone(page)) await closeMenu(page);
    await expect(menu).toBeHidden();
}

/** 밤 행동을 화면으로 냄: 카드 메뉴에서 직업 행동을 누르고, 건너뛰기 단추가 꺼질 때까지 (서버가 받았는지는 playNight가 차례 끝에 봄) */
async function pickNight(page, nickname, role) {
    await pick(page, nickname, ACTION_LABELS[role]);
    await expect(night.skipButton(page)).toBeDisabled();
}

/** 낮 투표를 화면으로 냄 → 그 카드 메뉴가 '투표취소'로 바뀌면 낸 것 (찍은 뒤에도 기권 단추는 켜짐, PC와 같음, 사용자 결정 2026-11-18) */
async function voteUi(page, nickname) {
    await pick(page, nickname, '투표하기');
    await expect(async () => {
        const menu = await openMenu(page, nickname, { timeout: 5000 });
        await expect(menuItem(menu, '투표취소')).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15000 });
    await closeMenu(page);
}

/** 지금 내 밤 차례가 켜졌는지: 건너뛰기 단추가 눌리는 상태 (가리는 창은 닫으면서) */
async function expectMyTurn(page, { timeout = 45000 } = {}) {
    await expect(async () => {
        await clearBlockers(page);
        await expect(night.skipButton(page)).toBeEnabled({ timeout: 1000 });
    }).toPass({ timeout });
}

/**
 * 그 카드의 밤 행동 단추가 어떤지 → '있음' | '잠김' | '없음'
 * '있음' = 눌러 고를 수 있음, '잠김' = 단추는 보이나 꺼져 있음, '없음' = 단추가 없음 (항목이 없는 카드는 눌러도 메뉴가 안 열림)
 * 화면 규칙(frontend utils/playerCardMenu.js, 폰·PC 같음): 고를 수 없는 남의 카드는 잠긴 채 보임, 내 카드(의사 말고)·동료 광대 카드는 항목이 없음
 * 카드 누르기가 성공한 뒤에만 봄 (창에 가려 못 누른 것을 '없음'으로 잘못 보지 않게)
 */
async function menuItemState(page, nickname, role) {
    // 폰: 목록 시트 그 줄의 단추 (항목 없는 줄은 단추 칸이 안 그려짐 → '없음')
    if (isPhone(page)) {
        const row = await openMenu(page, nickname);
        const item = menuItem(row, ACTION_LABELS[role]);
        let state = '없음';
        if ((await item.count()) > 0) state = (await item.isEnabled()) ? '있음' : '잠김';
        await closeMenu(page);
        return state;
    }
    const menu = cardMenu(page);
    await closeMenu(page);
    await expect(async () => {
        await clearBlockers(page);
        await card(page, nickname).click({ timeout: 1500 });
    }).toPass({ timeout: 45000 });
    const opened = await menu.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false);
    if (!opened) return '없음';
    const item = menuItem(menu, ACTION_LABELS[role]);
    let state = '없음';
    if ((await item.count()) > 0) state = (await item.isEnabled()) ? '있음' : '잠김';
    await closeMenu(page);
    return state;
}

/**
 * 그 카드에 눌리는 밤 행동이 있나 → '있음' | '없음'
 * '없음' = 카드를 눌러도 메뉴가 안 열리거나, 열려도 그 행동 단추가 없거나 꺼져 있음 (눌러서 고를 수 없으면 없음)
 * 잠김과 없음을 가르려면 menuItemState를 씀
 */
async function itemState(page, nickname, role) {
    return (await menuItemState(page, nickname, role)) === '있음' ? '있음' : '없음';
}

/** 밤 행동 단추가 눈에 보이는지: 보임·크기·화면 안·안 가려짐 (그림 단추 위 글이라 대비는 안 셈) */
async function expectItemShown(page, nickname, role) {
    const menu = await openMenu(page, nickname);
    const item = menuItem(menu, ACTION_LABELS[role]);
    await expectReadable(item, { contrast: false });
    await expect(item).toBeEnabled();
    await closeMenu(page);
}

/** "밤이·낮이 되었습니다" 창이 뜰 때까지 기다렸다 확인 누름 (autoConfirm을 끈 판에서 씀, 추방 연출 뒤에 떠서 연출은 넘기며 기다림) */
async function confirmEntrance(page, phase, { timeout = 40000 } = {}) {
    const button = page.locator(`[data-ingame-phase-entrance="${phase}"]`).getByRole('button', { name: '확인', exact: true });
    await expect(async () => {
        await passExpulsion(page);
        await button.waitFor({ state: 'visible', timeout: 1000 });
    }).toPass({ timeout });
    await button.click();
}

/** 밤 차례 안내("○○의 시간입니다")가 눈에 읽히는지 — 2.6초 뒤 저절로 닫혀서 뜨자마자 봄 */
async function expectTurnNotice(page, role, { timeout = 15000 } = {}) {
    const message = turnNotice(page, role).getByText(TURN_MESSAGES[role], { exact: true });
    await message.waitFor({ state: 'visible', timeout });
    await expectReadable(message, { timeout: 2500 });
}

/** 떠 있는 밤 차례 안내가 사라질 때까지 (다음 안내가 새 창으로 떠야 화면 기록에 따로 적힘) */
async function waitNoticeGone(page) {
    await expect(page.locator('[data-night-turn-role]')).toHaveCount(0, { timeout: 8000 });
}

/** 화면에 그 날 낮이 왔는지 (폰은 명패 줄 "[낮", PC는 진행 바 이름 "제 N일") */
// 폰(모바일 상대 화면) 세로 명패 줄엔 날짜 글이 없음("[낮-토론과 투표]"만) → 밤 뒤 낮이 왔는지만 봄 (날짜는 부르는 쪽이 서버 값으로)
async function expectDayShown(page, dayIndex, { timeout = 30000 } = {}) {
    const mark = isPhone(page)
        ? page.locator('[data-ingame-phase-timer-mobile]').filter({ hasText: '[낮' })
        : page.locator(`[aria-label="제 ${dayIndex}일 시간 흐름"]`);
    await expect(mark.first()).toBeAttached({ timeout });
}

/** 낮 시작 연출(암살 영상·글 창)이 다 끝날 때까지 넘김 */
async function settleDawn(page, { timeout = 45000 } = {}) {
    await expect(async () => {
        await passDawn(page);
        await expect(page.locator('[data-ingame-night-success-kill], [data-ingame-dawn-report]')).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout });
}

/**
 * 밤 결과 창이 뜨고 글에 texts가 다 들어 있고 눈에 읽히는지 → 창
 * 결과 창은 낮 시작 연출이 끝나야 떠서 연출을 넘기며 기다림
 */
async function expectResult(page, texts, { timeout = 45000 } = {}) {
    const dialog = resultDialog(page);
    await expect(async () => {
        await passDawn(page);
        await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout });
    for (const text of texts) await expect(dialog).toContainText(text);
    await expectReadable(dialog.getByText(texts[0]).first());
    return dialog;
}

/** 조사·확인 결과 창: 고른 사람 닉네임과 그 직업 이름이 한 글에 보이는지 */
function expectRoleResult(page, nickname, role) {
    return expectResult(page, [nickname, ROLE_NAMES[role]]);
}

/** 밤 결과 창 확인 눌러 닫기 */
async function closeResult(page) {
    const dialog = resultDialog(page);
    await dialog.getByRole('button', { name: '확인', exact: true }).click();
    await expect(dialog).toHaveCount(0);
}

/**
 * 밤 결과 창이 안 떴는지: 그 낮이 화면에 오고 낮 시작 연출이 끝난 뒤(결과 창이 뜰 수 있는 때) 창이 없고, 화면 기록에도 seen개뿐
 * @param {number} dayIndex 밤이 끝나고 온 낮 날짜
 * @param {number} [seen=0] 앞선 밤들에 이미 뜬 결과 창 수
 */
async function expectNoResult(page, dayIndex, seen = 0) {
    await expectDayShown(page, dayIndex);
    await settleDawn(page);
    await expect(resultDialog(page)).toHaveCount(0);
    expect((await night.readUi(page)).privateResults).toHaveLength(seen);
}

/** 그 사람 카드 상태(alive·dead)가 될 때까지 (낮 시작 연출은 넘기며, 폰은 목록 줄 상태 글 "사망"·없음) */
async function expectCardStatus(page, nickname, status, { timeout = 45000 } = {}) {
    if (isPhone(page)) {
        await settleDawn(page, { timeout });
        // 내가 죽은 밤이면 연출 뒤 "사망 후 선택" 창(정한 연출, 맨 위 겹)이 목록 단추를 덮음 → 가리는 창을 닫아 가며 봄 (관전 계속)
        await expect(async () => {
            await clearBlockers(page);
            await expectPlayerStatus(page, nickname, status === 'dead' ? '사망' : null, { timeout: 5000 });
        }).toPass({ timeout });
        return;
    }
    const mark = page.locator(`[data-ingame-player-nickname="${nickname}"]`);
    await expect(async () => {
        await passDawn(page);
        await expect(mark).toHaveAttribute('data-ingame-player-status', status, { timeout: 1000 });
    }).toPass({ timeout });
}

/** 그 사람 카드가 사망으로 바뀌고 눈에 보이는지 (가리는 창은 닫고 봄, 폰은 칸 이름에 "사망") */
async function expectDeadShown(page, nickname) {
    await expectCardStatus(page, nickname, 'dead');
    // 폰: 목록 줄 "사망" 글이 읽힘 (양피지 틀 위 글이라 대비는 사진으로 잼)
    if (isPhone(page)) {
        await expect(async () => {
            await clearBlockers(page);
            await openRoster(page, { timeout: 3000 });
            await expectReadable(phoneCard(page, nickname).getByText('사망', { exact: true }), { method: 'pixels', timeout: 2000 });
        }).toPass({ timeout: 30000 });
        await closeMenu(page);
        return;
    }
    await expect(async () => {
        await clearBlockers(page);
        await expectReadable(card(page, nickname), { contrast: false, timeout: 2000 });
    }).toPass({ timeout: 30000 });
}

/** 그 낮이 화면에 오고 연출이 끝난 뒤 사망 카드가 count개인지 (밤에 아무도 안 죽었나 볼 때) */
async function expectDeadCount(page, dayIndex, count) {
    await expectDayShown(page, dayIndex);
    await settleDawn(page);
    // 폰: 목록 시트의 "사망" 글 수
    if (isPhone(page)) {
        await clearBlockers(page);
        const sheet = await openRoster(page);
        await expect(sheet.getByText('사망', { exact: true })).toHaveCount(count);
        await closeMenu(page);
        return;
    }
    await expect(deadCards(page)).toHaveCount(count);
}

/**
 * 결과 화면까지: 낮 시작 연출(암살 영상)·결과 연출 영상을 넘기고 승패 띠가 뜰 때까지
 * 그다음 승패 글('승리'·'패배')과 이긴 편 글이 눈에 읽히는지 (띠 글은 누름을 안 받게 돼 있어 가려짐은 안 봄)
 */
async function expectResultScreen(page, { outcome, team = '광대 진영 승리', timeout = 90000 }) {
    const banner = page.getByText(/^(승리|패배)$/);
    const skip = page.getByRole('button', { name: '건너뛰기', exact: true });
    await expect(async () => {
        if (/\/gameresult/.test(page.url())) {
            if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
        } else {
            await passDawn(page);
        }
        await expect(page).toHaveURL(/\/gameresult/, { timeout: 1000 });
        await expect(banner).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout });
    // 결과판 1.5초 뒤 뜨는 전면 광고 창이 이긴 편 글을 덮음 → 닫고 봄
    await ui.closeResultAd(page);
    await expect(banner).toHaveText(outcome);
    await expectReadable(banner, { large: true, uncovered: false, timeout: 10000 });
    await expectReadable(page.getByText(team, { exact: true }), { timeout: 10000 });
}

module.exports = {
    ACTION_LABELS, TURN_MESSAGES, ROLE_NAMES, TURN_ROLES, ASSASSIN_FAILED_TEXT, night,
    isPhone, uuidOf, nickOf, seat, waitState, executeByBots, toNight, stepToTurn, expectTurnFilled, watch, playNight, botPick,
    card, cardMenu, menuItem, resultDialog, turnNotice, deadCards, passDawn, passExpulsion, clearBlockers, closeMenu, openMenu, pick, pickNight, voteUi,
    expectMyTurn, itemState, menuItemState, expectItemShown, confirmEntrance, expectTurnNotice, waitNoticeGone, expectDayShown, settleDawn,
    expectResult, expectRoleResult, closeResult, expectNoResult, expectCardStatus, expectDeadShown, expectDeadCount, expectResultScreen,
};
