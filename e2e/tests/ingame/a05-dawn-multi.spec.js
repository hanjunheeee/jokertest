'use strict';

// 낮 시작 연출 여러 사람 브라우저 시험 (PC, 어려움) — 한 판의 여러 화면이 밤엔 아무것도 안 보고 낮이 될 때 똑같은 연출을 보는지, 개인 결과는 쓴 사람 화면에만 뜨는지 (받은 버그 5)
// 목록 A05b-밤-알림-낮연출.md 번호 A05-H-501·502·504~508·510·511·523~526·530 (14개) — 5초 규칙을 보는 것(526)과 60초를 보는 것(511·530)만 진짜로 기다림
const { test, expect, ui, e2e } = require('../../helpers/fixtures');
const { customRoleSettings, Table } = require('../../helpers/game');
const { expectReadable } = require('../../helpers/visible');
const { sleep } = require('../../helpers/wait');
const { hostGame, waitResult } = require('../room/roomHelpers');
const night = require('./b-night/_night');
const day = require('./a-day/_lib');

// 화면 글 (frontend utils/dawnReport.js·constants/ingamePhaseEntrance.js·utils/reduceInGameNightPrivateResult.js와 같은 글)
const SAVED_TEXT = '지난밤 의사가 공격받은 사람을 살려냈습니다';
const killedText = (nickname) => `지난밤 ${nickname}님이 살해당했습니다`;
const DAY_TEXT = '낮이 되었습니다';
const WAIT_TEXT = '진행을 기다리는 중입니다.';
const FAIL_TEXT = '이번 밤의 암살이 실패했습니다.';
const SETTLE_TEXT = '[5초 뒤 마감]';
const investigateText = (nickname, roleName) => `조사 결과, ${nickname} 님의 역할은 ${roleName}입니다.`;
const confirmText = (nickname, roleName) => `확인 결과, ${nickname} 님의 역할은 ${roleName}입니다.`;
const ROLE_WORDS = /광대|귀족|시민|의사|경비원|마녀사냥꾼/; // 시민 직업 화면 이름 "귀족"과 옛 이름 "시민" 둘 다
// 5초·60초 규칙 허용 폭 (±1.5초, 더 늘리지 않음)
const TOLERANCE_MS = 1500;

// 직접 구성에 넣는 직업 (시민은 남는 자리)
const SPECIAL = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'];
// 카드를 막는 안내 창 (확인 하나로 닫힘)
const BLOCKERS = ['내 역할 보기', '단계 전환 안내', '밤 역할 안내', '밤 조사 결과'];

const dayEntrance = (page) => page.locator('[data-ingame-phase-entrance="DAY"]');
const showMarks = (page) => page.locator('[data-ingame-night-success-kill], [data-ingame-dawn-report]');
const privateResult = (page) => page.locator('[data-ingame-night-private-result]');
const settleLabel = (page) => page.getByText(SETTLE_TEXT, { exact: true }).first();
// 봇·사람 → { uuid, nickname }
const P = (x) => ({ uuid: (x.account ?? x).uuid, nickname: (x.account ?? x).nickname });
// 여러 화면에 같은 확인을 한꺼번에 (암살 영상이 5초쯤이라 차례로 보면 뒤 화면은 이미 끝나 있음)
const each = (humans, fn) => Promise.all(humans.map((h) => fn(h)));

/**
 * 화면 기록 심기: 연출·안내 창·개인 결과·5초 표시가 뜨고 꺼진 때, 주소가 바뀐 때를 차례대로 적음 (잠깐 떴다 사라진 것도 잡음)
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
            seen('entrance', '[data-ingame-phase-entrance]', (el) => el.getAttribute('data-ingame-phase-entrance'));
            seen('result', '[data-ingame-night-private-result]', text);
            // 마감이 당겨진 동안만 시간 바에 붙는 표시 → 켜짐·꺼짐을 따로 적음
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

/** 사람 n명 더 열기 (계정을 하나씩 만들어 로그인) */
async function addPeople(players, n) {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(await players.add());
    return out;
}

/** 서버 직업이 정한 대로인지 보고, 봇을 직업마다 나눠 담고, 사람마다 역할 창을 닫음 */
async function settleRoles(t, humans, roles, botCounts) {
    const s = await t.state();
    const roleOf = (uuid) => s.players.find((p) => p.uuid === uuid)?.role;
    humans.forEach((h, i) => expect(roleOf(h.account.uuid), `사람 ${i + 1} 직업이 정한 대로`).toBe(roles[i]));
    const cast = { JOKER: [], DOCTOR: [], GUARD: [], WITCH_HUNTER: [], CITIZEN: [] };
    for (const bot of t.bots) cast[roleOf(bot.account.uuid)].push(bot);
    for (const r of SPECIAL) expect(cast[r].length, `봇 ${r} 수가 정한 대로`).toBe(Math.max(0, botCounts[r] ?? 0));
    await each(humans, (h) => ui.readRoleReveal(h.page));
    return { t, humans, cast };
}

