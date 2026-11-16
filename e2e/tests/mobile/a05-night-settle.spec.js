'use strict';

// 밤 "다 고르면 5초 뒤 차례 닫힘" 모바일 브라우저 시험 — 단계 줄 "5초 뒤 마감" 글이 읽히는지, 진짜 5초(±1.5초) 뒤 닫히는지, "밤 종료" 단추가 없는지
// 목록 A05b-밤-알림-낮연출.md 번호 A05-E-663~678·682 (17개) — @realtime 시험은 밤에 들어간 뒤 손잡이(단계 넘기기)를 안 씀
const { test, expect, ui } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const { sleep } = require('../../helpers/wait');
const { talk } = require('./_talk');
const night = require('../ingame/b-night/_night');

const SETTLE_TEXT = '5초 뒤 마감';
const killedText = (nickname) => `지난밤 ${nickname}님이 살해당했습니다`;
// 5초 규칙 허용 폭 (±1.5초, 더 늘리지 않음)
const FIVE_MIN_MS = 3500;
const FIVE_MAX_MS = 6500;

// 밤 차례 순서·직접 구성에 넣는 직업
const ORDER = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'];
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
// 카드 누르기·단계 줄을 막는 안내 창 (확인 하나로 닫힘)
const BLOCKERS = ['내 역할 보기', '단계 전환 안내', '밤 역할 안내', '밤 조사 결과'];

const settleLabel = (page) => talk.phaseLine(page).getByText(SETTLE_TEXT, { exact: true });
const showMarks = (page) => page.locator('[data-ingame-night-success-kill], [data-ingame-dawn-report]');
// 봇·사람 → { uuid, nickname }
const P = (x) => ({ uuid: (x.account ?? x).uuid, nickname: (x.account ?? x).nickname });

/**
 * 화면 기록 심기: 5초 표시가 켜지고 꺼진 때·연출이 뜬 때를 차례대로 적음 (화면 시계로 시각도 적음)
 * 문서가 열릴 때마다 다시 심어서 새로고침 뒤 기록은 새로 시작함
 */
