'use strict';

// 밤 "다 고르면 5초 뒤 차례 닫힘" 여러 사람 브라우저 시험 (PC, 어려움) — 같은 직업 사람 2명·끊김·나가기·동시에 누르기·새로고침에서 "[5초 뒤 마감]"과 진짜 5초(±1.5초)를 봄
// 목록 A05b-밤-알림-낮연출.md 번호 A05-H-512~522 (11개, 전부 @realtime) — 밤에 들어간 뒤엔 손잡이(단계 넘기기)를 안 씀
const { test, expect, ui } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const night = require('./b-night/_night');

// 화면 글 (frontend utils/selectInGameTimebarStatusMessage.js·utils/dawnReport.js·utils/reduceInGameNightPrivateResult.js와 같은 글)
const SETTLE_TEXT = '[5초 뒤 마감]';
const SAVED_TEXT = '지난밤 아무 일도 일어나지 않았습니다';
const killedText = (nickname) => `지난밤 ${nickname}님이 살해당했습니다`;
const DAY_TEXT = '낮이 되었습니다';
const investigateText = (nickname, roleName) => `조사 결과, ${nickname} 님의 역할은 ${roleName}입니다.`;
const confirmText = (nickname, roleName) => `확인 결과, ${nickname} 님의 역할은 ${roleName}입니다.`;
// 5초 규칙 허용 폭 (±1.5초, 더 늘리지 않음)
const FIVE_MIN_MS = 3500;
const FIVE_MAX_MS = 6500;

// 직접 구성에 넣는 직업 (시민은 남는 자리)
const SPECIAL = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'];
// 카드·시간 바를 막는 안내 창 (확인 하나로 닫힘)
const BLOCKERS = ['내 역할 보기', '단계 전환 안내', '밤 역할 안내', '밤 조사 결과'];

const dayEntrance = (page) => page.locator('[data-ingame-phase-entrance="DAY"]');
const showMarks = (page) => page.locator('[data-ingame-night-success-kill], [data-ingame-dawn-report]');
const privateResult = (page) => page.locator('[data-ingame-night-private-result]');
const settleLabel = (page) => page.getByText(SETTLE_TEXT, { exact: true }).first();
// 봇·사람 → { uuid, nickname }
const P = (x) => ({ uuid: (x.account ?? x).uuid, nickname: (x.account ?? x).nickname });
// 여러 화면에 같은 확인을 한꺼번에 (5초 표시·암살 영상이 몇 초뿐이라 차례로 보면 뒤 화면은 이미 끝나 있음)
const each = (humans, fn) => Promise.all(humans.map((h) => fn(h)));

/**
 * 화면 기록 심기: 5초 표시가 켜지고 꺼진 때·연출과 개인 결과가 뜬 때를 차례대로 적음 (화면 시계로 시각도 적음)
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
            seen('result', '[data-ingame-night-private-result]', text);
            // 마감이 당겨진 동안만 시간 바에 붙는 표시 → 켜짐·꺼짐을 따로 적음
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
const marksOf = (humans) => each(humans, async (h) => (await logOf(h.page)).length);

/** 판 요약이 조건에 맞을 때까지 (단계를 넘기지 않음) */
async function waitState(t, match, message = '판 상태 기다림', timeout = 20_000) {
    let last = null;
    await expect.poll(async () => { last = await t.state(); return Boolean(last && match(last)); }, { timeout, message }).toBe(true);
    return last;
}
const waitTurn = (t, role, dayIndex) => waitState(
    t, (s) => s.phase === 'NIGHT' && s.dayIndex === dayIndex && s.nightTurnRole === role, `${dayIndex}일 밤 ${role} 차례`,
);
const waitDay = (t, dayIndex) => waitState(t, (s) => s.phase === 'DAY' && s.dayIndex === dayIndex, `${dayIndex}일 낮`);

/** 사람 n명 더 열기 (계정을 하나씩 만들어 로그인) */
async function addPeople(players, n) {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await players.add());
    return out;
}

