'use strict';

// 낮 시작 연출 모바일 브라우저 시험 — 밤엔 누구 화면에도 영상·기다림 창이 없고, 낮이 될 때 죽음은 영상 + 글·살림은 글 창을 누가 보든 똑같이 보는지 (받은 버그 5)
// 목록 A05b-밤-알림-낮연출.md 번호 A05-E-625~662·679~681·683~685 (44개) — 5초 규칙은 a05-night-settle.spec.js가 봄, 여기 밤 차례는 손잡이로 닫음
const { test, expect, ui } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const { talk, getExecuted } = require('./_talk');
const night = require('../ingame/b-night/_night');

// 화면 글 (frontend utils/dawnReport.js·constants/ingamePhaseEntrance.js와 같은 글)
const SAVED_TEXT = '지난밤 의사가 공격받은 사람을 살려냈습니다';
const killedText = (nickname) => `지난밤 ${nickname}님이 살해당했습니다`;
const DAY_TEXT = '낮이 되었습니다';
const WAIT_TEXT = '진행을 기다리는 중입니다.';
const ROLE_WORDS = /광대|시민|의사|경비원|마녀사냥꾼/;

// 직접 구성에 넣는 직업 (시민은 남는 자리)
const SPECIAL = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'];
// 카드 시트의 밤 행동 단추 이름
const ACTION = { JOKER: '암살', DOCTOR: '보호', GUARD: '조사', WITCH_HUNTER: '확인' };
// 인원마다 직업 구성 (직접 구성으로 늘 정해 줌)
const COUNTS = {
    5: { JOKER: 1 },
    6: { JOKER: 1, DOCTOR: 1 },
    7: { JOKER: 1, DOCTOR: 1 },
    8: { JOKER: 1, DOCTOR: 1, GUARD: 1 },
    10: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 },
};
// 사람 자리 → 사람 직업 (당한 사람·보호받은 사람·처형된 관전자는 시민)
const SEAT_ROLE = { CITIZEN: 'CITIZEN', VICTIM: 'CITIZEN', SAVED: 'CITIZEN', DEAD: 'CITIZEN', JOKER: 'JOKER', DOCTOR: 'DOCTOR', GUARD: 'GUARD' };
const SEAT_NAME = { CITIZEN: '산 시민', JOKER: '광대', VICTIM: '당한 사람', SAVED: '보호받은 사람', DEAD: '전날 처형된 관전자', DOCTOR: '의사', GUARD: '경비원' };
// 카드 누르기를 막는 안내 창 (확인 하나로 닫힘)
const BLOCKERS = ['내 역할 보기', '단계 전환 안내', '밤 역할 안내', '밤 조사 결과'];

const dayEntrance = (page) => page.locator('[data-ingame-phase-entrance="DAY"]');
const showMarks = (page) => page.locator('[data-ingame-night-success-kill], [data-ingame-dawn-report]');
// 봇·사람 → { uuid, nickname }
const P = (x) => ({ uuid: (x.account ?? x).uuid, nickname: (x.account ?? x).nickname });

/**
 * 화면 기록 심기: 연출·안내 창·개인 결과가 뜬 때, 주소가 바뀐 때를 차례대로 적음 (잠깐 떴다 사라진 것도 잡음)
 * 문서가 열릴 때마다 다시 심어서 새로고침 뒤 기록은 새로 시작함
 */
async function watch(page) {
    const install = () => {
        if (window.__a05b) return;
        const log = [];
        window.__a05b = log;
        const last = {};
        const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
        // 같은 요소·같은 값이면 한 번만 적음
        const seen = (kind, selector, read) => {
            const el = document.querySelector(selector);
            const value = el ? read(el) : null;
            if (el && (el !== last[kind]?.el || value !== last[kind]?.value)) {
                log.push({ kind, value, at: Date.now(), path: window.location.pathname });
            }
            last[kind] = el ? { el, value } : null;
        };
        const scan = () => {
            seen('kill', '[data-ingame-night-success-kill]', (el) => el.querySelector('video')?.getAttribute('src') || '');
            seen('msg', '[data-ingame-dawn-report-message]', text);
            seen('report', '[data-ingame-dawn-report]', (el) => el.getAttribute('data-ingame-dawn-report'));
            seen('entrance', '[data-ingame-phase-entrance]', (el) => el.getAttribute('data-ingame-phase-entrance'));
            seen('result', '[data-ingame-night-private-result]', text);
            const waiting = (document.body?.textContent || '').includes('진행을 기다리는 중입니다.');
            if (waiting && last.waiting !== true) log.push({ kind: 'wait', value: '', at: Date.now(), path: window.location.pathname });
            last.waiting = waiting;
            // 주소가 바뀐 때 낮 시작 연출이 아직 떠 있었는지도 같이 적음 (결과 화면이 연출보다 먼저 뜨면 안 됨)
            const path = window.location.pathname;
            if (path !== last.path) {
                const showing = document.querySelector('[data-ingame-night-success-kill], [data-ingame-dawn-report]') !== null;
                log.push({ kind: 'path', value: path, at: Date.now(), path, showing });
            }
            last.path = path;
        };
        new MutationObserver(scan).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
        scan();
    };
    await page.addInitScript(install);
    await page.evaluate(install);
}