async function watch(page) {
    const install = () => {
        if (window.__a05b) return;
        const log = [];
        window.__a05b = log;
        const last = {};
        const push = (kind, value) => log.push({ kind, value, at: Date.now(), path: window.location.pathname });
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
const waitTurn = (t, role, dayIndex) => waitState(
    t, (s) => s.phase === 'NIGHT' && s.dayIndex === dayIndex && s.nightTurnRole === role, `${dayIndex}일 밤 ${role} 차례`,
);

/**
 * 판 차리기: 모바일 사람 1명 + 봇, 직업은 전부 정해 줌 → 서버 직업을 읽어 맞았는지 보고 역할 창을 닫음
 * @returns {Promise<{ t:any, page:any, role:string, human:{uuid:string,nickname:string}, cast:Record<string,any[]> }>} cast = 직업마다 봇 목록
 */
async function openGame({ user, table }, { n, role, counts = COUNTS[n] }) {
    const page = user.page;
    await watch(page);
    // 사람 몫 하나를 뺀 나머지가 봇 직업 → 예: 6명 의사면 봇은 ['JOKER'] + 시민 4
    const left = { ...counts, [role]: (counts[role] ?? 0) - 1 };
    const botRoles = ORDER.flatMap((r) => Array(Math.max(0, left[r] ?? 0)).fill(r));
    const t = await table.setup({
        humans: [user],
        bots: n - 1,
        settings: customRoleSettings(counts),
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
    for (const r of ORDER) expect(cast[r].length, `봇 ${r} 수가 정한 대로`).toBe(Math.max(0, left[r] ?? 0));
    await ui.readRoleReveal(page);
    return { t, page, role, human: P(user), cast };
}

/** 안내 창(밤이 되었습니다·○○의 시간입니다) 닫기 — 떠 있는 동안 단계 줄·카드를 덮음 */
async function tidy(page) {
    await expect(async () => {
        await ui.closeOverlays(page, { names: BLOCKERS, rounds: 2, clickTimeoutMs: 1500 });
        for (const name of BLOCKERS) await expect(page.getByRole('dialog', { name, exact: true })).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 15_000 });
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

/** 열린 카드 시트에서 행동 누름 → 누른 시각(ms) */
async function choose(menu, label) {
    const item = menu.getByRole('menuitem', { name: label, exact: true });
    await expect(item).toBeEnabled();
    const clickedAt = Date.now();
    await item.click();
    await expect(menu).toBeHidden();
    return clickedAt;
}

/** 모바일 밤 행동: 초상 띠 칸 → 카드 시트의 '암살'·'보호'·'조사'·'확인' → 누른 시각(ms) */
async function pick(page, slot, label) {
    return choose(await openMenu(page, slot), label);
}

/** 내 밤 차례를 화면 "건너뛰기"로 넘김 */
async function skipTurn(page) {
    const skip = talk.phaseAction(page, 'nightSkip');
    await expect(async () => {
        await ui.closeOverlays(page, { names: BLOCKERS, rounds: 2, clickTimeoutMs: 1500 });
        await expect(skip).toBeEnabled({ timeout: 1000 });
        await skip.click({ timeout: 1000 });
    }).toPass({ timeout: 25_000 });
}

/** 그 직업 봇이 모두 고름 (target 없으면 건너뛰기) */
async function botsChoose(g, role, target = null) {
    for (const bot of g.cast[role]) {
        const reply = await night.botNight(g.t, bot, target ? target.uuid : null);
        expect(reply?.ok, `봇 ${role} 고르기를 서버가 받음`).toBe(true);
    }
}

/**
 * 그 밤 차례를 순서대로 지나감 (손잡이 없음): 차례마다 봇이 plan대로(없으면 건너뛰기) 내고 진짜 5초 뒤 닫히길 기다림
 * until 직업 차례가 열리면 멈춤, until이 없으면 밤 끝까지 가고 사람 차례는 화면 "건너뛰기"
 */
async function walkNight(g, dayIndex, { until = null, plan = {} } = {}) {
    for (const role of ORDER) {
        if (role === until) break;
        const humanTurn = g.role === role;
        // 구성에 없는 직업은 차례가 없음, 마녀사냥꾼은 첫 밤 차례 없음
        if (g.cast[role].length === 0 && !humanTurn) continue;
        if (role === 'WITCH_HUNTER' && dayIndex === 1) continue;
        await waitTurn(g.t, role, dayIndex);
        await botsChoose(g, role, plan[role] ?? null);
        if (humanTurn) await skipTurn(g.page);
    }
}

/** 그 밤 사람 차례까지: 밤 앞(역할 확인·낮)만 손잡이로 넘기고, 밤에 들어간 뒤엔 앞 차례가 진짜 5초로 닫히길 기다림 */
async function reachTurn(g, role, dayIndex) {
    await night.toNight(g.t, { dayIndex });
    await walkNight(g, dayIndex, { until: role });
    return waitTurn(g.t, role, dayIndex);
}

/** 손잡이 없이 밤 하나를 끝까지 → 다음 날 낮 */
async function passNight(g, dayIndex, plan = {}) {
    await night.toNight(g.t, { dayIndex });
    await walkNight(g, dayIndex, { plan });
    return waitState(g.t, (s) => s.phase === 'DAY' && s.dayIndex === dayIndex + 1, `${dayIndex + 1}일 낮`);
}

/** 5초 표시가 켜진 때·꺼진 때 (화면 기록에서 from 뒤 첫 짝) → { on, off, ms } */
async function settleSpan(page, from = 0) {
    let on = null;
    let off = null;
    await expect.poll(async () => {
        const log = await logOf(page, from);
        on = log.find((e) => e.kind === 'settleOn') ?? null;
        off = on ? log.find((e) => e.kind === 'settleOff' && e.at >= on.at) ?? null : null;
        return Boolean(on && off);
    }, { timeout: 12_000, message: '5초 표시가 켜졌다 꺼지지 않음' }).toBe(true);
    return { on: on.at, off: off.at, ms: off.at - on.at };
}

/** 5초 ±1.5초 */
function expectFiveSeconds(ms, message = '다 고른 때부터 차례가 닫힐 때까지') {
    expect(ms, message).toBeGreaterThanOrEqual(FIVE_MIN_MS);
    expect(ms, message).toBeLessThanOrEqual(FIVE_MAX_MS);
}

/** 5초 표시가 아직 한 번도 안 켜짐 */
async function expectNoSettleYet(page, from) {
    expect((await logOf(page, from)).filter((e) => e.kind === 'settleOn'), '5초 표시 기록').toEqual([]);
    await expect(talk.phaseLine(page)).not.toContainText(SETTLE_TEXT);
}

/** 밤에 죽은 사람이 있던 낮의 연출 닫기: 뜰 때까지 기다린 뒤, 영상은 끝날 때까지(막히면 건너뛰기)·글 창은 확인 */
async function finishShow(page) {
    await expect.poll(async () => (await logOf(page)).filter((e) => e.kind === 'kill').length, {
        timeout: 20_000, message: '낮 시작 연출이 안 뜸',
    }).toBeGreaterThan(0);
    await expect(async () => {
        const confirm = page.locator('[data-ingame-dawn-report]').getByRole('button', { name: '확인' });
        if (await confirm.isVisible().catch(() => false)) await confirm.click({ timeout: 1000 }).catch(() => {});
        const skip = page.locator('[data-ingame-night-success-kill]').getByRole('button', { name: '건너뛰기' });
        if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
        await expect(showMarks(page)).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 30_000 });
}

// ── 사람이 고르면 5초 뒤 다음 차례 (A05-E-663~666) ──
const SOLO_CASES = [
    { no: 663, role: 'JOKER', n: 5, dayIndex: 1 },
    { no: 664, role: 'DOCTOR', n: 6, dayIndex: 1 },
    { no: 665, role: 'GUARD', n: 8, dayIndex: 1 },
    { no: 666, role: 'WITCH_HUNTER', n: 10, dayIndex: 2 },
];
for (const c of SOLO_CASES) {
    const when = c.dayIndex === 2 ? ' 둘째 밤' : '';
    test(`A05-E-${c.no} ${ui.ROLE_LABELS[c.role]} 사람 ${c.n}명${when}: 고른 직후 "${SETTLE_TEXT}"가 읽힘 → 5±1.5초 뒤 차례가 닫힘 @game @realtime${c.no === 663 ? ' @safari' : ''}`, async ({ user, table }) => {
        test.setTimeout(240_000);
        const g = await openGame({ user, table }, c);
        const target = P(g.cast.CITIZEN.at(-1));
        if (c.dayIndex === 2) {
            // 첫 밤: 봇 광대가 한 명을 죽여 둠 (마녀사냥꾼이 확인할 죽은 사람), 낮 연출은 닫음
            await passNight(g, 1, { JOKER: target });
            await finishShow(g.page);
        }
        await reachTurn(g, c.role, c.dayIndex);
        const from = (await logOf(g.page)).length;
        const clickedAt = await pick(g.page, talk.slot(g.page, target.nickname), ACTION[c.role]);
        await expectReadable(settleLabel(g.page));
        const span = await settleSpan(g.page, from);
        expect(span.on - clickedAt, '고른 직후 표시가 켜짐').toBeLessThanOrEqual(1500);
        expectFiveSeconds(span.ms);
        // 그 차례가 닫히고 다음으로 넘어감
        await waitState(g.t, (s) => !(s.phase === 'NIGHT' && s.dayIndex === c.dayIndex && s.nightTurnRole === c.role), '차례 닫힘');
        await expect(talk.phaseLine(g.page)).not.toContainText(SETTLE_TEXT);
    });
}

test(`A05-E-667 광대 사람 + 봇 동료 (6명, 광대 2): 봇이 나중에 고른 때부터 5±1.5초 @game @realtime`, async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 6, role: 'JOKER', counts: { JOKER: 2 } });
    const target = P(g.cast.CITIZEN.at(-1));
    await reachTurn(g, 'JOKER', 1);
    const from = (await logOf(g.page)).length;
    await pick(g.page, talk.slot(g.page, target.nickname), '암살');
    // 내 선택이 들어간 뒤(건너뛰기 꺼짐)에도 동료가 안 골라서 5초 표시가 없음
    await expect(talk.phaseAction(g.page, 'nightSkip')).toBeDisabled();
    await expectNoSettleYet(g.page, from);
    const allyAt = Date.now();
    await botsChoose(g, 'JOKER', target);
    await expectReadable(settleLabel(g.page));
    const span = await settleSpan(g.page, from);
    expect(span.on - allyAt, '동료가 고른 직후 표시가 켜짐').toBeLessThanOrEqual(1500);
    expectFiveSeconds(span.off - allyAt, '둘째가 고른 때부터 차례가 닫힐 때까지');
});

test('A05-E-668 남은 시간이 5초보다 짧을 때 고르면 (5명, 밤 30초): 5초 표시 없이 원래 마감에 닫힘 @game @realtime', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 5, role: 'JOKER' });
    const target = P(g.cast.CITIZEN.at(-1));
    const host = g.t.bots[0];
    await reachTurn(g, 'JOKER', 1);
    const started = await host.waitForEvent('night_turn_started', { match: (p) => p?.role === 'JOKER' && p?.dayIndex === 1 });
    const from = (await logOf(g.page)).length;
    await tidy(g.page);
    // 진짜로 기다림: 남은 4.5초에 카드 시트를 열고 남은 3초에 누름 (30초 차례)
    await sleep(Math.max(0, started.deadline - 4500 - Date.now()));
    const menu = await openMenu(g.page, talk.slot(g.page, target.nickname));
    await sleep(Math.max(0, started.deadline - 3000 - Date.now()));
    const clickedAt = await choose(menu, '암살');
    expect(started.deadline - clickedAt, '누른 때 남은 시간이 5초보다 짧음').toBeLessThan(5000);
    // 원래 마감에 닫힘: 차례 끝 알림이 마감 시각 ±1.5초에 옴
    await host.waitForEvent('night_turn_ended', { match: (p) => p?.role === 'JOKER' && p?.dayIndex === 1, timeoutMs: 10_000 });
    const ended = host.events.find((r) => r.event === 'night_turn_ended' && r.payload?.role === 'JOKER' && r.payload?.dayIndex === 1);
    expect(Math.abs(ended.at - started.deadline), '원래 마감과의 차이').toBeLessThanOrEqual(1500);
    // 5초 표시는 한 번도 안 뜸
    expect((await logOf(g.page, from)).filter((e) => e.kind === 'settleOn'), '5초 표시 기록').toEqual([]);
    expect(host.events.filter((r) => r.event === 'phase_settle_started'), '마감 당김 알림').toEqual([]);
});