/**
 * 판 차리기 (봇 방장): 사람 여럿 + 봇, 직업은 전부 정해 줌 → 서버 직업을 읽어 맞았는지 보고 역할 창을 닫음
 * roles = 사람 순서대로 직업, 봇은 남은 직업을 앞에서부터
 * @returns {Promise<{ t:any, humans:any[], host:any, cast:Record<string,any[]> }>} cast = 직업마다 봇 목록, host = 방장 봇 (알림 받는 귀)
 */
async function openGame(table, humans, { n, counts, roles }) {
    for (const h of humans) await watch(h.page);
    // 사람 몫을 뺀 나머지가 봇 직업 → 예: J2에 사람 둘이 광대면 봇은 전부 시민
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
    return { t, humans, host: t.bots[0], cast };
}

/** 안내 창(밤이 되었습니다·○○의 시간입니다·지난 밤 결과) 닫기 — 떠 있는 동안 시간 바·카드를 덮음 */
async function tidy(page) {
    await expect(async () => {
        await ui.closeOverlays(page, { names: BLOCKERS, rounds: 2, clickTimeoutMs: 1500 });
        for (const name of BLOCKERS) await expect(page.getByRole('dialog', { name, exact: true })).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 15_000 });
}

/** 보기만 하는 사람 화면: 밤 안내 창이 뜬 것을 보고 닫아 둠 (시간 바 글을 읽으려고) */
async function tidyNight(page) {
    await page.locator('[data-ingame-phase-entrance="NIGHT"]').waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
    await tidy(page);
}

/** 그 직업 봇이 모두 고름 (target 없으면 건너뛰기) — 다 고르면 진짜 5초 뒤 차례가 닫힘 */
async function botsChoose(g, role, target = null) {
    for (const bot of g.cast[role]) {
        const reply = await night.botNight(g.t, bot, target ? target.uuid : null);
        expect(reply?.ok, `봇 ${role} 고르기를 서버가 받음`).toBe(true);
    }
}

/** 방장 봇이 받은 알림 줄들 (그 직업·그 날 것만) */
const heard = (g, event, role, dayIndex) => g.host.events.filter(
    (r) => r.event === event && r.payload?.role === role && r.payload?.dayIndex === dayIndex,
);

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

/** 화면에 "[5초 뒤 마감]"이 읽히고, 켜진 때부터 5±1.5초 뒤 꺼짐 → { on, off, ms } */
async function expectSettleShown(page, from) {
    await expectReadable(settleLabel(page));
    const span = await settleSpan(page, from);
    expectFiveSeconds(span.ms);
    return span;
}

/** 5초 표시가 아직 한 번도 안 켜짐 */
async function expectNoSettleYet(page, from) {
    expect((await logOf(page, from)).filter((e) => e.kind === 'settleOn'), '5초 표시 기록').toEqual([]);
    await expect(page.locator('[data-ingame-phase-settle]')).toHaveCount(0);
}

/** 연출 글 줄: 영상 아래 글, 영상이 못 틀어져 글 창으로 바뀌었으면 그 창 글 */
const killedLine = (page, nickname) => page
    .locator('[data-ingame-dawn-report-message], [data-ingame-dawn-report="KILLED"] p')
    .filter({ hasText: killedText(nickname) })
    .first();

/** 죽음 연출: 암살 영상이 떴고(화면 기록) 글이 사람 눈에 읽힘 */
async function expectKilled(page, nickname, from = 0) {
    await expect.poll(async () => (await logOf(page, from)).filter((e) => e.kind === 'kill').length, {
        timeout: 20_000, message: '낮이 될 때 암살 영상이 안 뜸',
    }).toBeGreaterThan(0);
    const line = killedLine(page, nickname);
    await expectReadable(line);
    await expect(line).toHaveText(killedText(nickname));
}

