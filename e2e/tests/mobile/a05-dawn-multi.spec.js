'use strict';

// 낮 시작 연출·5초 표시 여러 사람 브라우저 시험 (모바일 + PC 섞임, 어려움) — 모바일 화면과 PC 화면이 한 판에서 같은 연출·같은 5초를 보는지 (받은 버그 5)
// 목록 A05b-밤-알림-낮연출.md 번호 A05-H-503·509·529 (3개) — 529만 5초를 진짜로 기다림 (밤에 들어간 뒤 손잡이 안 씀)
const { test, expect, ui } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const { talk, openRoster, closeRoster, rosterRowOf } = require('./_talk');
const night = require('../ingame/b-night/_night');

// 화면 글 (frontend utils/dawnReport.js·utils/selectInGameTimebarStatusMessage.js와 같은 글)
const killedText = (nickname) => `지난밤 ${nickname}님이 살해당했습니다`;
const WAIT_TEXT = '진행을 기다리는 중입니다.';
const ROLE_WORDS = /광대|귀족|시민|의사|경비원|마녀사냥꾼/; // 시민 직업 화면 이름 "귀족"과 옛 이름 "시민" 둘 다
// 5초 규칙 허용 폭 (±1.5초, 더 늘리지 않음)
const FIVE_MIN_MS = 3500;
const FIVE_MAX_MS = 6500;

// 직접 구성에 넣는 직업 (시민은 남는 자리)
const SPECIAL = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'];
// 카드 누르기를 막는 안내 창 (확인 하나로 닫힘)
const BLOCKERS = ['내 역할 보기', '단계 전환 안내', '밤 역할 안내', '밤 조사 결과'];

const showMarks = (page) => page.locator('[data-ingame-night-success-kill], [data-ingame-dawn-report]');
// 5초 글: 모바일은 위 단계 줄, PC는 펼쳐진 시간 바 머리
// 명패 글은 "[5초 뒤 마감]" (합친 뒤 명패+시간패널)
const mobileSettleLabel = (page) => talk.phaseLine(page).getByText('[5초 뒤 마감]', { exact: true });
const desktopSettleLabel = (page) => page.getByText('[5초 뒤 마감]', { exact: true }).first();
// 봇·사람 → { uuid, nickname }
const P = (x) => ({ uuid: (x.account ?? x).uuid, nickname: (x.account ?? x).nickname });
// 여러 화면에 같은 확인을 한꺼번에 (암살 영상·5초 표시가 몇 초뿐이라 차례로 보면 뒤 화면은 이미 끝나 있음)
const each = (humans, fn) => Promise.all(humans.map((h) => fn(h)));

/**
 * 화면 기록 심기: 연출이 뜬 때·5초 표시가 켜지고 꺼진 때·주소가 바뀐 때를 차례대로 적음 (PC·모바일 화면 표시 이름이 같음)
 * 문서가 열릴 때마다 다시 심어서 새로고침 뒤 기록은 새로 시작함
 */