/** 화면 기록 읽기 (from번째부터) — 화면이 넘어가는 중이면 빈 목록 */
async function logOf(page, from = 0) {
    const log = await page.evaluate(() => window.__a05b ?? []).catch(() => []);
    return log.slice(from);
}

/** 판 요약이 조건에 맞을 때까지 (단계를 넘기지 않음) */
async function waitState(t, match, message = '판 상태 기다림') {
    let last = null;
    await expect.poll(async () => { last = await t.state(); return Boolean(last && match(last)); }, { timeout: 20_000, message }).toBe(true);
    return last;
}

/**
 * 판 차리기: 모바일 사람 1명 + 봇, 직업은 전부 정해 줌 → 서버 직업을 읽어 맞았는지 보고 역할 창을 닫음
 * 자리가 DEAD면 첫날 봇 표로 처형당해 관전하는 데까지
 * @returns {Promise<{ t:any, page:any, role:string, human:{uuid:string,nickname:string}, cast:Record<string,any[]> }>} cast = 직업마다 봇 목록
 */
async function openGame({ user, table }, { n, seat, counts = COUNTS[n] }) {
    const page = user.page;
    await watch(page);
    const role = SEAT_ROLE[seat];
    // 사람 몫 하나를 뺀 나머지가 봇 직업 → 예: 6명 의사 자리면 봇은 ['JOKER'] + 시민 4
    const left = { ...counts, [role]: (counts[role] ?? 0) - 1 };
    const botRoles = SPECIAL.flatMap((r) => Array(Math.max(0, left[r] ?? 0)).fill(r));
    const t = await table.setup({
        humans: [user],
        bots: n - 1,
        // 처형부터 겪는 자리는 화면 정리에 시간이 걸림 → 밤 차례를 60초로 (광대 차례가 먼저 닫히지 않게)
        settings: customRoleSettings(counts, seat === 'DEAD' ? { nightActionTime: 60 } : {}),
        roles: ({ humans, bots }) => Object.fromEntries([
            [humans[0].account.uuid, role],
            ...bots.map((bot, i) => [bot.account.uuid, botRoles[i] ?? 'CITIZEN']),
        ]),
    });
    const s = await t.state();
    const roleOf = (uuid) => s.players.find((p) => p.uuid === uuid)?.role;
    expect(roleOf(user.account.uuid), '사람 직업이 정한 대로').toBe(role);
    const cast = { JOKER: [], DOCTOR: [], GUARD: [], WITCH_HUNTER: [], CITIZEN: [] };
    for (const bot of t.bots) cast[roleOf(bot.account.uuid)].push(bot);
    for (const r of SPECIAL) expect(cast[r].length, `봇 ${r} 수가 정한 대로`).toBe(Math.max(0, left[r] ?? 0));
    await ui.readRoleReveal(page);
    if (seat === 'DEAD') {
        await getExecuted(t, user.account.uuid, { pages: [page] });
        await t.stopBots();
    }
    return { t, page, role, human: P(user), cast };
}

/** 카드 시트 열기: 초상 띠 칸 누름 (막는 안내 창은 닫으면서) → 메뉴 */
async function openMenu(page, slot) {
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    await expect(async () => {
        await ui.closeOverlays(page, { names: BLOCKERS, rounds: 2, clickTimeoutMs: 1500 });
        if (!(await menu.isVisible().catch(() => false))) await slot.click({ timeout: 1500 });
        await expect(menu).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 25_000 });
    return menu;
}