/** 아무 일 없음 연출(의사가 살렸든 광대가 안 죽였든 같음, 2026-11-18): 글 창의 글이 읽힘, 그 밤 영상은 없음 */
async function expectSaved(page, from = 0) {
    await expectReadable(page.locator('[data-ingame-dawn-report="QUIET"]').getByText(SAVED_TEXT, { exact: true }), { timeout: 20_000 });
    expect((await logOf(page, from)).filter((e) => e.kind === 'kill' || e.kind === 'msg'), '살림 밤엔 암살 영상이 없음').toEqual([]);
}

/** 연출 없이 낮: "낮이 되었습니다"가 읽히고, 그 밤부터 기록에 연출이 하나도 없음 */
async function expectPlainDay(page, from = 0) {
    await expectReadable(dayEntrance(page).getByText(DAY_TEXT, { exact: true }), { timeout: 20_000 });
    expect((await logOf(page, from)).filter((e) => ['kill', 'msg', 'report'].includes(e.kind)), '연출 기록').toEqual([]);
    await expect(showMarks(page)).toHaveCount(0);
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

/** 판 화면 왼쪽 위 "게임 나가기" → 확인 창 "확인" → 판 화면을 떠남 */
async function leaveGame(page) {
    await expect(async () => {
        await night.closeNotices(page);
        page.once('dialog', (dialog) => { dialog.accept().catch(() => {}); });
        await page.getByRole('button', { name: '게임 나가기' }).first().click({ timeout: 1500 });
        await expect(page).not.toHaveURL(/\/ingame/, { timeout: 3000 });
    }).toPass({ timeout: 25_000 });
}

/** 펼친 시간 바 타이머의 남은 초 (접혀 있으면 펼침 단추를 눌러 읽음) */
async function remainingSeconds(page) {
    const expand = page.getByRole('button', { name: '시간흐름바 확대' });
    const timer = page.getByRole('timer').first();
    await expect(async () => {
        if (!(await timer.isVisible().catch(() => false)) && await expand.isVisible().catch(() => false)) await expand.click({ timeout: 1000 });
        await expect(timer).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 4000 });
    const clock = (await timer.innerText()).match(/(\d+):(\d{2})/);
    return Number(clock[1]) * 60 + Number(clock[2]);
}

test('A05-H-512 광대 사람 2명 (7명, 사람 3): 첫째만 골랐을 땐 표시 없음 → 둘째가 고르는 순간 세 화면에 "[5초 뒤 마감]", 5±1.5초 뒤 닫힘 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 2))];
    const g = await openGame(table, humans, { n: 7, counts: { JOKER: 2 }, roles: ['JOKER', 'JOKER', 'CITIZEN'] });
    const [first, second, citizen] = humans;
    const target = P(g.cast.CITIZEN.at(-1));
    await night.toNight(g.t, { dayIndex: 1 });
    await waitTurn(g.t, 'JOKER', 1);
    await tidyNight(citizen.page);
    const marks = await marksOf(humans);
    await night.nightActUi(first.page, target.nickname, '암살');
    // 첫째 선택이 들어간 뒤(건너뛰기 꺼짐)에도 세 화면 어디에도 5초 표시가 없음
    await expect(night.skipButton(first.page)).toBeDisabled();
    await each(humans, (h) => expectNoSettleYet(h.page, marks[humans.indexOf(h)]));
    await night.nightActUi(second.page, target.nickname, '암살');
    const spans = await each(humans, (h) => expectSettleShown(h.page, marks[humans.indexOf(h)]));
    // 세 화면이 같은 때 닫힘
    expect(Math.max(...spans.map((s) => s.off)) - Math.min(...spans.map((s) => s.off)), '화면끼리 닫힌 때 차이').toBeLessThanOrEqual(1500);
    expect(heard(g, 'phase_settle_started', 'JOKER', 1).length, '마감 당김 알림 수').toBe(1);
});