/**
 * 판 차리기 (봇 방장): 사람 여럿 + 봇, 직업은 전부 정해 줌 — roles = 사람 순서대로 직업, 봇은 남은 직업을 앞에서부터
 * @returns {Promise<{ t:any, humans:any[], cast:Record<string,any[]> }>} cast = 직업마다 봇 목록
 */
async function openGame(table, humans, { n, counts, roles, extra = {} }) {
    for (const h of humans) await watch(h.page);
    // 사람 몫을 뺀 나머지가 봇 직업 → 예: J1 D1에 사람이 광대면 봇은 ['DOCTOR'] + 시민
    const left = { ...counts };
    for (const role of roles) left[role] = (left[role] ?? 0) - 1;
    const botRoles = SPECIAL.flatMap((r) => Array(Math.max(0, left[r] ?? 0)).fill(r));
    const t = await table.setup({
        humans,
        bots: n - humans.length,
        settings: customRoleSettings(counts, extra),
        roles: ({ humans: hs, bots }) => Object.fromEntries([
            ...hs.map((h, i) => [h.account.uuid, roles[i]]),
            ...bots.map((bot, i) => [bot.account.uuid, botRoles[i] ?? 'CITIZEN']),
        ]),
    });
    return settleRoles(t, humans, roles, left);
}

/** 사람만 5명 판 (봇 없음 → 첫 사람이 화면으로 방을 만들고 시작) */
async function openHumanGame(humans, { jokers, roles }) {
    for (const h of humans) await watch(h.page);
    const [host, ...guests] = humans;
    const t = await hostGame({
        host,
        guests,
        botList: [],
        settings: { code: true, maxPlayers: 5, jokers },
        roles: Object.fromEntries(humans.map((h, i) => [h.account.uuid, roles[i]])),
    });
    return settleRoles(t, humans, roles, {});
}

/** 시간 바 펼쳐 두기: 펼치면 "[밤-의사]" 같은 차례 글이 늘 보임 (화면이 그 차례까지 따라왔는지 보려고) — 채팅 쪽 타이머면 단추가 없고 글은 늘 보임 */
async function expandTimebar(page) {
    const button = page.getByRole('button', { name: '시간흐름바 확대' });
    if (!(await button.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false))) return;
    // 안내 창이 화면을 잠그고 있으면 닫으면서 누름
    await expect(async () => {
        await night.closeNotices(page);
        if (await button.isVisible().catch(() => false)) await button.click({ timeout: 1500 });
        await expect(page.getByRole('button', { name: '시간흐름바 접기' })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
}

/** 안내 창(밤이 되었습니다·○○의 시간입니다) 닫기 — 떠 있는 동안 시간 바를 덮음 */
async function tidy(page) {
    await expect(async () => {
        await ui.closeOverlays(page, { names: BLOCKERS, rounds: 2, clickTimeoutMs: 1500 });
        for (const name of BLOCKERS) await expect(page.getByRole('dialog', { name, exact: true })).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 15_000 });
}

/** 화면이 그 밤 차례까지 따라옴 (다 골라 마감이 당겨졌으면 "[5초 뒤 마감]") */
async function turnShown(page, role) {
    const label = new RegExp(`\\[밤-${ui.ROLE_LABELS[role]}\\]|\\[5초 뒤 마감\\]`);
    await expect(page.getByText(label).first()).toBeVisible({ timeout: 15_000 });
}

/** 그 직업 봇이 모두 고름 (target 없으면 건너뛰기) */
async function botsChoose(g, role, target = null, t = g.t) {
    for (const bot of g.cast[role]) {
        const reply = await night.botNight(t, bot, target ? target.uuid : null);
        expect(reply?.ok, `봇 ${role} 고르기를 서버가 받음`).toBe(true);
    }
}

/** 화면에서 누른 것이 서버에 닿아 "그 직업이 다 골랐음" 알림이 판에 퍼짐 (봇이 받은 알림으로 봄) */
function settled(g, role, dayIndex) {
    return g.t.bots[0].waitForEvent('phase_settle_started', {
        match: (p) => p?.role === role && p?.dayIndex === dayIndex,
        timeoutMs: 15_000,
    });
}

/** 손잡이로 지금 밤 차례 닫기 → 그 차례를 벗어난 판 요약 (판이 끝나 장부에서 빠지면 null) */
async function closeTurn(g, role, dayIndex) {
    await g.t.advance();
    let last = null;
    await expect.poll(async () => {
        last = await g.t.state();
        return !last || !(last.phase === 'NIGHT' && last.dayIndex === dayIndex && last.nightTurnRole === role);
    }, { timeout: 20_000, message: `${role} 차례 닫힘` }).toBe(true);
    return last;
}

/**
 * 손잡이로 밤 한 번 돌리기: 차례가 열릴 때마다 acts[직업]()을 부른 뒤 그 차례를 닫음 (없는 직업은 아무도 안 고름) → 밤을 벗어난 판 요약
 */
async function playNight(g, acts = {}) {
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
            if (acts[role]) await acts[role](s);
        }
        await closeTurn(g, role, s.dayIndex);
    }
    throw new Error('밤이 안 끝남 (차례를 12번 넘김)');
}