/** 모바일 밤 행동: 초상 띠 칸 → 카드 시트의 '암살'·'보호'·'조사' */
async function pick(page, slot, label) {
    const menu = await openMenu(page, slot);
    const item = menu.getByRole('menuitem', { name: label, exact: true });
    await expect(item).toBeEnabled();
    await item.click();
    await expect(menu).toBeHidden();
}

/**
 * 그 직업 차례에 고르기: 봇은 소켓으로, 사람이 그 직업이면 화면으로
 * choice = 사람 하나(모두 같은 대상) · 배열(봇마다 다른 대상) · null(건너뛰기)
 */
async function act(g, role, choice, dayIndex) {
    for (const [i, bot] of g.cast[role].entries()) {
        const target = Array.isArray(choice) ? choice[i] : choice;
        const reply = await night.botNight(g.t, bot, target ? target.uuid : null);
        expect(reply?.ok, `봇 ${role} 고르기를 서버가 받음`).toBe(true);
    }
    if (g.role !== role) return;
    const target = Array.isArray(choice) ? choice[0] : choice;
    const slot = target.uuid === g.human.uuid ? talk.mySlot(g.page) : talk.slot(g.page, target.nickname);
    await pick(g.page, slot, ACTION[role]);
    // 화면에서 누른 것이 서버에 닿아 "다 골랐음" 알림이 판에 퍼진 뒤에 차례를 닫음 (봇이 받은 알림으로 봄)
    await g.t.bots[0].waitForEvent('phase_settle_started', {
        match: (p) => p?.role === role && p?.dayIndex === dayIndex,
        timeoutMs: 15_000,
    });
}

/**
 * 밤 한 번 돌리기: 차례가 열릴 때마다 plan[직업]대로 고르고, 닫기 전에 check를 부른 뒤 손잡이로 그 차례를 닫음
 * plan에 없는 직업은 아무도 안 고름 (닫힐 때 서버가 건너뛰기로 채움) → 밤을 벗어난 판 요약
 */
async function playNight(g, plan = {}, check = null) {
    const done = new Set();
    for (let i = 0; i < 12; i += 1) {
        const s = await g.t.state();
        if (!s || s.phase !== 'NIGHT') return s;
        const role = s.nightTurnRole;
        if (!role) {
            await waitState(g.t, (x) => x.phase !== 'NIGHT' || Boolean(x.nightTurnRole), '다음 밤 차례');
            continue;
        }
        if (!done.has(role)) {
            done.add(role);
            if (role in plan) await act(g, role, plan[role], s.dayIndex);
        }
        if (check) await check(role);
        await g.t.advance();
    }
    throw new Error('밤이 안 끝남 (차례를 12번 넘김)');
}

/** 광대가 한 사람을 죽이는 밤 (당한 사람 자리면 사람, 아니면 맨 끝 시민 봇) → 죽은 사람 */
async function killNight(g, seat, { dayIndex = 1, check = null } = {}) {
    const victim = seat === 'VICTIM' ? g.human : P(g.cast.CITIZEN.at(-1));
    await night.toTurn(g.t, 'JOKER', { dayIndex });
    await playNight(g, { JOKER: victim }, check);
    return victim;
}

/** 광대가 노린 사람을 의사가 지키는 밤 (보호받은 사람·의사 자리면 사람 자신, 아니면 맨 끝 시민 봇) → 보호받은 사람 */
async function savedNight(g, seat, { check = null } = {}) {
    const target = seat === 'SAVED' || seat === 'DOCTOR' ? g.human : P(g.cast.CITIZEN.at(-1));
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await playNight(g, { JOKER: target, DOCTOR: target }, check);
    return target;
}

/** 연출 글 줄: 영상 아래 글, 영상이 못 틀어져 글 창으로 바뀌었으면 그 창 글 */
const killedLine = (page, nickname) => page
    .locator('[data-ingame-dawn-report-message], [data-ingame-dawn-report="KILLED"] p')
    .filter({ hasText: killedText(nickname) })
    .first();
const savedLine = (page) => page.locator('[data-ingame-dawn-report="SAVED"]').getByText(SAVED_TEXT, { exact: true });

