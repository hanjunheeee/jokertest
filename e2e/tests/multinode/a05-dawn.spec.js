'use strict';

// 서버 2대 낮 시작 연출·5초 표시 브라우저 시험 (어려움) — 서로 다른 서버(Node)에 붙어 있던 두 사람이 한 판에서 같은 연출·같은 5초 표시를 보는지
// 목록 A05b-밤-알림-낮연출.md 번호 A05-H-527·528 (2개) — E2E_NODES=2에서만 돎, 528은 5초를 진짜로 기다림
// 판에 들어가면 서버가 사람을 판이 있는 Node로 옮김 → "다른 서버에 있던 사람"은 로비를 서로 다른 Node에서 연 사람으로 차림
const { test, expect, NODE_IDS } = require('./_mn');
const { ui } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const night = require('../ingame/b-night/_night');

// 화면 글 (frontend utils/dawnReport.js·utils/selectInGameTimebarStatusMessage.js와 같은 글)
const killedText = (nickname) => `지난밤 ${nickname}님이 살해당했습니다`;
const SETTLE_TEXT = '[5초 뒤 마감]';
const WAIT_TEXT = '진행을 기다리는 중입니다.';
// 5초 규칙 허용 폭 (±1.5초, 더 늘리지 않음)
const FIVE_MIN_MS = 3500;
const FIVE_MAX_MS = 6500;
// 시간 바를 덮는 안내 창 (확인 하나로 닫힘)
const BLOCKERS = ['내 역할 보기', '단계 전환 안내', '밤 역할 안내', '밤 조사 결과'];

const showMarks = (page) => page.locator('[data-ingame-night-success-kill], [data-ingame-dawn-report]');
// 봇·사람 → { uuid, nickname }
const P = (x) => ({ uuid: (x.account ?? x).uuid, nickname: (x.account ?? x).nickname });
const each = (humans, fn) => Promise.all(humans.map((h) => fn(h)));

/**
 * 화면 기록 심기: 연출이 뜬 때·5초 표시가 켜지고 꺼진 때를 차례대로 적음 (잠깐 떴다 사라진 것도 잡음)
 * 문서가 열릴 때마다 다시 심음
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
            // 마감이 당겨진 동안만 시간 바에 붙는 표시 → 켜짐·꺼짐을 따로 적음
            const settled = document.querySelector('[data-ingame-phase-settle]') !== null;
            if (settled !== (last.settled === true)) push(settled ? 'settleOn' : 'settleOff', '');
            last.settled = settled;
            const waiting = (document.body?.textContent || '').includes('진행을 기다리는 중입니다.');
            if (waiting && last.waiting !== true) push('wait', '');
            last.waiting = waiting;
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

/**
 * 6명 판 차리기: 서로 다른 Node 로비에 있던 사람 둘 + 봇 4, 직업은 전부 정해 줌 → 서버 직업 확인 → 역할 창 닫기
 * roles = 사람 둘의 직업, 광대 자리가 남으면 첫 봇이 광대
 * @returns {Promise<{ t:any, humans:any[], jokerBot:any|null, citizens:any[] }>} citizens = 시민 봇
 */
async function openTwoNodeGame({ onNode, table }, roles) {
    const humans = [await onNode.person(NODE_IDS[0]), await onNode.person(NODE_IDS[1])];
    for (const h of humans) await watch(h.page);
    const botJoker = !roles.includes('JOKER');
    const t = await table.setup({
        humans,
        bots: 4,
        settings: customRoleSettings({ JOKER: 1 }),
        roles: ({ humans: hs, bots }) => Object.fromEntries([
            ...hs.map((h, i) => [h.account.uuid, roles[i]]),
            ...bots.map((bot, i) => [bot.account.uuid, botJoker && i === 0 ? 'JOKER' : 'CITIZEN']),
        ]),
    });
    const s = await t.state();
    const roleOf = (uuid) => s.players.find((p) => p.uuid === uuid)?.role;
    humans.forEach((h, i) => expect(roleOf(h.account.uuid), `사람 ${i + 1} 직업이 정한 대로`).toBe(roles[i]));
    const jokerBot = t.bots.find((bot) => roleOf(bot.account.uuid) === 'JOKER') ?? null;
    expect(Boolean(jokerBot), '봇 광대 유무가 정한 대로').toBe(botJoker);
    await each(humans, (h) => ui.readRoleReveal(h.page));
    return { t, humans, jokerBot, citizens: t.bots.filter((bot) => bot !== jokerBot) };
}