async function watch(page) {
    const install = () => {
        if (window.__a05b) return;
        const log = [];
        window.__a05b = log;
        const last = {};
        const push = (kind, value, more = {}) => log.push({ kind, value, at: Date.now(), path: window.location.pathname, ...more });
        const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
        // 같은 요소·같은 값이면 한 번만 적음
        const seen = (kind, selector, read) => {
            const el = document.querySelector(selector);
            const value = el ? read(el) : null;
            if (el && (el !== last[kind]?.el || value !== last[kind]?.value)) push(kind, value);
            last[kind] = el ? { el, value } : null;
        };
        const scan = () => {
            seen('kill', '[data-ingame-night-success-kill]', (el) => el.querySelector('video')?.getAttribute('src') || '');
            seen('msg', '[data-ingame-dawn-report-message]', text);
            seen('report', '[data-ingame-dawn-report]', (el) => el.getAttribute('data-ingame-dawn-report'));
            // 마감이 당겨진 동안만 시간 줄에 붙는 표시 → 켜짐·꺼짐을 따로 적음
            const settled = document.querySelector('[data-ingame-phase-settle]') !== null;
            if (settled !== (last.settled === true)) push(settled ? 'settleOn' : 'settleOff', '');
            last.settled = settled;
            const waiting = (document.body?.textContent || '').includes('진행을 기다리는 중입니다.');
            if (waiting && last.waiting !== true) push('wait', '');
            last.waiting = waiting;
            // 주소가 바뀐 때 낮 시작 연출이 아직 떠 있었는지도 같이 적음 (결과 화면이 연출보다 먼저 뜨면 안 됨)
            const path = window.location.pathname;
            if (path !== last.path) {
                const showing = document.querySelector('[data-ingame-night-success-kill], [data-ingame-dawn-report]') !== null;
                push('path', path, { showing });
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

/** 화면 기록에 그 종류가 적힐 때까지 → 그 줄 */
async function waitLog(page, kind, from = 0, message = `화면 기록 ${kind}`) {
    let hit = null;
    await expect.poll(async () => {
        hit = (await logOf(page, from)).find((e) => e.kind === kind) ?? null;
        return hit !== null;
    }, { timeout: 15_000, message }).toBe(true);
    return hit;
}

/** 판 요약이 조건에 맞을 때까지 (단계를 넘기지 않음) */
async function waitState(t, match, message = '판 상태 기다림') {
    let last = null;
    await expect.poll(async () => { last = await t.state(); return Boolean(last && match(last)); }, { timeout: 20_000, message }).toBe(true);
    return last;
}

/**
 * 판 차리기 (봇 방장): 사람 여럿(모바일·PC) + 봇, 직업은 전부 정해 줌 → 서버 직업을 읽어 맞았는지 보고 역할 창을 닫음
 * roles = 사람 순서대로 직업, 봇은 남은 직업을 앞에서부터
 * @returns {Promise<{ t:any, humans:any[], cast:Record<string,any[]> }>} cast = 직업마다 봇 목록
 */
async function openGame(table, humans, { n, counts, roles }) {
    for (const h of humans) await watch(h.page);
    // 사람 몫을 뺀 나머지가 봇 직업 → 예: J1에 사람이 전부 시민이면 봇은 ['JOKER']
    const left = { ...counts };
    for (const role of roles) left[role] = (left[role] ?? 0) - 1;
    const botRoles = SPECIAL.flatMap((r) => Array(Math.max(0, left[r] ?? 0)).fill(r));
    const t = await table.setup({
        humans,
        bots: n - humans.length,
        settings: customRoleSettings(counts),
        roles: ({ humans: hs, bots }) => Object.fromEntries([
            ...hs.map((h, i) => [h.account.uuid, roles[i]]),
            ...bots.map((bot, i) => [bot.account.uuid, botRoles[i] ?? 'CITIZEN']),
        ]),
    });
    const s = await t.state();
    const roleOf = (uuid) => s.players.find((p) => p.uuid === uuid)?.role;
    humans.forEach((h, i) => expect(roleOf(h.account.uuid), `사람 ${i + 1} 직업이 정한 대로`).toBe(roles[i]));
    const cast = { JOKER: [], DOCTOR: [], GUARD: [], WITCH_HUNTER: [], CITIZEN: [] };
    for (const bot of t.bots) cast[roleOf(bot.account.uuid)].push(bot);
    for (const r of SPECIAL) expect(cast[r].length, `봇 ${r} 수가 정한 대로`).toBe(Math.max(0, left[r] ?? 0));
    await each(humans, (h) => ui.readRoleReveal(h.page));
    return { t, humans, cast };
}

/** 모바일 밤 행동: "직업 행동" 목록 시트 그 사람 줄의 '암살' (막는 안내 창은 닫으면서), 목록은 고른 뒤에도 열려 있어 닫음 */
async function pick(page, nickname, label) {
    const row = rosterRowOf(page, nickname);
    await expect(async () => {
        await ui.closeOverlays(page, { names: BLOCKERS, rounds: 2, clickTimeoutMs: 1500 });
        await openRoster(page, { timeout: 3000 });
        await expect(row).toHaveCount(1, { timeout: 1000 });
    }).toPass({ timeout: 25_000 });
    const item = row.getByRole('menuitem', { name: label, exact: true });
    await expect(item).toBeEnabled();
    await item.click();
    await closeRoster(page);
}

/** 그 직업 봇이 모두 고름 (target 없으면 건너뛰기) */
async function botsChoose(g, role, target = null) {
    for (const bot of g.cast[role]) {
        const reply = await night.botNight(g.t, bot, target ? target.uuid : null);
        expect(reply?.ok, `봇 ${role} 고르기를 서버가 받음`).toBe(true);
    }
}

/** 죽음 연출: 암살 영상이 떴고(화면 기록) 글이 사람 눈에 읽힘, 글에 직업 이름 없음 */
async function expectKilled(page, nickname) {
    await waitLog(page, 'kill', 0, '낮이 될 때 암살 영상이 안 뜸');
    // 영상 아래 글, 영상이 못 틀어져 글 창으로 바뀌었으면 그 창 글
    const line = page
        .locator('[data-ingame-dawn-report-message], [data-ingame-dawn-report="KILLED"] p')
        .filter({ hasText: killedText(nickname) })
        .first();
    await expectReadable(line);
    await expect(line).toHaveText(killedText(nickname));
    expect(await line.innerText()).not.toMatch(ROLE_WORDS);
}

/** 밤 동안 연출 흔적 없음: 기록·화면에 영상·글 창·기다림 창이 없음 */
async function expectQuietNight(page) {
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

test('A05-H-503 [버그 5] PC 2 + 모바일 3 (6명): 광대 차례가 끝난 뒤에도 밤엔 다섯 화면에 아무것도 없음 → 낮에 다섯 화면 모두 영상 + 글 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const mobiles = [user, await players.add(), await players.add()];
    const desktops = [await players.add({ mobile: false }), await players.add({ mobile: false })];
    const humans = [...mobiles, ...desktops];
    // 봇 1(방장) = 광대, PC 사람 하나 = 의사(아무것도 안 고름) → 광대 차례 뒤에 의사 차례가 있어 "아직 밤"인 때를 볼 수 있음
    const g = await openGame(table, humans, {
        n: 6, counts: { JOKER: 1, DOCTOR: 1 }, roles: ['CITIZEN', 'CITIZEN', 'CITIZEN', 'DOCTOR', 'CITIZEN'],
    });
    const victim = P(mobiles[1]);
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await botsChoose(g, 'JOKER', victim);
    // 다섯 화면이 광대 차례의 마감 당김 표시를 받음 → 차례를 닫으면 표시가 꺼짐 = 화면이 광대 차례 끝까지 따라옴
    await each(humans, (h) => waitLog(h.page, 'settleOn'));
    await g.t.advance();
    await each(humans, (h) => waitLog(h.page, 'settleOff'));
    expect((await g.t.state()).nightTurnRole, '아직 밤 (의사 차례)').toBe('DOCTOR');
    await each(humans, (h) => expectQuietNight(h.page));
    await g.t.advance();
    await each(humans, (h) => expectKilled(h.page, victim.nickname));
    expect((await g.t.player(victim.uuid)).alive).toBe(false);
});

test('A05-H-509 [임시 9] 모바일 사람 3 + 봇 3 = 6명 밤 암살로 판 끝: 세 모바일 화면 모두 연출을 보고, 연출이 끝난 뒤에야 결과 화면 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, await players.add(), await players.add()];
    const g = await openGame(table, humans, { n: 6, counts: { JOKER: 2 }, roles: ['JOKER', 'CITIZEN', 'CITIZEN'] });
    const [joker] = humans;
    const [leaver, victimBot] = g.cast.CITIZEN;
    const victim = P(victimBot);
    // 6명·광대 2는 한 명이 죽어도 2 : 3 → 낮에 시민 봇 하나가 판에서 나가 2 : 3으로 만든 뒤, 밤 암살로 2 : 2 (판 끝)
    await g.t.advanceUntil('DAY');
    expect((await leaver.request('leave_game_session', { gameId: g.t.gameId }))?.ok, '시민 봇 나가기').toBe(true);
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await botsChoose(g, 'JOKER', victim);
    await pick(joker.page, victim.nickname, '암살');
    // 사람 광대가 누른 것이 서버에 닿아 "다 골랐음" 알림이 퍼진 뒤에 차례를 닫음
    await g.t.bots[0].waitForEvent('phase_settle_started', { match: (p) => p?.role === 'JOKER' && p?.dayIndex === 1, timeoutMs: 15_000 });
    await g.t.advance();
    await each(humans, async (h) => {
        await expectKilled(h.page, victim.nickname);
        await finishShow(h.page);
        await expect(h.page).toHaveURL(/\/gameresult/, { timeout: 30_000 });
        // 기록 차례: 영상이 판 화면에서 뜸 → 결과 화면으로 넘어간 때엔 연출이 이미 닫혀 있음
        const log = await logOf(h.page);
        const kill = log.findIndex((e) => e.kind === 'kill');
        const result = log.findIndex((e) => e.kind === 'path' && e.value === '/gameresult');
        expect(log[kill].path).toBe('/ingame');
        expect(result, '결과 화면이 영상 뒤에 옴').toBeGreaterThan(kill);
        expect(log[result].showing, '결과 화면으로 갈 때 연출이 떠 있었나').toBe(false);
    });
});

test('A05-H-529 PC 광대 + 모바일 광대 (6명, 광대 2): 둘째가 고르면 두 화면 다 5초 표시, 같은 때(5±1.5초 뒤) 닫힘 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const mobile = user;
    const desktop = await players.add({ mobile: false });
    const humans = [mobile, desktop];
    const g = await openGame(table, humans, { n: 6, counts: { JOKER: 2 }, roles: ['JOKER', 'JOKER'] });
    const target = P(g.cast.CITIZEN.at(-1));
    // 밤 앞만 손잡이로, 밤에 들어간 뒤엔 진짜 5초
    await night.toNight(g.t, { dayIndex: 1 });
    await waitState(g.t, (s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER', '광대 차례');
    const marks = await each(humans, async (h) => (await logOf(h.page)).length);
    await pick(mobile.page, target.nickname, '암살');
    // 모바일 광대만 골랐을 땐 두 화면 다 5초 표시가 없음
    await expect(talk.phaseAction(mobile.page, 'nightSkip')).toBeDisabled();
    for (const [i, h] of humans.entries()) {
        expect((await logOf(h.page, marks[i])).filter((e) => e.kind === 'settleOn'), '5초 표시 기록').toEqual([]);
    }
    await night.nightActUi(desktop.page, target.nickname, '암살');
    await Promise.all([
        expectReadable(mobileSettleLabel(mobile.page)),
        expectReadable(desktopSettleLabel(desktop.page)),
    ]);
    // 화면마다 켜진 때부터 5±1.5초 뒤 꺼짐, 두 화면이 같은 때 닫힘
    const spans = await each(humans, async (h) => {
        const from = marks[humans.indexOf(h)];
        const on = await waitLog(h.page, 'settleOn', from, '5초 표시가 안 켜짐');
        const off = await waitLog(h.page, 'settleOff', from, '5초 표시가 안 꺼짐');
        return { on: on.at, off: off.at };
    });
    for (const span of spans) {
        expect(span.off - span.on, '다 고른 때부터 차례가 닫힐 때까지').toBeGreaterThanOrEqual(FIVE_MIN_MS);
        expect(span.off - span.on, '다 고른 때부터 차례가 닫힐 때까지').toBeLessThanOrEqual(FIVE_MAX_MS);
    }
    expect(Math.abs(spans[0].off - spans[1].off), '두 화면이 닫힌 때 차이').toBeLessThanOrEqual(1500);
    // 닫힌 뒤 낮: 두 화면 모두 같은 사람의 죽음 연출
    await each(humans, (h) => expectKilled(h.page, target.nickname));
});