/**
 * 죽음 연출: 암살 영상이 떴고(화면 기록) 글이 사람 눈에 읽힘, 글에 직업 이름 없음
 * @returns {Promise<object>} 글 줄의 읽힘 값 (자리·가려짐·대비)
 */
async function expectKilled(page, nickname, from = 0) {
    await expect.poll(async () => (await logOf(page, from)).filter((e) => e.kind === 'kill').length, {
        timeout: 20_000, message: '낮이 될 때 암살 영상이 안 뜸',
    }).toBeGreaterThan(0);
    const line = killedLine(page, nickname);
    const seenAs = await expectReadable(line);
    await expect(line).toHaveText(killedText(nickname));
    expect(await line.innerText()).not.toMatch(ROLE_WORDS);
    return seenAs;
}

/**
 * 살림 연출: 글 창의 글이 읽힘, 영상은 없음, 창 어디에도 닉네임이 없음 (누가 공격받았는지 안 밝힘)
 * @returns {Promise<object>} 글 줄의 읽힘 값
 */
async function expectSaved(page, hiddenNames = [], from = 0) {
    const seenAs = await expectReadable(savedLine(page), { timeout: 20_000 });
    const shown = await page.locator('[data-ingame-dawn-report="SAVED"]').getByRole('dialog').innerText();
    for (const name of hiddenNames) expect(shown, '살림 글 창에 닉네임이 없음').not.toContain(name);
    expect((await logOf(page, from)).filter((e) => e.kind === 'kill' || e.kind === 'msg'), '살림 밤엔 암살 영상이 없음').toEqual([]);
    return seenAs;
}

/** 연출 없이 낮: "낮이 되었습니다"가 읽히고, 기록에 연출이 하나도 없음 */
async function expectPlainDay(page, from = 0) {
    await expectReadable(dayEntrance(page).getByText(DAY_TEXT, { exact: true }), { timeout: 20_000 });
    const shows = (await logOf(page, from)).filter((e) => ['kill', 'msg', 'report'].includes(e.kind));
    expect(shows, '연출 기록').toEqual([]);
    await expect(showMarks(page)).toHaveCount(0);
}

/** 밤 동안 연출 흔적 없음: 화면이 그 차례까지 따라온 뒤, 기록·화면에 영상·글 창·기다림 창이 없음 */
async function expectQuietNight(page, role) {
    // 단계 줄: 그 직업 차례 글, 다 골라 마감이 당겨졌으면 "5초 뒤 마감"
    await expect(talk.phaseLine(page)).toContainText(new RegExp(`밤 ${ui.ROLE_LABELS[role]}|5초 뒤 마감`), { timeout: 15_000 });
    const shows = (await logOf(page)).filter((e) => ['kill', 'msg', 'report', 'wait'].includes(e.kind));
    expect(shows, '밤 동안 연출 기록').toEqual([]);
    await expect(showMarks(page)).toHaveCount(0);
    await expect(page.getByText(WAIT_TEXT)).toHaveCount(0);
}

/** 연출 닫기: 영상은 끝날 때까지 기다리고(막히면 건너뛰기), 글 창은 확인 */
async function finishShow(page) {
    await expect(async () => {
        const confirm = page.locator('[data-ingame-dawn-report]').getByRole('button', { name: '확인' });
        if (await confirm.isVisible().catch(() => false)) await confirm.click({ timeout: 1000 }).catch(() => {});
        const skip = page.locator('[data-ingame-night-success-kill]').getByRole('button', { name: '건너뛰기' });
        if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
        await expect(showMarks(page)).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 30_000 });
}