/** 연출 글 줄: 영상 아래 글, 영상이 못 틀어져 글 창으로 바뀌었으면 그 창 글 */
const killedLine = (page, nickname) => page
    .locator('[data-ingame-dawn-report-message], [data-ingame-dawn-report="KILLED"] p')
    .filter({ hasText: killedText(nickname) })
    .first();
const savedLine = (page) => page.locator('[data-ingame-dawn-report="SAVED"]').getByText(SAVED_TEXT, { exact: true });

/** 죽음 연출: 암살 영상이 떴고(화면 기록) 글이 사람 눈에 읽힘, 글에 직업 이름 없음 */
async function expectKilled(page, nickname, from = 0) {
    await expect.poll(async () => (await logOf(page, from)).filter((e) => e.kind === 'kill').length, {
        timeout: 20_000, message: '낮이 될 때 암살 영상이 안 뜸',
    }).toBeGreaterThan(0);
    const line = killedLine(page, nickname);
    await expectReadable(line);
    await expect(line).toHaveText(killedText(nickname));
    expect(await line.innerText()).not.toMatch(ROLE_WORDS);
}

/** 살림 연출: 글 창의 글이 읽힘, 그 밤 영상은 없음, 창 어디에도 닉네임이 없음 (누가 공격받았는지 안 밝힘) */
async function expectSaved(page, hiddenNames = [], from = 0) {
    await expectReadable(savedLine(page), { timeout: 20_000 });
    const shown = await page.locator('[data-ingame-dawn-report="SAVED"]').getByRole('dialog').innerText();
    for (const name of hiddenNames) expect(shown, '살림 글 창에 닉네임이 없음').not.toContain(name);
    expect((await logOf(page, from)).filter((e) => e.kind === 'kill' || e.kind === 'msg'), '살림 밤엔 암살 영상이 없음').toEqual([]);
}

/** 연출 없이 낮: "낮이 되었습니다"가 읽히고, 그 밤부터 기록에 연출이 하나도 없음 (산 사람 화면) */
async function expectPlainDay(page, from = 0) {
    await expectReadable(dayEntrance(page).getByText(DAY_TEXT, { exact: true }), { timeout: 20_000 });
    const shows = (await logOf(page, from)).filter((e) => ['kill', 'msg', 'report'].includes(e.kind));
    expect(shows, '연출 기록').toEqual([]);
    await expect(showMarks(page)).toHaveCount(0);
}

/** 밤 동안 연출 흔적 없음: 기록·화면에 영상·글 창·기다림 창이 없음 */
async function expectQuietNight(page, from = 0) {
    const shows = (await logOf(page, from)).filter((e) => ['kill', 'msg', 'report', 'wait'].includes(e.kind));
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

/** 재판 뒤 화면 치우기: 추방 연출이 끝나고(막히면 건너뛰기) 안내 창이 다 닫힐 때까지 */
async function clearStage(page) {
    await expect(async () => {
        const skip = page.locator('[data-ingame-tribunal-expulsion]').getByRole('button', { name: '건너뛰기' });
        if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 1000 }).catch(() => {});
        await ui.closeOverlays(page, { names: BLOCKERS, rounds: 2, clickTimeoutMs: 1500 });
        await expect(page.locator('[data-ingame-tribunal-expulsion]')).toHaveCount(0, { timeout: 500 });
        for (const name of BLOCKERS) await expect(page.getByRole('dialog', { name, exact: true })).toHaveCount(0, { timeout: 500 });
    }).toPass({ timeout: 40_000 });
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

/**
 * 낮에 한 사람 처형: 사람은 화면으로·봇은 소켓으로 그 사람에게 투표 → 재판은 봇만 유죄 → 처형 뒤 화면 치우기
 * (사람도 내야 최다 득표가 기권보다 많아짐)
 */
async function executeByAll(g, target) {
    const s = await waitState(g.t, (x) => x.phase === 'DAY' && x.dayPhase === 'DAY_DISCUSSION', '낮 토론');
    // "낮이 되었습니다"를 닫아야 카드가 눌림
    for (const h of g.humans) await day.closeNotice(h.page, DAY_TEXT);
    await day.toVote(g.t);
    for (const h of g.humans) await day.voteUi(h.page, target.nickname);
    const aliveUuids = new Set(s.players.filter((p) => p.alive).map((p) => p.uuid));
    const voters = g.t.bots.filter((bot) => aliveUuids.has(bot.account.uuid) && bot.account.uuid !== target.uuid);
    await day.botsVote(g.t, target.uuid, voters);
    const tribunal = await day.resolveVote(g.t);
    expect(tribunal.tribunal?.defendantUuid, '재판 피고').toBe(target.uuid);
    await day.botsTribunal(g.t, 'GUILTY', voters);
    await day.resolveTribunal(g.t);
    await night.waitDead(g.t, target.uuid);
    await each(g.humans, (h) => clearStage(h.page));
}