test('A05-E-669 5초 안에 대상을 바꾸면 바꾼 사람이 죽음 (6명): A → B → 낮 연출 글에 B 닉네임 @game @realtime', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 6, role: 'JOKER' });
    const [a, b] = [P(g.cast.CITIZEN[0]), P(g.cast.CITIZEN[1])];
    await reachTurn(g, 'JOKER', 1);
    await pick(g.page, talk.slot(g.page, a.nickname), '암살');
    await expectReadable(settleLabel(g.page));
    await pick(g.page, talk.slot(g.page, b.nickname), '암살');
    // 광대 차례가 진짜 5초 뒤 닫힘 → 의사 차례는 봇이 건너뛰기 → 다시 5초 뒤 낮
    await waitTurn(g.t, 'DOCTOR', 1);
    await botsChoose(g, 'DOCTOR');
    await waitState(g.t, (s) => s.phase === 'DAY' && s.dayIndex === 2, '2일 낮');
    await expect.poll(async () => (await logOf(g.page)).filter((e) => e.kind === 'kill').length, { timeout: 20_000, message: '암살 영상이 안 뜸' }).toBeGreaterThan(0);
    const line = g.page.locator('[data-ingame-dawn-report-message], [data-ingame-dawn-report="KILLED"] p').filter({ hasText: killedText(b.nickname) }).first();
    await expectReadable(line);
    await expect(line).toHaveText(killedText(b.nickname));
    expect((await g.t.player(a.uuid)).alive, '처음 고른 A는 살아 있음').toBe(true);
    expect((await g.t.player(b.uuid)).alive, '바꿔 고른 B가 죽음').toBe(false);
});