/** "낮이 되었습니다" 창 닫기 (죽은 사람 화면은 2초 뒤 저절로 닫힘) */
async function closeDayEntrance(page) {
    // 연출이 닫힌 뒤에 뜸 → 뜬 것을 보고 닫음 (안 기다리면 늦게 떠서 채팅을 덮음)
    await dayEntrance(page).waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
    await expect(async () => {
        const confirm = dayEntrance(page).getByRole('button', { name: '확인' });
        if (await confirm.isVisible().catch(() => false)) await confirm.click({ timeout: 1000 }).catch(() => {});
        await expect(dayEntrance(page)).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
}

// ── 죽음: 누가 보든 영상 + 글 (A05-E-625~636) ──
const KILLED_CASES = [
    ...['CITIZEN', 'JOKER', 'VICTIM', 'DEAD', 'DOCTOR'].flatMap((seat, i) => [6, 8].map((n, j) => ({ no: 625 + i * 2 + j, seat, n }))),
    { no: 635, seat: 'CITIZEN', n: 10 },
    { no: 636, seat: 'JOKER', n: 10 },
];
for (const c of KILLED_CASES) {
    const bug = c.no <= 634 ? '[버그 5] ' : '';
    const tags = `@game${c.no <= 626 ? ' @safari' : ''}${c.no === 625 ? ' @smoke' : ''}`;
    test(`A05-E-${c.no} ${bug}죽음 · ${SEAT_NAME[c.seat]} ${c.n}명: 낮이 될 때 암살 영상 + "지난밤 ○○님이 살해당했습니다"가 읽힘, 글에 직업 없음 ${tags}`, async ({ user, table }) => {
        const g = await openGame({ user, table }, c);
        const victim = await killNight(g, c.seat);
        await expectKilled(g.page, victim.nickname);
    });
}

// ── 살림: 누가 보든 같은 글 (A05-E-637~641, 7명) ──
['CITIZEN', 'JOKER', 'SAVED', 'DOCTOR', 'DEAD'].forEach((seat, i) => {
    const no = 637 + i;
    test(`A05-E-${no} 살림 · ${SEAT_NAME[seat]} 7명: "${SAVED_TEXT}"가 읽힘, 보호받은 사람 이름 없음 @game${no === 637 ? ' @safari' : ''}`, async ({ user, table }) => {
        const g = await openGame({ user, table }, { n: 7, seat });
        const target = await savedNight(g, seat);
        await expectSaved(g.page, [target.nickname]);
    });
});

// ── 아무 일 없음: 연출 없이 "낮이 되었습니다" (A05-E-642~644, 8명, 사람 = 시민) ──
const NONE_CASES = [
    { no: 642, how: '광대가 건너뜀', counts: COUNTS[8], plan: () => ({ JOKER: null }) },
    { no: 643, how: '광대 2명이 서로 다른 사람을 고름', counts: { JOKER: 2, DOCTOR: 1, GUARD: 1 }, plan: (g) => ({ JOKER: [P(g.cast.CITIZEN[0]), P(g.cast.CITIZEN[1])] }) },
    { no: 644, how: '광대가 안 고르고 시간 끝', counts: COUNTS[8], plan: () => ({}) },
];
for (const c of NONE_CASES) {
    test(`A05-E-${c.no} 아무 일 없음 · ${c.how} (8명 시민 화면): 연출 없이 "${DAY_TEXT}"가 읽힘 @game`, async ({ user, table }) => {
        const g = await openGame({ user, table }, { n: 8, seat: 'CITIZEN', counts: c.counts });
        await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
        const end = await playNight(g, c.plan(g));
        expect(end.players.every((p) => p.alive), '아무도 안 죽음').toBe(true);
        await expectPlainDay(g.page);
    });
}

// ── 밤 동안 영상·기다림 창 없음 (A05-E-645~649, 7명) ──
['JOKER', 'VICTIM', 'DOCTOR', 'CITIZEN', 'DEAD'].forEach((seat, i) => {
    const no = 645 + i;
    test(`A05-E-${no} [버그 5] 밤 내내 · ${SEAT_NAME[seat]} 7명: 광대 차례·의사 차례 모두 암살 영상·"${WAIT_TEXT}" 없음 @game${no === 645 ? ' @safari' : ''}`, async ({ user, table }) => {
        const g = await openGame({ user, table }, { n: 7, seat });
        // 차례를 닫기 직전마다 봄 → 광대 차례가 끝난 뒤(의사 차례)에도 아직 밤이라 아무것도 없어야 함
        const victim = await killNight(g, seat, { check: (role) => expectQuietNight(g.page, role) });
        // 기록이 살아 있는지: 낮이 되면 같은 기록에 영상이 잡힘
        await expectKilled(g.page, victim.nickname);
    });
});

// ── 채팅 알림 줄 (A05-E-650~652, 7명) ──
[['CITIZEN', 650], ['DEAD', 651]].forEach(([seat, no]) => {
    test(`A05-E-${no} 채팅 알림 줄 · 죽음 · ${SEAT_NAME[seat]} 7명: 채팅에 "지난밤 ○○님이 살해당했습니다" 줄이 읽힘 @game${no === 650 ? ' @safari' : ''}`, async ({ user, table }) => {
        const g = await openGame({ user, table }, { n: 7, seat });
        const victim = await killNight(g, seat);
        await expectKilled(g.page, victim.nickname);
        await finishShow(g.page);
        await closeDayEntrance(g.page);
        const line = talk.system(g.page).filter({ hasText: killedText(victim.nickname) });
        await expect(line).toHaveCount(1);
        await expectReadable(line.locator('p'));
    });
});

test('A05-E-652 채팅 알림 줄 · 살림 · 산 시민 7명: 채팅에 살해 줄이 없음 @game', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 7, seat: 'CITIZEN' });
    await savedNight(g, 'CITIZEN');
    await expectSaved(g.page);
    await finishShow(g.page);
    await closeDayEntrance(g.page);
    // 낮 화면까지 온 뒤에 봄 (단계 줄이 낮)
    await expect(talk.phaseLine(g.page)).toContainText('낮');
    await expect(talk.system(g.page).filter({ hasText: '살해당했습니다' })).toHaveCount(0);
});