test('A05-H-501 [버그 5] 5명 판 사람 5명 전원 (PC 5): 밤엔 다섯 화면 어디에도 영상·기다림 창 없음 → 낮이 될 때 다섯 화면 모두 영상 + 글 @game @hard', async ({ user, players }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 4))];
    const g = await openHumanGame(humans, { jokers: 1, roles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    const [joker, victim, watcher] = humans;
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await night.nightActUi(joker.page, victim.account.nickname, '암살');
    // 고른 것이 서버에 닿음: 다른 사람 화면에 마감 당김 표시가 붙음
    await expect(watcher.page.locator('[data-ingame-phase-settle]')).toHaveCount(1);
    await each(humans, (h) => expectQuietNight(h.page));
    await g.t.advance();
    await each(humans, (h) => expectKilled(h.page, victim.account.nickname));
    expect((await g.t.player(victim.account.uuid)).alive).toBe(false);
});

test('A05-H-502 [버그 5] 사람 5 + 봇 2 = 7명: 광대 차례가 끝난 뒤에도 밤엔 다섯 화면에 아무것도 없음 → 낮에 다섯 화면 모두 같은 영상 + 글 (당한 사람 화면도) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 4))];
    const g = await openGame(table, humans, { n: 7, counts: { JOKER: 1, DOCTOR: 1 }, roles: ['JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    const [joker, victim] = humans;
    await each(humans, (h) => expandTimebar(h.page));
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await night.nightActUi(joker.page, victim.account.nickname, '암살');
    await settled(g, 'JOKER', 1);
    await closeTurn(g, 'JOKER', 1);
    // 광대 차례가 끝나고 의사 차례 — 옛 버그는 이때 광대·당한 사람 화면에만 영상이 떴음
    await each(humans, (h) => turnShown(h.page, 'DOCTOR'));
    await each(humans, (h) => expectQuietNight(h.page));
    await closeTurn(g, 'DOCTOR', 1);
    await each(humans, (h) => expectKilled(h.page, victim.account.nickname));
    // 다섯 화면이 같은 영상 파일을 틂 (당한 사람 화면 포함)
    const videos = await each(humans, async (h) => (await logOf(h.page)).find((e) => e.kind === 'kill').value);
    expect(videos[1], '당한 사람 화면의 영상 주소').not.toBe('');
    expect(new Set(videos).size, '화면마다 영상이 같음').toBe(1);
});

test('A05-H-504 살림 — 사람 4 + 봇 4 = 8명: 광대·의사·보호받은 사람·시민 화면 모두 살림 글(이름 없음), 의사 화면엔 개인 결과 없음, 광대 화면엔 암살 실패 글 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 3))];
    const g = await openGame(table, humans, { n: 8, counts: { JOKER: 1, DOCTOR: 1 }, roles: ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN'] });
    const [joker, doctor, saved] = humans;
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await night.nightActUi(joker.page, saved.account.nickname, '암살');
    await settled(g, 'JOKER', 1);
    await closeTurn(g, 'JOKER', 1);
    await waitTurn(g.t, 'DOCTOR', 1);
    await night.nightActUi(doctor.page, saved.account.nickname, '보호');
    await settled(g, 'DOCTOR', 1);
    await closeTurn(g, 'DOCTOR', 1);
    await each(humans, (h) => expectSaved(h.page, [saved.account.nickname]));
    expect((await g.t.player(saved.account.uuid)).alive).toBe(true);
    // 광대 화면: 살림 글 창을 닫으면 암살 실패 글
    await finishShow(joker.page);
    await expectReadable(privateResult(joker.page).getByText(FAIL_TEXT, { exact: true }));
    // 의사 화면: 살림 글 창을 닫으면 바로 "낮이 되었습니다", 개인 결과 창은 한 번도 안 뜸
    await finishShow(doctor.page);
    await expectReadable(dayEntrance(doctor.page).getByText(DAY_TEXT, { exact: true }));
    expect((await logOf(doctor.page)).filter((e) => e.kind === 'result'), '의사 화면 개인 결과 기록').toEqual([]);
});

test('A05-H-505 경비원 조사 — 사람 3 (8명): 경비원 화면에만 조사 결과 글, 조사당한 사람·시민 화면은 밤·낮 내내 아무 창 없음 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 2))];
    const g = await openGame(table, humans, { n: 8, counts: { JOKER: 1, DOCTOR: 1, GUARD: 1 }, roles: ['GUARD', 'CITIZEN', 'CITIZEN'] });
    const [guard, target, citizen] = humans;
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await playNight(g, {
        JOKER: () => botsChoose(g, 'JOKER', null),
        GUARD: async () => {
            await night.nightActUi(guard.page, target.account.nickname, '조사');
            await settled(g, 'GUARD', 1);
            // 조사가 들어간 뒤에도 조사당한 사람·시민 화면엔 아무것도 없음
            await each([target, citizen], (h) => expectQuietNight(h.page));
        },
    });
    await expectReadable(privateResult(guard.page).getByText(investigateText(target.account.nickname, '귀족'), { exact: true }), { timeout: 20_000 });
    for (const h of [target, citizen]) {
        await expectPlainDay(h.page);
        expect((await logOf(h.page)).filter((e) => e.kind === 'result' || e.kind === 'wait'), '결과 창·기다림 창 기록').toEqual([]);
        await expect(privateResult(h.page)).toHaveCount(0);
    }
});

test('A05-H-506 마녀사냥꾼 확인 — 사람 2 (10명, 둘째 밤): 마녀사냥꾼 화면에만 확인 글, 첫날 처형된 사람 화면엔 아무것도 없음 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const humans = [user, ...(await addPeople(players, 1))];
    // 처형 뒤 화면을 치우는 동안 첫 밤 광대 차례가 먼저 닫히지 않게 밤 차례 60초
    const g = await openGame(table, humans, {
        n: 10, counts: { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }, roles: ['WITCH_HUNTER', 'CITIZEN'], extra: { nightActionTime: 60 },
    });
    const [hunter, executed] = humans;
    // 첫날: 봇 8표로 사람 시민을 처형 (봇 표 8 > 기권 2)
    await g.t.advanceUntil('DAY');
    await day.toVote(g.t);
    await day.botsVote(g.t, executed.account.uuid);
    await day.resolveVote(g.t);
    await day.botsTribunal(g.t, 'GUILTY');
    await day.resolveTribunal(g.t);
    await night.waitDead(g.t, executed.account.uuid);
    await day.keepWatching(executed.page);
    await clearStage(hunter.page);
    // 첫 밤: 아무 일 없음 (마녀사냥꾼은 첫 밤 차례 없음)
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await playNight(g, { JOKER: () => botsChoose(g, 'JOKER', null) });
    const marks = await marksOf(humans);
    // 둘째 밤: 마녀사냥꾼 사람이 처형된 사람을 확인
    await night.toTurn(g.t, 'JOKER', { dayIndex: 2 });
    await playNight(g, {
        JOKER: () => botsChoose(g, 'JOKER', null),
        WITCH_HUNTER: async () => {
            await night.nightActUi(hunter.page, executed.account.nickname, '확인');
            await settled(g, 'WITCH_HUNTER', 2);
        },
    });
    await expectReadable(privateResult(hunter.page).getByText(confirmText(executed.account.nickname, '귀족'), { exact: true }), { timeout: 20_000 });
    // 확인당한 죽은 사람 화면: 결과 창·영상·글 창 기록이 없음
    expect((await g.t.state()).dayIndex).toBe(3);
    expect((await logOf(executed.page, marks[1])).filter((e) => ['result', 'kill', 'msg', 'report', 'wait'].includes(e.kind)), '죽은 사람 화면 기록').toEqual([]);
    await expect(privateResult(executed.page)).toHaveCount(0);
});

test('A05-H-507 세 밤 연달아 — 사람 3 (10명): 1밤 죽음 → 2밤 살림 → 3밤 아무 일 없음 → 세 화면 모두 2·3·4일 낮에 영상+글 / 살림 글 / 연출 없음 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const humans = [user, ...(await addPeople(players, 2))];
    const g = await openGame(table, humans, { n: 10, counts: { JOKER: 1, DOCTOR: 1 }, roles: ['CITIZEN', 'CITIZEN', 'CITIZEN'] });
    const [first, second] = [P(g.cast.CITIZEN.at(-1)), P(g.cast.CITIZEN.at(-2))];
    // 1밤: 광대가 한 명을 죽임 → 2일 낮 영상 + 글
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await playNight(g, { JOKER: () => botsChoose(g, 'JOKER', first) });
    await each(humans, (h) => expectKilled(h.page, first.nickname));
    await each(humans, (h) => finishShow(h.page));
    // 2밤: 의사가 광대 대상을 지킴 → 3일 낮 살림 글 (앞 밤 영상이 다시 안 뜸)
    let marks = await marksOf(humans);
    await night.toTurn(g.t, 'JOKER', { dayIndex: 2 });
    await playNight(g, { JOKER: () => botsChoose(g, 'JOKER', second), DOCTOR: () => botsChoose(g, 'DOCTOR', second) });
    await each(humans, (h) => expectSaved(h.page, [second.nickname, first.nickname], marks[humans.indexOf(h)]));
    await each(humans, (h) => finishShow(h.page));
    // 3밤: 광대가 건너뜀 → 4일 낮 연출 없이 "낮이 되었습니다"
    marks = await marksOf(humans);
    await night.toTurn(g.t, 'JOKER', { dayIndex: 3 });
    await playNight(g, { JOKER: () => botsChoose(g, 'JOKER', null) });
    await each(humans, (h) => expectPlainDay(h.page, marks[humans.indexOf(h)]));
    const end = await g.t.state();
    expect(end.dayIndex).toBe(4);
    expect(end.players.filter((p) => !p.alive).map((p) => p.uuid)).toEqual([first.uuid]);
});