test('A05-E-670 봇 동료 광대가 나가서 다 참 (8명, 광대 2): 나간 때부터 5±1.5초 @game @realtime', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 8, role: 'JOKER', counts: { JOKER: 2 } });
    const target = P(g.cast.CITIZEN.at(-1));
    const ally = g.cast.JOKER[0];
    await reachTurn(g, 'JOKER', 1);
    const from = (await logOf(g.page)).length;
    await pick(g.page, talk.slot(g.page, target.nickname), '암살');
    await expect(talk.phaseAction(g.page, 'nightSkip')).toBeDisabled();
    await expectNoSettleYet(g.page, from);
    // 안 고른 동료가 판에서 나감 → 남은 광대(사람)는 이미 골라서 다 참
    const leftAt = Date.now();
    expect((await ally.request('leave_game_session', { gameId: g.t.gameId }))?.ok).toBe(true);
    await expectReadable(settleLabel(g.page));
    const span = await settleSpan(g.page, from);
    expect(span.on - leftAt, '나간 직후 표시가 켜짐').toBeLessThanOrEqual(1500);
    expectFiveSeconds(span.off - leftAt, '동료가 나간 때부터 차례가 닫힐 때까지');
});

test(`A05-E-671 시민 화면에도 "${SETTLE_TEXT}"가 읽힘 (6명): 봇 광대가 고르면 5±1.5초 동안 보임 @game @realtime`, async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 6, role: 'CITIZEN' });
    const target = P(g.cast.CITIZEN.at(-1));
    await reachTurn(g, 'JOKER', 1);
    // 밤 안내 창이 단계 줄을 덮음 → 뜬 것을 보고 닫아 둠
    await g.page.locator('[data-ingame-phase-entrance="NIGHT"]').waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
    await tidy(g.page);
    const from = (await logOf(g.page)).length;
    await botsChoose(g, 'JOKER', target);
    await expectReadable(settleLabel(g.page));
    expectFiveSeconds((await settleSpan(g.page, from)).ms);
});