// ── 밤 암살로 판 끝: 연출 뒤 결과 화면 (A05-E-653~654, 5명 광대 2) ──
[['JOKER', 653], ['CITIZEN', 654]].forEach(([seat, no]) => {
    test(`A05-E-${no} [임시 9] 밤 암살로 판 끝 · ${SEAT_NAME[seat]} 5명(광대 2): 연출이 끝날 때까지 결과 화면 아님 → 끝나면 결과 화면 @game${no === 653 ? ' @safari' : ''}`, async ({ user, table }) => {
        const g = await openGame({ user, table }, { n: 5, seat, counts: { JOKER: 2 } });
        const victim = P(g.cast.CITIZEN.at(-1));
        await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
        // 광대 2 : 나머지 3에서 한 명이 죽으면 2 : 2 → 판 끝
        await playNight(g, { JOKER: victim });
        await expectKilled(g.page, victim.nickname);
        await finishShow(g.page);
        await expect(g.page).toHaveURL(/\/gameresult/, { timeout: 30_000 });
        // 기록 차례: 영상이 판 화면에서 뜸 → 결과 화면으로 넘어간 때엔 연출이 이미 닫혀 있음
        const log = await logOf(g.page);
        const kill = log.findIndex((e) => e.kind === 'kill');
        const result = log.findIndex((e) => e.kind === 'path' && e.value === '/gameresult');
        expect(log[kill].path).toBe('/ingame');
        expect(result, '결과 화면이 영상 뒤에 옴').toBeGreaterThan(kill);
        expect(log[result].showing, '결과 화면으로 갈 때 연출이 떠 있었나').toBe(false);
    });
});

// ── 새로고침하면 다시 안 틂 (A05-E-655~656, 6명) ──
[[655, '연출 중', false], [656, '연출을 닫은 뒤', true]].forEach(([no, when, closeFirst]) => {
    test(`A05-E-${no} 죽음 · ${when} 새로고침 (6명 시민 화면): 연출이 다시 안 뜨고 죽은 사람 칸은 사망 @game`, async ({ user, table }) => {
        const g = await openGame({ user, table }, { n: 6, seat: 'CITIZEN' });
        const victim = await killNight(g, 'CITIZEN');
        if (closeFirst) {
            await expectKilled(g.page, victim.nickname);
            await finishShow(g.page);
        } else {
            await expect(showMarks(g.page)).not.toHaveCount(0, { timeout: 20_000 });
        }
        await g.page.reload();
        // 새로고침 뒤 기록은 문서가 열릴 때부터 새로 적힘 → 판 화면이 다 그려진 뒤에도 연출이 한 번도 없어야 함
        await expect(g.page).toHaveURL(/\/ingame/);
        await expect(talk.slot(g.page, victim.nickname)).toHaveAccessibleName(`${victim.nickname}, 사망`, { timeout: 20_000 });
        await expect(talk.phaseLine(g.page)).toContainText('낮');
        const shows = (await logOf(g.page)).filter((e) => ['kill', 'msg', 'report'].includes(e.kind));
        expect(shows, '새로고침 뒤 연출 기록').toEqual([]);
        await expect(showMarks(g.page)).toHaveCount(0);
    });
});