test('A05-H-508 [임시 9] 밤 암살로 판 끝 — 사람 5 (5명, 광대 2): 다섯 화면 모두 연출을 보고, 연출이 끝난 뒤에야 결과 화면 @game @hard', async ({ user, players }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 4))];
    const g = await openHumanGame(humans, { jokers: 2, roles: ['JOKER', 'JOKER', 'CITIZEN', 'CITIZEN', 'CITIZEN'] });
    const [jokerA, jokerB, victim, watcher] = humans;
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await night.nightActUi(jokerA.page, victim.account.nickname, '암살');
    await night.nightActUi(jokerB.page, victim.account.nickname, '암살');
    await expect(watcher.page.locator('[data-ingame-phase-settle]')).toHaveCount(1);
    // 광대 2 : 나머지 3에서 한 명이 죽으면 2 : 2 → 판 끝
    await g.t.advance();
    await each(humans, async (h) => {
        await expectKilled(h.page, victim.account.nickname);
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

test('A05-H-510 연출 중 한 사람만 새로고침 — 사람 3 (7명): 새로고침한 사람은 연출을 다시 안 봄, 나머지 둘은 연출이 그대로 이어져 닫힘 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 2))];
    const g = await openGame(table, humans, { n: 7, counts: { JOKER: 1 }, roles: ['CITIZEN', 'CITIZEN', 'CITIZEN'] });
    const [refresher, ...others] = humans;
    const victim = P(g.cast.CITIZEN.at(-1));
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await playNight(g, { JOKER: () => botsChoose(g, 'JOKER', victim) });
    await Promise.all([
        (async () => {
            // 연출이 뜬 것을 보고 바로 새로고침 → 새 기록엔 연출이 한 번도 없고, 죽은 사람 카드는 사망
            await expect(showMarks(refresher.page)).not.toHaveCount(0, { timeout: 20_000 });
            await refresher.page.reload();
            await expect(refresher.page).toHaveURL(/\/ingame/);
            await night.expectCard(refresher.page, victim.nickname, 'dead', 20_000);
            expect((await logOf(refresher.page)).filter((e) => ['kill', 'msg', 'report'].includes(e.kind)), '새로고침 뒤 연출 기록').toEqual([]);
            await expect(showMarks(refresher.page)).toHaveCount(0);
        })(),
        ...others.map(async (h) => {
            await expectKilled(h.page, victim.nickname);
            await finishShow(h.page);
            await expectReadable(dayEntrance(h.page).getByText(DAY_TEXT, { exact: true }));
            // 연출은 한 번만 (옆 사람 새로고침으로 다시 시작하지 않음)
            expect((await logOf(h.page)).filter((e) => e.kind === 'kill').length).toBe(1);
        }),
    ]);
});

test('A05-H-511 탭 닫고 60초 안(40초 뒤)에 돌아오면 지난 낮 연출이 없음 — 사람 2 (6명): 돌아온 화면에 연출 없이 죽은 사람 카드만 사망 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const humans = [user, ...(await addPeople(players, 1))];
    const g = await openGame(table, humans, { n: 6, counts: { JOKER: 1 }, roles: ['CITIZEN', 'CITIZEN'] });
    const [leaver, stayer] = humans;
    const victim = P(g.cast.CITIZEN.at(-1));
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await leaver.page.close();
    const closedAt = Date.now();
    // 닫힌 것이 서버에 닿음: 남은 사람 화면에서 그 사람 카드가 "연결 끊김"
    await night.expectCard(stayer.page, leaver.account.nickname, 'disconnected');
    // 그사이 밤이 끝나고 한 명이 죽음 (5초 규칙을 보는 시험이 아니라 차례는 손잡이로 닫음)
    await playNight(g, { JOKER: () => botsChoose(g, 'JOKER', victim) });
    await expectKilled(stayer.page, victim.nickname);
    // 진짜로 기다림: 탭을 닫은 지 40초 (끊김 기다림 60초 안)
    await sleep(Math.max(0, closedAt + 40_000 - Date.now()));
    const page = await leaver.context.newPage();
    await watch(page);
    await page.goto('/ingame');
    await expect(page).toHaveURL(/\/ingame/);
    await night.expectCard(page, victim.nickname, 'dead', 20_000);
    expect((await logOf(page)).filter((e) => ['kill', 'msg', 'report'].includes(e.kind)), '돌아온 화면 연출 기록').toEqual([]);
    await expect(showMarks(page)).toHaveCount(0);
    // 60초 안에 돌아와서 판에 그대로 남음
    const me = await g.t.player(leaver.account.uuid);
    expect(me.alive).toBe(true);
    expect(me.isParticipating).toBe(true);
});