test('A05-H-513 광대 사람 2명 (8명): 둘 다 A → 5초 안에 한 명이 B로 바꿈 → 동률이라 아무도 안 죽고 낮에 "아무 일도" 글 창 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 1))];
    const g = await openGame(table, humans, { n: 8, counts: { JOKER: 2 }, roles: ['JOKER', 'JOKER'] });
    const [stay, changer] = humans;
    const [a, b] = [P(g.cast.CITIZEN[0]), P(g.cast.CITIZEN[1])];
    await night.toNight(g.t, { dayIndex: 1 });
    await waitTurn(g.t, 'JOKER', 1);
    const marks = await marksOf(humans);
    await night.nightActUi(stay.page, a.nickname, '암살');
    await night.nightActUi(changer.page, a.nickname, '암살');
    await expectReadable(settleLabel(stay.page));
    // 5초 안에 한 명이 다른 사람으로 바꿈 (마감은 그대로)
    await night.nightActUi(changer.page, b.nickname, '암살');
    const changedAt = Date.now();
    const span = await settleSpan(stay.page, marks[0]);
    expect(changedAt, '바꾼 것이 차례가 닫히기 전').toBeLessThan(span.off);
    expectFiveSeconds(span.ms);
    await waitDay(g.t, 2);
    await each(humans, (h) => expectSaved(h.page, marks[humans.indexOf(h)]));
    expect((await g.t.state()).players.every((p) => p.alive), '아무도 안 죽음').toBe(true);
});

test('A05-H-514 광대 사람 2명 (8명): 둘 다 A → 5초 안에 둘 다 B로 바꿈 → B 죽음 연출, 마감은 안 늘어남 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 1))];
    const g = await openGame(table, humans, { n: 8, counts: { JOKER: 2 }, roles: ['JOKER', 'JOKER'] });
    const [a, b] = [P(g.cast.CITIZEN[0]), P(g.cast.CITIZEN[1])];
    await night.toNight(g.t, { dayIndex: 1 });
    await waitTurn(g.t, 'JOKER', 1);
    const marks = await marksOf(humans);
    for (const h of humans) await night.nightActUi(h.page, a.nickname, '암살');
    await expectReadable(settleLabel(humans[0].page));
    // 5초 안에 둘이 한꺼번에 B로 바꿈
    await each(humans, (h) => night.nightActUi(h.page, b.nickname, '암살'));
    const changedAt = Date.now();
    const spans = await each(humans, (h) => settleSpan(h.page, marks[humans.indexOf(h)]));
    for (const span of spans) {
        expect(changedAt, '바꾼 것이 차례가 닫히기 전').toBeLessThan(span.off);
        expectFiveSeconds(span.ms, '처음 다 고른 때부터 차례가 닫힐 때까지 (바꿔도 안 늘어남)');
    }
    expect(heard(g, 'phase_settle_started', 'JOKER', 1).length, '마감 당김 알림은 한 번').toBe(1);
    await each(humans, (h) => expectKilled(h.page, b.nickname, marks[humans.indexOf(h)]));
    expect((await g.t.player(a.uuid)).alive, '처음 고른 A는 살아 있음').toBe(true);
    expect((await g.t.player(b.uuid)).alive, '바꿔 고른 B가 죽음').toBe(false);
});

test('A05-H-515 의사 사람 2명 (10명, 의사 2): 둘 다 같은 사람을 고르면 그때부터 5±1.5초 뒤 닫힘 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 1))];
    const g = await openGame(table, humans, { n: 10, counts: { JOKER: 1, DOCTOR: 2 }, roles: ['DOCTOR', 'DOCTOR'] });
    const [first, second] = humans;
    const target = P(g.cast.CITIZEN.at(-1));
    await night.toNight(g.t, { dayIndex: 1 });
    // 광대 차례: 봇이 한 명을 노림 → 진짜 5초 뒤 의사 차례
    await waitTurn(g.t, 'JOKER', 1);
    await botsChoose(g, 'JOKER', target);
    await waitTurn(g.t, 'DOCTOR', 1);
    const marks = await marksOf(humans);
    await night.nightActUi(first.page, target.nickname, '보호');
    await expect(night.skipButton(first.page)).toBeDisabled();
    await each(humans, (h) => expectNoSettleYet(h.page, marks[humans.indexOf(h)]));
    await night.nightActUi(second.page, target.nickname, '보호');
    await each(humans, (h) => expectSettleShown(h.page, marks[humans.indexOf(h)]));
    // 의사 둘이 같은 사람(광대 대상)을 골라 살림 → 두 화면 살림 글
    await waitDay(g.t, 2);
    await each(humans, (h) => expectSaved(h.page, marks[humans.indexOf(h)]));
    expect((await g.t.player(target.uuid)).alive).toBe(true);
});