// 세로 폰도 당김 5초 동안은 접어 둔 진행 바가 저절로 펼쳐짐 (사용자 결정 2026-11-16 아침 8, frontend-mobile TalkLayout.jsx)
test(`A05-E-672 접어 둔 시간 줄이 다 고르면 저절로 펼쳐지고 "${SETTLE_TEXT}"가 보임 (5명) @game @realtime`, async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 5, role: 'JOKER' });
    const target = P(g.cast.CITIZEN.at(-1));
    await reachTurn(g, 'JOKER', 1);
    await tidy(g.page);
    // 진행 바를 한 번도 안 펼침 (접힌 채)
    await expect(talk.phaseLine(g.page)).toHaveAttribute('aria-expanded', 'false');
    await expect(talk.timebarSlot(g.page)).toBeHidden();
    await expect(talk.phaseLine(g.page)).not.toContainText(SETTLE_TEXT);
    await pick(g.page, talk.slot(g.page, target.nickname), '암살');
    await expectReadable(settleLabel(g.page));
    await expect(g.page.locator('[data-ingame-phase-settle]')).toHaveCount(1);
    // 한 번도 안 펼쳤던 진행 바가 펼쳐져 보임 (단계 줄도 "펼침"으로 읽힘)
    await expect(talk.phaseLine(g.page)).toHaveAttribute('aria-expanded', 'true');
    await expect(talk.timebarSlot(g.page)).toBeVisible();
});

test('A05-E-673 5초 중 새로고침 (6명): 고르고 1초 뒤 새로고침 → 남은 시간이 5초 이하로 보임 @game @realtime', async ({ user, table }) => {
    const g = await openGame({ user, table }, { n: 6, role: 'JOKER' });
    const target = P(g.cast.CITIZEN.at(-1));
    const host = g.t.bots[0];
    await reachTurn(g, 'JOKER', 1);
    const from = (await logOf(g.page)).length;
    await pick(g.page, talk.slot(g.page, target.nickname), '암살');
    let on = null;
    await expect.poll(async () => {
        on = (await logOf(g.page, from)).find((e) => e.kind === 'settleOn') ?? null;
        return on !== null;
    }, { message: '5초 표시가 안 켜짐' }).toBe(true);
    // 진짜로 기다림: 고르고 1초 뒤
    await sleep(Math.max(0, on.at + 1000 - Date.now()));
    await g.page.reload();
    // 단계 줄 "제 1일 · 밤 광대 0:03" → 아직 광대 차례이고 남은 초가 5 이하 (원래 마감 30초까지 안 감)
    await expect(talk.phaseLine(g.page)).toContainText(/\d+:\d{2}/, { timeout: 4000 });
    const shown = await talk.phaseLine(g.page).innerText();
    const clock = shown.match(/(\d+):(\d{2})/);
    expect(shown, '아직 광대 차례 글(다시 뜬 5초 글도 됨)').toMatch(/광대|5초 뒤 마감/);
    expect(Number(clock[1]) * 60 + Number(clock[2]), `단계 줄 "${shown.replace(/\s+/g, ' ')}"의 남은 초`).toBeLessThanOrEqual(5);
    // 새로고침해도 차례는 처음 고른 때부터 5±1.5초에 닫힘
    await host.waitForEvent('night_turn_ended', { match: (p) => p?.role === 'JOKER' && p?.dayIndex === 1, timeoutMs: 10_000 });
    const ended = host.events.find((r) => r.event === 'night_turn_ended' && r.payload?.role === 'JOKER' && r.payload?.dayIndex === 1);
    expectFiveSeconds(ended.at - on.at, '다 고른 때부터 차례 끝 알림까지');
});