test('A05-H-523 광대 사람이 의사 사람을 노리고 의사가 자기를 지킴 (7명): 의사 화면은 밤 동안 아무 표시 없음 → 두 화면 살림 글 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 1))];
    const g = await openGame(table, humans, { n: 7, counts: { JOKER: 1, DOCTOR: 1 }, roles: ['JOKER', 'DOCTOR'] });
    const [joker, doctor] = humans;
    await expandTimebar(doctor.page);
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await night.nightActUi(joker.page, doctor.account.nickname, '암살');
    await settled(g, 'JOKER', 1);
    await closeTurn(g, 'JOKER', 1);
    // 의사 차례: 찍힌 줄 모르는 채(영상·표시 없음) 자기 카드에서 '보호'
    await turnShown(doctor.page, 'DOCTOR');
    await expectQuietNight(doctor.page);
    await night.nightActUi(doctor.page, doctor.account.nickname, '보호');
    await settled(g, 'DOCTOR', 1);
    await expectQuietNight(doctor.page);
    await closeTurn(g, 'DOCTOR', 1);
    await each(humans, (h) => expectSaved(h.page, [doctor.account.nickname]));
    expect((await g.t.player(doctor.account.uuid)).alive).toBe(true);
});

test('A05-H-524 광대 대상 사람이 밤 중 나감 (7명, 사람 3): 남은 두 화면은 낮에 연출 없이 "낮이 되었습니다" @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [user, ...(await addPeople(players, 2))];
    const g = await openGame(table, humans, { n: 7, counts: { JOKER: 1 }, roles: ['CITIZEN', 'CITIZEN', 'CITIZEN'] });
    const [target, ...others] = humans;
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await botsChoose(g, 'JOKER', P(target));
    // 노려진 사람이 화면 "게임 나가기"로 나감 → 판에서 빠짐
    await leaveGame(target.page);
    await expect.poll(async () => (await g.t.player(target.account.uuid))?.isParticipating, { timeout: 15_000, message: '나간 사람이 판에서 빠짐' }).toBe(false);
    await closeTurn(g, 'JOKER', 1);
    await waitState(g.t, (s) => s.phase === 'DAY' && s.dayIndex === 2, '2일 낮');
    for (const h of others) await expectPlainDay(h.page);
});