test('A05-H-516 경비원 사람 2명 (10명, 경비원 2): 둘 다 같은 사람을 고르면 5±1.5초 뒤 닫히고, 낮에 둘 다 조사 결과 글 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 1))];
    const g = await openGame(table, humans, { n: 10, counts: { JOKER: 1, GUARD: 2 }, roles: ['GUARD', 'GUARD'] });
    const [first, second] = humans;
    const target = P(g.cast.CITIZEN.at(-1));
    await night.toNight(g.t, { dayIndex: 1 });
    // 광대 차례: 봇이 건너뛰기 → 진짜 5초 뒤 경비원 차례
    await waitTurn(g.t, 'JOKER', 1);
    await botsChoose(g, 'JOKER', null);
    await waitTurn(g.t, 'GUARD', 1);
    const marks = await marksOf(humans);
    await night.nightActUi(first.page, target.nickname, '조사');
    await expect(night.skipButton(first.page)).toBeDisabled();
    await each(humans, (h) => expectNoSettleYet(h.page, marks[humans.indexOf(h)]));
    await night.nightActUi(second.page, target.nickname, '조사');
    await each(humans, (h) => expectSettleShown(h.page, marks[humans.indexOf(h)]));
    await waitDay(g.t, 2);
    await each(humans, (h) => expectReadable(
        privateResult(h.page).getByText(investigateText(target.nickname, '귀족'), { exact: true }), { timeout: 20_000 },
    ));
});

test('A05-H-517 마녀사냥꾼 사람 2명 (10명, 마녀사냥꾼 2, 둘째 밤): 둘 다 같은 죽은 사람을 고르면 5±1.5초 뒤 닫힘 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const humans = [user, ...(await addPeople(players, 1))];
    const g = await openGame(table, humans, { n: 10, counts: { JOKER: 1, WITCH_HUNTER: 2 }, roles: ['WITCH_HUNTER', 'WITCH_HUNTER'] });
    const [first, second] = humans;
    const dead = P(g.cast.CITIZEN.at(-1));
    // 첫 밤: 봇 광대가 한 명을 죽임 (진짜 5초 뒤 낮) → 두 화면 낮 연출을 닫음
    await night.toNight(g.t, { dayIndex: 1 });
    await waitTurn(g.t, 'JOKER', 1);
    await botsChoose(g, 'JOKER', dead);
    await waitDay(g.t, 2);
    await each(humans, async (h) => {
        await expectKilled(h.page, dead.nickname);
        await finishShow(h.page);
    });
    // 둘째 밤: 광대 봇은 건너뛰기 → 진짜 5초 뒤 마녀사냥꾼 차례
    await night.toNight(g.t, { dayIndex: 2 });
    await waitTurn(g.t, 'JOKER', 2);
    await botsChoose(g, 'JOKER', null);
    await waitTurn(g.t, 'WITCH_HUNTER', 2);
    const marks = await marksOf(humans);
    await night.nightActUi(first.page, dead.nickname, '확인');
    await expect(night.skipButton(first.page)).toBeDisabled();
    await each(humans, (h) => expectNoSettleYet(h.page, marks[humans.indexOf(h)]));
    await night.nightActUi(second.page, dead.nickname, '확인');
    await each(humans, (h) => expectSettleShown(h.page, marks[humans.indexOf(h)]));
    await waitDay(g.t, 3);
    await each(humans, (h) => expectReadable(
        privateResult(h.page).getByText(confirmText(dead.nickname, '귀족'), { exact: true }), { timeout: 20_000 },
    ));
});