/** 죽음 연출: 암살 영상이 떴고(화면 기록) 글이 사람 눈에 읽힘 */
async function expectKilled(page, nickname) {
    await waitLog(page, 'kill', 0, '낮이 될 때 암살 영상이 안 뜸');
    // 영상 아래 글, 영상이 못 틀어져 글 창으로 바뀌었으면 그 창 글
    const line = page
        .locator('[data-ingame-dawn-report-message], [data-ingame-dawn-report="KILLED"] p')
        .filter({ hasText: killedText(nickname) })
        .first();
    await expectReadable(line);
    await expect(line).toHaveText(killedText(nickname));
}

test('A05-H-527 서버 2대 — 서로 다른 서버에 있던 사람 둘 (6명): 밤엔 두 화면에 아무것도 없음 → 낮에 둘 다 영상 + 글 @game @hard @smoke', async ({ onNode, table }) => {
    test.setTimeout(240_000);
    const g = await openTwoNodeGame({ onNode, table }, ['CITIZEN', 'CITIZEN']);
    const victim = P(g.citizens.at(-1));
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    const reply = await night.botNight(g.t, g.jokerBot, victim.uuid);
    expect(reply?.ok, '봇 광대 고르기를 서버가 받음').toBe(true);
    // 두 화면이 마감 당김 표시를 받음 = 광대가 고른 뒤까지 따라옴 → 아직 밤이라 연출 흔적이 없음
    await each(g.humans, (h) => waitLog(h.page, 'settleOn'));
    for (const h of g.humans) {
        expect((await logOf(h.page)).filter((e) => ['kill', 'msg', 'report', 'wait'].includes(e.kind)), '밤 동안 연출 기록').toEqual([]);
        await expect(showMarks(h.page)).toHaveCount(0);
        await expect(h.page.getByText(WAIT_TEXT)).toHaveCount(0);
    }
    // 5초 규칙을 보는 시험이 아니라 차례는 손잡이로 닫음
    await g.t.advance();
    await each(g.humans, (h) => expectKilled(h.page, victim.nickname));
    expect((await g.t.player(victim.uuid)).alive).toBe(false);
});

test('A05-H-528 서버 2대 — 광대 사람이 고르면 다른 서버에 있던 시민 사람 화면에도 "[5초 뒤 마감]", 5±1.5초 뒤 닫힘 (6명) @game @hard @realtime', async ({ onNode, table }) => {
    test.setTimeout(240_000);
    const g = await openTwoNodeGame({ onNode, table }, ['JOKER', 'CITIZEN']);
    const [joker, citizen] = g.humans;
    const target = P(g.citizens.at(-1));
    // 밤 앞만 손잡이로, 밤에 들어간 뒤엔 진짜 5초
    await night.toNight(g.t, { dayIndex: 1 });
    await expect.poll(async () => (await g.t.state())?.nightTurnRole, { timeout: 20_000, message: '광대 차례' }).toBe('JOKER');
    // 시민 화면: 밤 안내 창이 시간 바를 덮음 → 뜬 것을 보고 닫아 둠
    await citizen.page.locator('[data-ingame-phase-entrance="NIGHT"]').waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
    await expect(async () => {
        await ui.closeOverlays(citizen.page, { names: BLOCKERS, rounds: 2, clickTimeoutMs: 1500 });
        for (const name of BLOCKERS) await expect(citizen.page.getByRole('dialog', { name, exact: true })).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 15_000 });
    const from = (await logOf(citizen.page)).length;
    await night.nightActUi(joker.page, target.nickname, '암살');
    await expectReadable(citizen.page.getByText(SETTLE_TEXT, { exact: true }).first());
    const on = await waitLog(citizen.page, 'settleOn', from, '시민 화면에 5초 표시가 안 켜짐');
    const off = await waitLog(citizen.page, 'settleOff', from, '시민 화면의 5초 표시가 안 꺼짐');
    expect(off.at - on.at, '다 고른 때부터 차례가 닫힐 때까지').toBeGreaterThanOrEqual(FIVE_MIN_MS);
    expect(off.at - on.at, '다 고른 때부터 차례가 닫힐 때까지').toBeLessThanOrEqual(FIVE_MAX_MS);
    // 닫힌 뒤 낮: 두 화면 모두 죽음 연출
    await each(g.humans, (h) => expectKilled(h.page, target.nickname));
});