test('A05-H-525 둘째 날 재판 뒤 밤 → 낮 연출 (7명, 사람 3): 1일 처형 → 1밤 → 2일 처형 → 2밤 암살 → 세 화면 3일 낮 영상 + 글 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const humans = [user, ...(await addPeople(players, 2))];
    // 처형 뒤 화면을 치우는 동안 광대 차례가 먼저 닫히지 않게 밤 차례 60초
    const g = await openGame(table, humans, { n: 7, counts: { JOKER: 1 }, roles: ['CITIZEN', 'CITIZEN', 'CITIZEN'], extra: { nightActionTime: 60 } });
    const [firstOut, secondOut, victim] = g.cast.CITIZEN.map(P);
    // 1일: 시민 봇 하나를 처형 → 1밤은 광대가 건너뜀
    await g.t.advanceUntil('DAY');
    await executeByAll(g, firstOut);
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await playNight(g, { JOKER: () => botsChoose(g, 'JOKER', null) });
    // 2일: 또 한 명 처형 → 2밤에 광대가 암살
    await executeByAll(g, secondOut);
    const marks = await marksOf(humans);
    await night.toTurn(g.t, 'JOKER', { dayIndex: 2 });
    await playNight(g, { JOKER: () => botsChoose(g, 'JOKER', victim) });
    await each(humans, (h) => expectKilled(h.page, victim.nickname, marks[humans.indexOf(h)]));
    const end = await g.t.state();
    expect(end.dayIndex).toBe(3);
    expect(end.players.filter((p) => !p.alive).map((p) => p.uuid).sort()).toEqual([firstOut.uuid, secondOut.uuid, victim.uuid].sort());
});