test('A05-H-518 한 광대가 탭을 닫으면 원래 마감 (7명, 사람 2): 남은 광대가 골라도 5초 표시 없이 밤 30초 마감에 닫힘 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 1))];
    const g = await openGame(table, humans, { n: 7, counts: { JOKER: 2 }, roles: ['JOKER', 'JOKER'] });
    const [gone, stay] = humans;
    const target = P(g.cast.CITIZEN.at(-1));
    await night.toNight(g.t, { dayIndex: 1 });
    const started = await g.host.waitForEvent('night_turn_started', { match: (p) => p?.role === 'JOKER' && p?.dayIndex === 1 });
    await gone.page.close();
    // 닫힌 것이 서버에 닿음: 남은 광대 화면에서 그 사람 카드가 "연결 끊김"
    await night.expectCard(stay.page, gone.account.nickname, 'disconnected');
    const from = (await logOf(stay.page)).length;
    await night.nightActUi(stay.page, target.nickname, '암살');
    await expect(night.skipButton(stay.page)).toBeDisabled();
    // 진짜로 기다림: 원래 마감(30초)까지 — 차례 끝 알림이 마감 시각 ±1.5초에 옴
    await g.host.waitForEvent('night_turn_ended', { match: (p) => p?.role === 'JOKER' && p?.dayIndex === 1, timeoutMs: 40_000 });
    const [ended] = heard(g, 'night_turn_ended', 'JOKER', 1);
    expect(Math.abs(ended.at - started.deadline), '원래 마감과의 차이').toBeLessThanOrEqual(1500);
    // 5초 표시·마감 당김 알림은 한 번도 없음
    expect((await logOf(stay.page, from)).filter((e) => e.kind === 'settleOn'), '5초 표시 기록').toEqual([]);
    expect(heard(g, 'phase_settle_started', 'JOKER', 1), '마감 당김 알림').toEqual([]);
});

test('A05-H-519 한 광대가 "게임 나가기" (8명, 사람 2): 남은 광대는 이미 골라서 나간 때부터 5±1.5초 뒤 닫힘 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 1))];
    const g = await openGame(table, humans, { n: 8, counts: { JOKER: 2 }, roles: ['JOKER', 'JOKER'] });
    const [stay, leaver] = humans;
    const target = P(g.cast.CITIZEN.at(-1));
    await night.toNight(g.t, { dayIndex: 1 });
    await waitTurn(g.t, 'JOKER', 1);
    const from = (await logOf(stay.page)).length;
    await night.nightActUi(stay.page, target.nickname, '암살');
    await expect(night.skipButton(stay.page)).toBeDisabled();
    await expectNoSettleYet(stay.page, from);
    // 안 고른 광대가 화면 "게임 나가기" → 확인
    const leaveFrom = Date.now();
    await leaveGame(leaver.page);
    const leaveTo = Date.now();
    const span = await expectSettleShown(stay.page, from);
    // 5초는 나간 때부터 셈: 표시가 나가기를 누른 사이에 켜짐
    expect(span.on, '표시가 켜진 때 ≥ 나가기 시작').toBeGreaterThanOrEqual(leaveFrom);
    expect(span.on, '표시가 켜진 때 ≤ 나가기 끝 + 1.5초').toBeLessThanOrEqual(leaveTo + 1500);
    expect((await g.t.player(leaver.account.uuid)).isParticipating, '나간 사람은 판에서 빠짐').toBe(false);
});