// ── "밤 종료" 단추 없음 (A05-E-674~678) — 5초 규칙을 보는 시험이 아니라 밤 차례는 손잡이로 넘김 ──
const NO_END_CASES = [
    { no: 674, role: 'JOKER', n: 5, dayIndex: 1 },
    { no: 675, role: 'DOCTOR', n: 6, dayIndex: 1 },
    { no: 676, role: 'GUARD', n: 8, dayIndex: 1 },
    { no: 677, role: 'WITCH_HUNTER', n: 10, dayIndex: 2 },
    { no: 678, role: 'CITIZEN', n: 6, dayIndex: 1 },
];
for (const c of NO_END_CASES) {
    const when = c.dayIndex === 2 ? ' 둘째 밤' : '';
    const tags = `@game${c.no === 674 ? ' @safari @smoke' : ''}`;
    test(`A05-E-${c.no} ${ui.ROLE_LABELS[c.role]} 사람 ${c.n}명${when}: 조작 줄·카드 메뉴 어디에도 "밤 종료" 단추 없음 ${tags}`, async ({ user, table }) => {
        const g = await openGame({ user, table }, c);
        const target = P(g.cast.CITIZEN.at(-1));
        const actor = c.role !== 'CITIZEN';
        if (c.dayIndex === 2) {
            // 첫 밤에 봇 광대가 한 명을 죽여 둠 (마녀사냥꾼 카드 메뉴가 열리는 죽은 사람)
            await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
            await botsChoose(g, 'JOKER', target);
            await night.toDay(g.t, { dayIndex: 2 });
            await finishShow(g.page);
        }
        // 사람 차례(시민은 광대 차례)까지
        await night.toTurn(g.t, actor ? c.role : 'JOKER', { dayIndex: c.dayIndex });
        await g.page.locator('[data-ingame-phase-entrance="NIGHT"]').waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
        await tidy(g.page);
        await expect(talk.phaseLine(g.page)).toContainText(`밤 ${ui.ROLE_LABELS[actor ? c.role : 'JOKER']}`);
        // 내 차례면 조작 줄에 "건너뛰기"는 있음 (조작 줄이 그려진 것 확인)
        if (actor) await expect(talk.phaseAction(g.page, 'nightSkip')).toBeVisible();
        await expect(talk.actionRow(g.page)).toBeVisible();
        await expect(talk.actionRow(g.page)).not.toContainText('밤 종료');
        await expect(g.page.getByRole('button', { name: /밤 종료/ })).toHaveCount(0);
        if (actor) {
            const menu = await openMenu(g.page, talk.slot(g.page, target.nickname));
            await expect(menu.getByRole('menuitem', { name: ACTION[c.role], exact: true })).toBeVisible();
            await expect(menu.getByRole('menuitem', { name: /밤 종료/ })).toHaveCount(0);
        }
        await expect(g.page.getByText('밤 종료')).toHaveCount(0);
    });
}

test('A05-E-682 둘째 밤에도 5초 (7명 광대 사람): 2일 밤 고른 때부터 5±1.5초 뒤 차례가 닫힘 @game @realtime', async ({ user, table }) => {
    test.setTimeout(240_000);
    const g = await openGame({ user, table }, { n: 7, role: 'JOKER' });
    const target = P(g.cast.CITIZEN.at(-1));
    // 첫 밤: 사람 광대는 화면 건너뛰기, 봇 의사도 건너뛰기 (손잡이 없이 5초씩)
    await passNight(g, 1);
    await reachTurn(g, 'JOKER', 2);
    const from = (await logOf(g.page)).length;
    await pick(g.page, talk.slot(g.page, target.nickname), '암살');
    await expectReadable(settleLabel(g.page));
    const span = await settleSpan(g.page, from);
    expectFiveSeconds(span.ms);
    await waitState(g.t, (s) => !(s.phase === 'NIGHT' && s.dayIndex === 2 && s.nightTurnRole === 'JOKER'), '2일 밤 광대 차례 닫힘');
});