test('A05-H-526 같은 방 둘째 판에서도 5초 표시·낮 연출 그대로 (5명, 사람 2): 판 끝 → 둘 다 "대기방으로" → 둘째 판 첫 밤 "[5초 뒤 마감]" → 낮 연출 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const humans = [user, ...(await addPeople(players, 1))];
    const g = await openGame(table, humans, { n: 5, counts: { JOKER: 2 }, roles: ['CITIZEN', 'CITIZEN'] });
    const victim = P(g.cast.CITIZEN[0]);
    const host = g.t.bots[0];
    const presets = Object.fromEntries([
        ...humans.map((h) => [h.account.uuid, 'CITIZEN']),
        ...g.cast.JOKER.map((bot) => [bot.account.uuid, 'JOKER']),
        [victim.uuid, 'CITIZEN'],
    ]);
    // 첫 판: 봇 광대 둘이 봇 시민을 죽여 2 : 2 → 판 끝 (첫 판은 손잡이로 빨리)
    await night.toTurn(g.t, 'JOKER', { dayIndex: 1 });
    await playNight(g, { JOKER: () => botsChoose(g, 'JOKER', victim) });
    await each(humans, async (h) => {
        await expectKilled(h.page, victim.nickname);
        await finishShow(h.page);
        await waitResult(h.page);
    });
    // 같은 방으로: 봇(방장부터)은 소켓으로, 사람 둘은 화면 "대기방으로"
    for (const bot of g.t.bots) expect((await bot.request('return_to_room', { gameId: g.t.gameId }))?.ok, '봇 대기방으로').toBe(true);
    for (const h of humans) {
        await h.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(h.page).toHaveURL(/\/game-matching/);
    }
    const room = await e2e.roomOf(host.account.uuid);
    expect(room.roomCode, '같은 방 코드').toBe(g.t.roomCode);
    expect(room.hostUuid, '방장은 그대로 봇 방장').toBe(host.account.uuid);
    for (const bot of g.t.bots) await bot.setReady(room.roomId, room.settingsVersion);
    for (const h of humans) {
        await ui.readyUi(h.page);
        await expect(h.page.getByRole('button', { name: '준비취소' })).toBeVisible();
    }
    await e2e.setRoles(presets, { roomId: room.roomId });
    const started = await host.startGame(room.roomId, room.settingsVersion);
    expect(started.gameId).not.toBe(g.t.gameId);
    const second = new Table({ room, bots: g.t.bots, humans });
    second.gameId = started.gameId;
    for (const h of humans) await expect(h.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await each(humans, (h) => ui.readRoleReveal(h.page));
    const roles = (await second.state()).players;
    for (const bot of g.cast.JOKER) expect(roles.find((p) => p.uuid === bot.account.uuid).role, '둘째 판 광대').toBe('JOKER');
    // 둘째 판 첫 밤: 밤 앞만 손잡이로, 밤에 들어간 뒤엔 진짜 5초
    await night.toNight(second, { dayIndex: 1 });
    await waitTurn(second, 'JOKER', 1);
    // 밤 안내 창이 시간 바를 덮음 → 뜬 것을 보고 닫아 둠
    await each(humans, async (h) => {
        await h.page.locator('[data-ingame-phase-entrance="NIGHT"]').waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
        await tidy(h.page);
    });
    const marks = await marksOf(humans);
    const chosenAt = Date.now();
    await botsChoose(g, 'JOKER', victim, second);
    await each(humans, async (h) => {
        const from = marks[humans.indexOf(h)];
        await expectReadable(settleLabel(h.page));
        // 5초 표시가 꺼지는 때 = 차례가 닫히는 때 → 다 고른 때부터 5±1.5초
        let off = null;
        await expect.poll(async () => {
            off = (await logOf(h.page, from)).find((e) => e.kind === 'settleOff') ?? null;
            return off !== null;
        }, { timeout: 12_000, message: '5초 표시가 안 꺼짐' }).toBe(true);
        expect(Math.abs(off.at - chosenAt - 5000), '다 고른 때부터 차례가 닫힐 때까지 5초와의 차이').toBeLessThanOrEqual(TOLERANCE_MS);
        // 낮 연출도 첫 판과 똑같이
        await expectKilled(h.page, victim.nickname, from);
    });
});

test('A05-H-530 밤 중 60초 탈락은 살해 연출이 아님 (6명, 사람 2): 탭 닫은 시민이 밤 중 60초에 탈락, 광대는 아무도 안 노림 → 남은 사람 화면 낮에 살해 연출 없음 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const humans = [user, ...(await addPeople(players, 1))];
    // 차례 셋(광대·의사·경비원) × 30초 = 밤 90초 → 60초 탈락이 밤 안에 떨어짐
    const g = await openGame(table, humans, { n: 6, counts: { JOKER: 1, DOCTOR: 1, GUARD: 1 }, roles: ['CITIZEN', 'CITIZEN'] });
    const [leaver, stayer] = humans;
    // 밤 앞만 손잡이로, 밤에 들어간 뒤엔 손잡이를 안 씀 (60초·차례 시간 모두 진짜로)
    await night.toNight(g.t, { dayIndex: 1 });
    await waitTurn(g.t, 'JOKER', 1);
    const from = (await logOf(stayer.page)).length;
    await leaver.page.close();
    const closedAt = Date.now();
    await night.expectCard(stayer.page, leaver.account.nickname, 'disconnected');
    // 60초 뒤 탈락 (죽음 처리) — 아직 밤
    await expect.poll(async () => (await g.t.player(leaver.account.uuid))?.alive, {
        timeout: 75_000, intervals: [250], message: '60초 탈락',
    }).toBe(false);
    expect(Math.abs(Date.now() - closedAt - 60_000), '탭을 닫은 때부터 탈락까지 60초와의 차이').toBeLessThanOrEqual(TOLERANCE_MS + 250);
    expect((await g.t.state()).phase, '탈락한 때는 아직 밤').toBe('NIGHT');
    await expectQuietNight(stayer.page, from);
    // 아무도 안 골라 세 차례가 시간 끝까지 감 → 낮: 살해 연출·살림 글 없이 "낮이 되었습니다"
    await waitState(g.t, (s) => s.phase === 'DAY' && s.dayIndex === 2, '2일 낮', 45_000);
    await expectPlainDay(stayer.page, from);
});