test('A05-H-520 두 광대가 같은 순간 누름 (6명, 사람 2): 5초 표시 한 번, 차례도 한 번만 닫힘 @game @hard @realtime @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 1))];
    const g = await openGame(table, humans, { n: 6, counts: { JOKER: 2 }, roles: ['JOKER', 'JOKER'] });
    const target = P(g.cast.CITIZEN.at(-1));
    await night.toNight(g.t, { dayIndex: 1 });
    await waitTurn(g.t, 'JOKER', 1);
    const marks = await marksOf(humans);
    // 두 화면 모두 카드 메뉴를 열어 두고 '암살'을 한꺼번에 누름
    const menus = [];
    for (const h of humans) menus.push(await night.openCardMenu(h.page, target.nickname));
    // PC 읽기 이름은 "닉네임 암살" → 이름 끝이 '암살'인 단추로 찾음
    await Promise.all(menus.map((menu) => night.nightMenuItem(menu, '암살').click()));
    await each(humans, (h) => expectSettleShown(h.page, marks[humans.indexOf(h)]));
    await waitDay(g.t, 2);
    // 화면마다 켜짐·꺼짐이 한 번씩, 서버 알림도 한 번씩
    for (const h of humans) {
        const log = await logOf(h.page, marks[humans.indexOf(h)]);
        expect(log.filter((e) => e.kind === 'settleOn').length, '5초 표시가 켜진 수').toBe(1);
        expect(log.filter((e) => e.kind === 'settleOff').length, '5초 표시가 꺼진 수').toBe(1);
    }
    expect(heard(g, 'phase_settle_started', 'JOKER', 1).length, '마감 당김 알림 수').toBe(1);
    expect(heard(g, 'night_turn_ended', 'JOKER', 1).length, '차례 끝 알림 수').toBe(1);
    expect(g.host.events.filter((r) => r.event === 'night_result_applied').length, '밤 결과 알림 수').toBe(1);
    expect((await g.t.player(target.uuid)).alive, '둘이 같이 고른 사람이 죽음').toBe(false);
});

test('A05-H-521 5초 중 다른 사람(시민)이 새로고침 (6명, 사람 2): 새로고침한 화면의 남은 시간이 5초 이하 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 1))];
    const g = await openGame(table, humans, { n: 6, counts: { JOKER: 1 }, roles: ['JOKER', 'CITIZEN'] });
    const [joker, citizen] = humans;
    const target = P(g.cast.CITIZEN.at(-1));
    await night.toNight(g.t, { dayIndex: 1 });
    await waitTurn(g.t, 'JOKER', 1);
    await tidyNight(citizen.page);
    const from = (await logOf(citizen.page)).length;
    await night.nightActUi(joker.page, target.nickname, '암살');
    let on = null;
    await expect.poll(async () => {
        on = (await logOf(citizen.page, from)).find((e) => e.kind === 'settleOn') ?? null;
        return on !== null;
    }, { message: '시민 화면에 5초 표시가 안 켜짐' }).toBe(true);
    await citizen.page.reload();
    const seconds = await remainingSeconds(citizen.page);
    const readAt = Date.now();
    expect(seconds, '새로고침 뒤 남은 초 (원래 마감 30초가 아님)').toBeLessThanOrEqual(5);
    // 읽은 때가 아직 그 차례 안이었는지, 차례는 처음 다 고른 때부터 5±1.5초에 닫혔는지
    await g.host.waitForEvent('night_turn_ended', { match: (p) => p?.role === 'JOKER' && p?.dayIndex === 1, timeoutMs: 10_000 });
    const [ended] = heard(g, 'night_turn_ended', 'JOKER', 1);
    expect(readAt, '남은 초를 읽은 때가 차례가 닫히기 전').toBeLessThan(ended.at);
    expectFiveSeconds(ended.at - on.at, '다 고른 때부터 차례 끝 알림까지');
});