// ── 연출 → "낮이 되었습니다" 차례 (A05-E-657~658, 6명) ──
test('A05-E-657 죽음 연출이 먼저, 닫힌 뒤에 "낮이 되었습니다" (6명 시민 화면) @game', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 6, seat: 'CITIZEN' });
    const victim = await killNight(g, 'CITIZEN');
    await expectKilled(g.page, victim.nickname);
    await expect(dayEntrance(g.page)).toHaveCount(0);
    await finishShow(g.page);
    await expectReadable(dayEntrance(g.page).getByText(DAY_TEXT, { exact: true }));
    // 기록 차례: 영상이 둘째 날 낮 안내보다 먼저 → 끝 두 개가 ['kill', 'entrance']
    const kinds = (await logOf(g.page)).filter((e) => e.kind === 'kill' || (e.kind === 'entrance' && e.value === 'DAY')).map((e) => e.kind);
    expect(kinds.slice(-2)).toEqual(['kill', 'entrance']);
});

test('A05-E-658 살림 글 창이 먼저, 닫힌 뒤에 "낮이 되었습니다" (6명 시민 화면) @game', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 6, seat: 'CITIZEN' });
    await savedNight(g, 'CITIZEN');
    await expectSaved(g.page);
    await expect(dayEntrance(g.page)).toHaveCount(0);
    await finishShow(g.page);
    await expectReadable(dayEntrance(g.page).getByText(DAY_TEXT, { exact: true }));
});

// ── 명단에서 직업·보호 표시 안 드러남 (A05-E-659~660, 7명) ──
test('A05-E-659 죽음 뒤 죽은 사람 칸은 "사망"뿐, 직업 이름 없음 (7명 시민 화면) @game', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 7, seat: 'CITIZEN' });
    const victim = await killNight(g, 'CITIZEN');
    await expectKilled(g.page, victim.nickname);
    await finishShow(g.page);
    await closeDayEntrance(g.page);
    const slot = talk.slot(g.page, victim.nickname);
    await expect(slot).toHaveAccessibleName(`${victim.nickname}, 사망`);
    await expect(slot.locator('[data-ingame-player-status]')).toHaveAttribute('data-ingame-player-status', 'dead');
    expect(await slot.innerText()).not.toMatch(ROLE_WORDS);
});

test('A05-E-660 살림 뒤 보호받은 사람 칸이 다른 산 사람 칸과 같은 모양 (7명 시민 화면) @game', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 7, seat: 'CITIZEN' });
    const saved = await savedNight(g, 'CITIZEN');
    await expectSaved(g.page, [saved.nickname]);
    await finishShow(g.page);
    await closeDayEntrance(g.page);
    // 칸 모양 = 상태 값 + 닉네임을 뺀 이름·글 + 안쪽 요소 수 (표시가 붙으면 달라짐)
    const shapeOf = (nickname) => talk.slot(g.page, nickname).evaluate((el, name) => ({
        label: (el.getAttribute('aria-label') || '').replace(name, ''),
        status: el.querySelector('[data-ingame-player-status]')?.getAttribute('data-ingame-player-status') ?? null,
        text: (el.innerText || '').replace(name, '').trim(),
        parts: el.querySelectorAll('*').length,
    }), nickname);
    const other = P(g.cast.CITIZEN[0]);
    await expect(talk.slot(g.page, saved.nickname)).toHaveAccessibleName(saved.nickname);
    const savedShape = await shapeOf(saved.nickname);
    expect(savedShape.status).toBe('alive');
    expect(savedShape).toEqual(await shapeOf(other.nickname));
});

// ── 작은 폰(360×640)에서 연출 글이 보임 (A05-E-661~662, 6명) ──
test('A05-E-661 작은 폰 360×640 · 죽음: 영상 아래 글이 화면 안에서 읽힘 (6명 시민 화면) @game', async ({ user, table }) => {
    await user.page.setViewportSize({ width: 360, height: 640 });
    const g = await openGame({ user, table }, { n: 6, seat: 'CITIZEN' });
    const victim = await killNight(g, 'CITIZEN');
    const seenAs = await expectKilled(g.page, victim.nickname);
    expect(seenAs.viewport.width).toBe(360);
    expect(seenAs.inViewport).toBe(true);
});