test('A05-H-522 네 직업이 다 사람인 밤 (10명, 사람 5, 둘째 밤): 차례마다 5초로 닫힘, 의사가 살림 → 다섯 화면 살림 글, 경비원·마녀사냥꾼 화면엔 결과 글 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const humans = [user, ...(await addPeople(players, 4))];
    const g = await openGame(table, humans, {
        n: 10, counts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, roles: ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'],
    });
    const [joker, doctor, guard, hunter, citizen] = humans;
    const [dead, checked, attacked] = g.cast.CITIZEN.map(P);
    // 첫 밤 (밤 안에서는 손잡이 없이, 사람이 화면으로): 광대가 한 명을 죽임 · 의사·경비원은 다른 사람을 고름 → 차례마다 진짜 5초
    await night.toNight(g.t, { dayIndex: 1 });
    await waitTurn(g.t, 'JOKER', 1);
    await night.nightActUi(joker.page, dead.nickname, '암살');
    await waitTurn(g.t, 'DOCTOR', 1);
    await night.nightActUi(doctor.page, checked.nickname, '보호');
    await waitTurn(g.t, 'GUARD', 1);
    await night.nightActUi(guard.page, checked.nickname, '조사');
    await waitDay(g.t, 2);
    // 2일 낮: 다섯 화면 죽음 연출을 닫고, 첫 밤 결과 창(경비원)·낮 안내도 닫아 둠
    await each(humans, async (h) => {
        await expectKilled(h.page, dead.nickname);
        await finishShow(h.page);
        await tidy(h.page);
    });
    // 둘째 밤: 광대 → 의사(같은 사람을 지킴) → 경비원 → 마녀사냥꾼(첫 밤에 죽은 사람) 모두 화면으로
    await night.toNight(g.t, { dayIndex: 2 });
    await waitTurn(g.t, 'JOKER', 2);
    await tidyNight(citizen.page);
    const marks = await marksOf(humans);
    await night.nightActUi(joker.page, attacked.nickname, '암살');
    await expectReadable(settleLabel(citizen.page));
    await waitTurn(g.t, 'DOCTOR', 2);
    await night.nightActUi(doctor.page, attacked.nickname, '보호');
    await waitTurn(g.t, 'GUARD', 2);
    await night.nightActUi(guard.page, checked.nickname, '조사');
    await waitTurn(g.t, 'WITCH_HUNTER', 2);
    await night.nightActUi(hunter.page, dead.nickname, '확인');
    await waitDay(g.t, 3);
    // 시민 화면 기록: 5초 표시가 차례마다 한 번씩 네 번, 켜진 때부터 5±1.5초 뒤 꺼짐
    const log = await logOf(citizen.page, marks[4]);
    const ons = log.filter((e) => e.kind === 'settleOn');
    const offs = log.filter((e) => e.kind === 'settleOff');
    expect(ons.length, '5초 표시가 켜진 수 (광대·의사·경비원·마녀사냥꾼)').toBe(4);
    expect(offs.length, '5초 표시가 꺼진 수').toBe(4);
    ons.forEach((on, i) => expectFiveSeconds(offs[i].at - on.at, `${i + 1}번째 차례가 닫힐 때까지`));
    // 다섯 화면 살림 글
    await each(humans, (h) => expectSaved(h.page, marks[humans.indexOf(h)]));
    expect((await g.t.player(attacked.uuid)).alive).toBe(true);
    // 경비원·마녀사냥꾼 화면: 살림 글 창을 닫으면 결과 글
    await finishShow(guard.page);
    await expectReadable(privateResult(guard.page).getByText(investigateText(checked.nickname, '귀족'), { exact: true }));
    await finishShow(hunter.page);
    await expectReadable(privateResult(hunter.page).getByText(confirmText(dead.nickname, '귀족'), { exact: true }));
    // 의사·시민 화면: 살림 글 창을 닫으면 바로 "낮이 되었습니다", 결과 창은 그 밤에 한 번도 없음
    for (const h of [doctor, citizen]) {
        await finishShow(h.page);
        await expectReadable(dayEntrance(h.page).getByText(DAY_TEXT, { exact: true }));
        expect((await logOf(h.page, marks[humans.indexOf(h)])).filter((e) => e.kind === 'result'), '결과 창 기록').toEqual([]);
    }
});