test('A05-E-662 작은 폰 360×640 · 살림: 글 창의 글이 화면 안에서 읽힘 (6명 시민 화면) @game', async ({ user, table }) => {
    await user.page.setViewportSize({ width: 360, height: 640 });
    const g = await openGame({ user, table }, { n: 6, seat: 'CITIZEN' });
    await savedNight(g, 'CITIZEN');
    const seenAs = await expectSaved(g.page);
    expect(seenAs.viewport.width).toBe(360);
    expect(seenAs.inViewport).toBe(true);
});

// ── 개인 결과는 쓴 사람에게만 (A05-E-679~680, 8명) ──
test('A05-E-679 경비원 사람은 낮에 조사 결과 글을 봄 (8명): 조사한 봇 닉네임과 "의사"가 읽힘 @game', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 8, seat: 'GUARD' });
    const doctor = P(g.cast.DOCTOR[0]);
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await playNight(g, { JOKER: null, GUARD: doctor });
    const result = g.page.locator('[data-ingame-night-private-result]');
    await expectReadable(result.getByText(`조사 결과, ${doctor.nickname} 님의 역할은 의사입니다.`, { exact: true }), { timeout: 20_000 });
});

test('A05-E-680 조사당한 사람 화면엔 아무것도 없음 (8명 시민 화면): 밤·낮 내내 결과 창 없음 @game', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 8, seat: 'CITIZEN' });
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    // 봇 경비원이 사람을 조사함
    await playNight(g, { JOKER: null, GUARD: g.human });
    await expectPlainDay(g.page);
    expect((await logOf(g.page)).filter((e) => e.kind === 'result'), '결과 창 기록').toEqual([]);
    await expect(g.page.locator('[data-ingame-night-private-result]')).toHaveCount(0);
});

// ── 둘째 밤 죽음 (A05-E-681, 7명) ──
test('A05-E-681 둘째 밤 죽음 (7명 시민 화면): 첫 밤은 아무 일 없고, 2일 밤 암살 → 3일 낮 영상 + 글 @game', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 7, seat: 'CITIZEN' });
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await playNight(g, { JOKER: null });
    await expectPlainDay(g.page);
    const from = (await logOf(g.page)).length;
    const victim = await killNight(g, 'CITIZEN', { dayIndex: 2 });
    await expectKilled(g.page, victim.nickname, from);
    expect((await g.t.state()).dayIndex).toBe(3);
});

// ── 연출 글이 아래 입력칸·광고에 안 가려짐 (A05-E-683~684, 6명) ──
// 글 가운데가 다른 것에 안 덮이고, 글 상자가 입력칸 상자 위에서 끝남 (입력칸이 화면에 없으면 앞의 것만)
async function expectClearOfComposer(page, seenAs) {
    expect(seenAs.covered, `가린 것: ${seenAs.coveredBy}`).toBe(false);
    expect(seenAs.inViewport).toBe(true);
    const box = await talk.input(page).boundingBox({ timeout: 2000 }).catch(() => null);
    if (box) expect(seenAs.rect.y + seenAs.rect.height, '글이 입력칸 위에서 끝남').toBeLessThanOrEqual(box.y);
}

test('A05-E-683 죽음 연출 글이 아래 입력칸·광고에 안 가려짐 (6명 시민 화면) @game', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 6, seat: 'CITIZEN' });
    const victim = await killNight(g, 'CITIZEN');
    await expectClearOfComposer(g.page, await expectKilled(g.page, victim.nickname));
});

test('A05-E-684 살림 글이 아래 입력칸·광고에 안 가려짐 (6명 시민 화면) @game', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 6, seat: 'CITIZEN' });
    await savedNight(g, 'CITIZEN');
    await expectClearOfComposer(g.page, await expectSaved(g.page));
});

// ── 의사가 자기를 지켜 삶 (A05-E-685, 6명) ──
test('A05-E-685 의사 사람이 자기를 지켜 삶 (6명): 밤엔 의사 화면에 표시 없음 → 낮에 살림 글 @game', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 6, seat: 'DOCTOR' });
    // 봇 광대가 의사(사람)를 노림 → 의사는 찍힌 줄 모르고 자기 칸에서 '보호'
    await savedNight(g, 'DOCTOR', { check: (role) => expectQuietNight(g.page, role) });
    await expectSaved(g.page, [g.human.nickname]);
    expect((await g.t.player(g.human.uuid)).alive).toBe(true);
});
