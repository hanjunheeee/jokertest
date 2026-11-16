'use strict';

// "다 내면 5초 뒤 판정" 어려움 시험: 사람 2~5명이 같은 판 — 거의 동시 마지막 표·5초 안 바꾸기·새로고침·PC+모바일·죽은 사람·10명·동점·채팅·옛 화면
// 목록 A03-낮투표.md A03-H-003·004·005·006·012·013·016·017·023·028·029·030·031·037·039, 돌리지 않고 모임만: npx playwright test --list tests/ingame/a03-hard-settle.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const { sleep } = require('../../helpers/wait');
const D = require('./a-day/_lib');
const { hostGame } = require('../room/roomHelpers');
const { talk } = require('../mobile/_talk');

// ── 이 파일 도우미 (공용으로 올릴 후보: 사람 여럿 낮 투표 묶음 — PC·모바일 화면 섞임) ──

// 자동 역할 구성 (광대 1, 6명부터 의사, 8명부터 경비원, 10명부터 마녀사냥꾼, 남는 자리 시민)
function autoRoles(n) {
    const list = ['JOKER'];
    if (n >= 6) list.push('DOCTOR');
    if (n >= 8) list.push('GUARD');
    if (n >= 10) list.push('WITCH_HUNTER');
    while (list.length < n) list.push('CITIZEN');
    return list;
}

// 봇 직업 차례: 시민 먼저·광대 마지막 → 봇 0·1(X·Y)은 늘 시민이라 재판·퇴장에도 판이 안 끝남
const BOT_ORDER = ['CITIZEN', 'WITCH_HUNTER', 'GUARD', 'DOCTOR', 'JOKER'];

// 직업 고정 계획: 사람은 받은 직업(기본 시민), 남은 직업을 봇에 → { uuid: 직업 }
function rolePlan(n, humanRoles = []) {
    return ({ humans, bots }) => {
        const pool = autoRoles(n);
        const out = {};
        humans.forEach((h, i) => {
            const role = humanRoles[i] ?? 'CITIZEN';
            if (!pool.includes(role)) throw new Error(`${n}명 자동 구성에 ${role} 자리 없음`);
            pool.splice(pool.indexOf(role), 1);
            out[h.account.uuid] = role;
        });
        pool.sort((a, b) => BOT_ORDER.indexOf(a) - BOT_ORDER.indexOf(b));
        bots.forEach((b, i) => { out[b.account.uuid] = pool[i]; });
        return out;
    };
}

// 서버가 정한 직업이 계획과 같은지 (예약이 가끔 못 맞음)
async function expectRoles(t, plan) {
    const want = plan({ humans: t.humans, bots: t.bots });
    const s = await t.state();
    expect(Object.fromEntries(s.players.map((p) => [p.uuid, p.role]))).toEqual(want);
}

const uuidOf = (who) => who.account.uuid;

const isMobile = (h) => h.mobile === true;

const abstainButton = (page) => page.getByRole('button', { name: '기권' });

const tribunalOf = (page) => page.locator('[data-ingame-tribunal-presentation]');

const noticeOf = (page) => page.getByRole('dialog', { name: '단계 전환 안내' });

// 사람 하나 더 (각자 다른 계정·쿠키), 모바일이면 표시를 붙여 둠
async function addPerson(players, { mobile = false } = {}) {
    const p = await players.add({ mobile });
    return { ...p, mobile };
}

// uuid → 닉네임
async function namesOf(t) {
    const s = await t.state();
    return new Map(s.players.map((p) => [p.uuid, p.nickname]));
}

// 사람이 여럿이라 화면 조작이 길어 토론 90초·투표 60초로 둠 (그 시간 규칙을 보는 시험은 따로 덮어씀)
const MANY_SETTINGS = Object.freeze({ dayDiscussionTime: 90, dayVoteTime: 60 });

// 판 차리고 제 1일 낮 투표까지 (역할 공개·토론은 이 시험이 보는 규칙이 아니라 손잡이로 빨리)
async function openVoteMany(table, humans, n, { settings } = {}) {
    const roles = rolePlan(n);
    const t = await table.setup({ humans, bots: n - humans.length, roles, settings: { ...MANY_SETTINGS, ...settings } });
    await expectRoles(t, roles);
    await D.toDay(t);
    await D.toVote(t);
    return t;
}

// 카드 메뉴 열기: PC는 판 카드 메뉴, 모바일은 초상 띠 칸 → 카드 시트
async function openMenu(h, nick) {
    if (isMobile(h)) {
        await talk.slot(h.page, nick).click();
        const sheet = h.page.locator('[data-ingame-player-card-menu]');
        await expect(sheet).toHaveAttribute('aria-label', nick);
        return sheet;
    }
    await D.card(h.page, nick).click();
    const menu = h.page.getByRole('menu', { name: '플레이어 행동' });
    await expect(menu).toBeVisible();
    return menu;
}

// 카드 메뉴 항목 누름 (투표하기·투표취소), 메뉴가 닫힐 때까지
async function menuPick(h, nick, item) {
    const menu = await openMenu(h, nick);
    await menu.getByRole('menuitem', { name: item }).click();
    await expect(menu).toBeHidden();
}

// 카드 메뉴 닫기 (PC는 Esc, 모바일은 시트 '닫기')
async function closeMenu(h) {
    if (isMobile(h)) {
        const sheet = h.page.locator('[data-ingame-player-card-menu]');
        await sheet.getByRole('button', { name: '닫기' }).click();
        await expect(sheet).toBeHidden();
        return;
    }
    await h.page.keyboard.press('Escape');
    await expect(h.page.getByRole('menu', { name: '플레이어 행동' })).toBeHidden();
}

// 사람 표: null이면 기권 단추, 아니면 그 사람 카드 '투표하기' → 기권 단추가 꺼지면 서버가 받은 것
async function cast(h, target, names) {
    if (target === null) await abstainButton(h.page).click();
    else await menuPick(h, names.get(target), '투표하기');
    await expect(abstainButton(h.page)).toBeDisabled();
}

// 이미 낸 표 바꾸기: 다른 사람이면 그 카드 '투표하기', 기권이면 낸 사람 카드 '투표취소'
async function change(h, from, to, names) {
    if (to === null) await menuPick(h, names.get(from), '투표취소');
    else await menuPick(h, names.get(to), '투표하기');
}

// 봇 표 (계획에 있는 봇만, 서버 답 ok까지)
async function castBots(t, plan, bots = t.bots) {
    for (const bot of bots) {
        if (!plan.has(uuidOf(bot))) continue;
        const reply = await bot.request('cast_day_vote', { gameId: t.gameId, targetId: plan.get(uuidOf(bot)) });
        expect(reply?.ok, `봇 낮 표 거절: ${reply?.code}`).toBe(true);
    }
}

// 봇 표를 마지막 하나만 남기고 낸 뒤 마지막 봇 표 → 그 직전 시각(다 찬 때)
async function castBotsLast(t, plan) {
    const voters = t.bots.filter((b) => plan.has(uuidOf(b)));
    await castBots(t, plan, voters.slice(0, -1));
    const fullAt = Date.now();
    await castBots(t, plan, voters.slice(-1));
    return fullAt;
}

// 사람들 표 먼저 (화면으로), 계획에 없는 사람은 안 냄
async function castHumans(t, plan, names, humans = t.humans) {
    for (const h of humans) if (plan.has(uuidOf(h))) await cast(h, plan.get(uuidOf(h)), names);
}

// 투표 현황 창 열기 → 창
async function openStatus(page) {
    await page.getByRole('button', { name: '투표 현황 열기' }).click();
    const panel = page.getByRole('dialog', { name: '투표 현황' });
    await expect(panel).toBeVisible();
    return panel;
}

// 결과 값 → 화면 글 (결-투표·결-버그9 화면 문구)
const OUTCOME_TEXT = Object.freeze({
    TRIBUNAL: '재판 회부',
    TIE: '동점',
    ABSTAIN_MAJORITY: '기권이 많아 재판 없음',
    ABSTAINED: '전원 기권',
});

// 판정 뒤 화면: 현황 결과 글 + 재판이면 재판 창(피고 이름), 밤이면 밤 안내·재판 창 없음
async function expectOutcome(page, panel, kind, targetNick) {
    await expect(panel.getByTestId('vote-status-outcome')).toHaveText(OUTCOME_TEXT[kind], { timeout: 15_000 });
    if (kind === 'TRIBUNAL') {
        await expect(tribunalOf(page)).toBeVisible();
        await expect(tribunalOf(page)).toContainText(targetNick);
        return;
    }
    await expect(noticeOf(page)).toContainText('밤이 되었습니다');
    await expect(tribunalOf(page)).toHaveCount(0);
}

// 당김 보임: PC는 시간 바 "[5초 뒤 마감]", 모바일은 단계 줄 "5초 뒤 마감" + 남은 초 5 이하
async function expectSettleShown(h) {
    if (isMobile(h)) {
        await expect(talk.phaseLine(h.page)).toContainText('5초 뒤 마감', { timeout: 4_000 });
        expect(await phaseClock(h.page)).toBeLessThanOrEqual(5);
        return;
    }
    await expect(h.page.getByText('[5초 뒤 마감]')).toBeVisible({ timeout: 4_000 });
    expect(await D.timerSeconds(h.page)).toBeLessThanOrEqual(5);
}

// 다음 날 낮이 될 때까지 앞 연출(밤 안내·낮 시작 연출·사망 후 선택)을 닫고 "낮이 되었습니다" 확인 (죽은 사람은 창이 없을 수 있음)
async function clearToDay(h, { alive = true } = {}) {
    const notice = noticeOf(h.page);
    const check = async () => {
        await ui.closeOverlays(h.page, { names: ['밤 역할 안내', '알림', '밤 조사 결과'], keepWatching: true, rounds: 2 });
        if (await notice.isVisible() && !(await notice.innerText()).includes('낮이 되었습니다')) {
            await notice.getByRole('button', { name: '확인' }).click({ timeout: 1_000 }).catch(() => {});
        }
        await expect(notice).toContainText('낮이 되었습니다', { timeout: 1_000 });
    };
    if (alive) await expect(check).toPass({ timeout: 45_000 });
    else await expect(check).toPass({ timeout: 10_000 }).catch(() => {});
    if (await notice.isVisible()) await notice.getByRole('button', { name: '확인' }).click();
}

// 다음 날 투표까지: 밤 차례·토론은 손잡이(앞 단계), 사람마다 낮 안내 닫기 → 산 사람 기권 단추
async function toDayVote(t, day, { dead = [] } = {}) {
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === day);
    for (const h of t.humans) await clearToDay(h, { alive: !dead.includes(h) });
    // 토론이 아직이면 넘김 (화면 정리가 길어 토론이 저절로 끝났으면 그대로)
    if ((await t.state()).dayPhase === 'DAY_DISCUSSION') await t.advance();
    await D.waitState(t, (g) => g.phase === 'DAY' && g.dayIndex === day && g.dayPhase === 'DAY_VOTE');
    for (const h of t.humans) if (!dead.includes(h)) await expect(abstainButton(h.page)).toBeEnabled();
}

// 재판에서 봇 유죄 → 재판 마감(손잡이, 이 시험이 보는 규칙 아님) → 피고 사망까지
async function finishTribunalGuilty(t, defendant) {
    await D.waitState(t, (g) => g.phase === 'TRIBUNAL');
    const s = await t.state();
    const voters = t.bots.filter((b) => uuidOf(b) !== defendant && s.players.find((p) => p.uuid === uuidOf(b))?.alive);
    await D.botsTribunal(t, 'GUILTY', voters);
    await D.resolveTribunal(t);
    await D.waitState(t, (g) => g.players.find((p) => p.uuid === defendant)?.alive === false);
}

// 현황 결과 글이 처음 채워진 시각 (페이지 안에서 지켜봄 — 봇이 없는 판의 5초 재기, 마지막 표 전에 걸어 둠)
function outcomeShownAt(page) {
    return page.evaluate(() => new Promise((resolve) => {
        const observer = new MutationObserver(() => seen());
        function seen() {
            const el = document.querySelector('[data-testid="vote-status-outcome"]');
            if (!el || !el.textContent || el.textContent.trim() === '-') return;
            observer.disconnect();
            resolve(Date.now());
        }
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
        seen();
    }));
}

// 단계 줄 남은 초 ("제 1일 · 5초 뒤 마감 0:04" → 4, 시계 없으면 null)
async function phaseClock(page) {
    const text = await talk.phaseLine(page).innerText({ timeout: 2_000 });
    const m = /(\d+):(\d{2})/.exec(text);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// 봇이 받은 사건 하나 + 받은 시각 (since 뒤 것만)
async function eventAt(bot, event, { since = 0, match = () => true, timeoutMs = 40_000 } = {}) {
    const payload = await bot.waitForEvent(event, { since, match, timeoutMs });
    const row = bot.events.find((r) => r.payload === payload);
    return { payload, at: row?.at ?? Date.now() };
}

// 다 찬 판정: 마지막 표 직전 시각(fullAt)부터 당김 알림 마감·판정 알림이 5초(±1.5) 뒤 → 판정 값
async function expectFiveSeconds(watcher, fullAt, day) {
    const settle = await eventAt(watcher, 'phase_settle_started', { since: fullAt, match: (p) => p.phase === 'DAY' && p.dayIndex === day });
    const resolved = await eventAt(watcher, 'day_vote_resolved', { since: fullAt, match: (p) => p.dayIndex === day });
    expect(settle.payload.deadline - fullAt).toBeGreaterThanOrEqual(3_500);
    expect(settle.payload.deadline - fullAt).toBeLessThanOrEqual(6_500);
    expect(resolved.at - fullAt).toBeGreaterThanOrEqual(3_500);
    expect(resolved.at - fullAt).toBeLessThanOrEqual(6_500);
    return resolved.payload;
}

// 사람 여럿 열기 (첫 사람은 기본 user, 나머지는 새 계정·새 창)
async function openHumans(user, players, count, { mobileAt = [] } = {}) {
    const list = [{ ...user, mobile: false }];
    for (let i = 1; i < count; i += 1) list.push(await addPerson(players, { mobile: mobileAt.includes(i) }));
    return list;
}

// 몰표 계획: 산 사람 전원 X, X는 기권 → X 재판
function massPlan(t, X) {
    return new Map([...t.humans.map((h) => [uuidOf(h), X]), ...t.bots.map((b) => [uuidOf(b), uuidOf(b) === X ? null : X])]);
}

// 그날 낮 당김 알림·낮 판정 알림이 몇 번 왔나 (밤 차례 당김 알림은 뺌)
const countEvents = (bot, event, day) => bot.events.filter((r) => r.event === event && r.payload?.dayIndex === day
    && (event !== 'phase_settle_started' || r.payload?.phase === 'DAY')).length;

// ── 시험 ──

test('A03-H-003 5명 판 전원 사람이 다 냄 → 다섯 화면 거의 같은 때 "[5초 뒤 마감]", 같은 결과 @game @hard @realtime @smoke', async ({ user, players }) => {
    test.setTimeout(300_000);
    const [h1, h2, h3, h4, h5] = await openHumans(user, players, 5);
    // 사람 5명 판은 봇 방장이 없어 사람이 방장 (화면으로 방 만들기), 광대는 h5
    const presets = Object.fromEntries([h1, h2, h3, h4, h5].map((h, i) => [uuidOf(h), i === 4 ? 'JOKER' : 'CITIZEN']));
    const t = await hostGame({ host: h1, guests: [h2, h3, h4, h5], roles: presets, settings: { discussion: 90, vote: 60 } });
    await expectRoles(t, () => presets);
    await D.toDay(t);
    await D.toVote(t);
    const names = await namesOf(t);
    const X = uuidOf(h2);
    // h2 말고 전원 h2, h2는 h3 → 마지막 표는 h5
    for (const h of [h1, h3, h4]) await cast(h, X, names);
    await cast(h2, uuidOf(h3), names);
    const panels = [];
    for (const h of [h1, h2, h3, h4]) panels.push(await openStatus(h.page));
    const shown = outcomeShownAt(h1.page);
    const fullAt = Date.now();
    await cast(h5, X, names);
    await Promise.all(t.humans.map((h) => expectSettleShown(h)));
    expect(Date.now() - fullAt).toBeLessThan(5_000);
    panels.push(await openStatus(h5.page));
    const at = await shown;
    expect(at - fullAt).toBeGreaterThanOrEqual(3_500);
    expect(at - fullAt).toBeLessThanOrEqual(6_500);
    for (const [i, h] of t.humans.entries()) await expectOutcome(h.page, panels[i], 'TRIBUNAL', names.get(X));
});

test('A03-H-004 6명 판(사람 3) 거의 동시에 마지막 표 둘 → 마감 한 번, 결과 한 번 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = await openHumans(user, players, 3);
    const t = await openVoteMany(table, humans, 6);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    const plan = massPlan(t, X);
    await castBots(t, plan);
    await cast(humans[0], X, names);
    const panel = await openStatus(humans[0].page);
    const fullAt = Date.now();
    // 남은 두 사람이 한꺼번에 누름
    await Promise.all(humans.slice(1).map((h) => cast(h, X, names)));
    await expectFiveSeconds(t.bots[1], fullAt, 1);
    // 판정 뒤 2초 더 봐도 두 번째 당김·판정 알림 없음 (진짜 시간 확인)
    await sleep(2_000);
    expect(countEvents(t.bots[1], 'phase_settle_started', 1)).toBe(1);
    expect(countEvents(t.bots[1], 'day_vote_resolved', 1)).toBe(1);
    await expectOutcome(humans[0].page, panel, 'TRIBUNAL', names.get(X));
    for (const h of humans) await expect(tribunalOf(h.page)).toHaveCount(1);
});

test('A03-H-005 7명 판(사람 4) 재판 모양 → 5초 안 두 사람이 기권으로 → 기권 많음 밤 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = await openHumans(user, players, 4);
    const t = await openVoteMany(table, humans, 7);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    // 사람 4 → X, 봇 3 기권 → X 4·기권 3 (재판 모양)
    const plan = new Map([...humans.map((h) => [uuidOf(h), X]), ...t.bots.map((b) => [uuidOf(b), null])]);
    await castHumans(t, plan, names);
    const fullAt = await castBotsLast(t, plan);
    await expectSettleShown(humans[0]);
    // 5초 안에 두 사람이 X 표를 거둠 → X 2·기권 5
    await Promise.all(humans.slice(0, 2).map((h) => change(h, X, null, names)));
    const panels = [];
    for (const h of humans) panels.push(await openStatus(h.page));
    const resolved = await expectFiveSeconds(t.bots[1], fullAt, 1);
    expect(resolved.outcome).toBe('ABSTAIN_MAJORITY');
    expect(countEvents(t.bots[1], 'phase_settle_started', 1)).toBe(1);
    for (const [i, h] of humans.entries()) await expectOutcome(h.page, panels[i], 'ABSTAIN_MAJORITY');
});

test('A03-H-006 6명 판(사람 3) 5초 중 한 사람 새로고침 → 새로고침한 화면·다른 화면 같은 결과 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = await openHumans(user, players, 3);
    const t = await openVoteMany(table, humans, 6);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    const plan = massPlan(t, X);
    await castHumans(t, plan, names);
    const panels = [];
    for (const h of humans.slice(1)) panels.push(await openStatus(h.page));
    const fullAt = await castBotsLast(t, plan);
    await expectSettleShown(humans[0]);
    await humans[0].page.reload();
    await expectFiveSeconds(t.bots[1], fullAt, 1);
    // 재판 결과로 둬서 새로고침해도 재판 창으로 같은 결과가 보임 (판정 뒤 새로고침의 이유 글은 C-006)
    for (const h of humans) {
        await expect(tribunalOf(h.page)).toBeVisible({ timeout: 20_000 });
        await expect(tribunalOf(h.page)).toContainText(names.get(X));
    }
    for (const [i, h] of humans.slice(1).entries()) await expectOutcome(h.page, panels[i], 'TRIBUNAL', names.get(X));
});

test('A03-H-012 6명 판 PC 1·모바일 1 → 두 화면 같은 "[5초 뒤 마감]"·결과 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = await openHumans(user, players, 2, { mobileAt: [1] });
    const t = await openVoteMany(table, humans, 6);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    const plan = massPlan(t, X);
    await castHumans(t, plan, names);
    const fullAt = await castBotsLast(t, plan);
    await Promise.all(humans.map((h) => expectSettleShown(h)));
    const panels = [];
    for (const h of humans) panels.push(await openStatus(h.page));
    await expectFiveSeconds(t.bots[1], fullAt, 1);
    for (const [i, h] of humans.entries()) await expectOutcome(h.page, panels[i], 'TRIBUNAL', names.get(X));
});

test('A03-H-013 7명 판 2일(사람 2, 한 사람 죽음) 산 사람 다 냄 → 죽은 화면도 5초 표시·결과 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const [alive, dead] = await openHumans(user, players, 2);
    const t = await openVoteMany(table, [alive, dead], 7);
    const names = await namesOf(t);
    // 1일: 전원 dead를 찍어 처형 (앞 단계)
    const day1 = new Map([[uuidOf(alive), uuidOf(dead)], [uuidOf(dead), null], ...t.bots.map((b) => [uuidOf(b), uuidOf(dead)])]);
    await castHumans(t, day1, names);
    await castBots(t, day1);
    await finishTribunalGuilty(t, uuidOf(dead));
    await toDayVote(t, 2, { dead: [dead] });
    // 2일: 산 6명 몰표
    const X = uuidOf(t.bots[0]);
    const plan = new Map([[uuidOf(alive), X], ...t.bots.map((b) => [uuidOf(b), uuidOf(b) === X ? null : X])]);
    await cast(alive, X, names);
    const panels = [await openStatus(alive.page), await openStatus(dead.page)];
    const fullAt = await castBotsLast(t, plan);
    await Promise.all([alive, dead].map((h) => expectSettleShown(h)));
    await expectFiveSeconds(t.bots[1], fullAt, 2);
    await expectOutcome(alive.page, panels[0], 'TRIBUNAL', names.get(X));
    await expectOutcome(dead.page, panels[1], 'TRIBUNAL', names.get(X));
});

test('A03-H-016 7명 판(사람 3) 세 사람이 서로 찍어도 남의 화면엔 누가 누굴 찍었는지 없음 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [h1, h2, h3] = await openHumans(user, players, 3);
    const t = await openVoteMany(table, [h1, h2, h3], 7);
    const names = await namesOf(t);
    const [b0, b1, b2, b3] = t.bots.map(uuidOf);
    // h1→h2, h2→h3, h3→h1, 봇0·봇1→h2, 봇2·봇3 기권 → h2 3·h3 1·h1 1·기권 2 → h2 재판
    const plan = new Map([[uuidOf(h1), uuidOf(h2)], [uuidOf(h2), uuidOf(h3)], [uuidOf(h3), uuidOf(h1)], [b0, uuidOf(h2)], [b1, uuidOf(h2)], [b2, null], [b3, null]]);
    await castHumans(t, plan, names);
    const panels = [];
    for (const h of [h1, h2, h3]) panels.push(await openStatus(h.page));
    await castBots(t, plan);
    const others = [...names.keys()].filter((u) => u !== uuidOf(h2)).map((u) => names.get(u));
    for (const [i, h] of [h1, h2, h3].entries()) {
        await expectOutcome(h.page, panels[i], 'TRIBUNAL', names.get(uuidOf(h2)));
        const text = await panels[i].innerText();
        for (const nick of others) expect(text, `${nick} 이름이 현황에 보임`).not.toContain(nick);
    }
});

test('A03-H-017 10명 판(사람 5 + 봇 5) 다 냄 → 다섯 화면 5초 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const humans = await openHumans(user, players, 5);
    const t = await openVoteMany(table, humans, 10);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    const plan = massPlan(t, X);
    await castHumans(t, plan, names);
    const fullAt = await castBotsLast(t, plan);
    await Promise.all(humans.map((h) => expectSettleShown(h)));
    const panels = [];
    for (const h of humans) panels.push(await openStatus(h.page));
    await expectFiveSeconds(t.bots[1], fullAt, 1);
    for (const [i, h] of humans.entries()) await expectOutcome(h.page, panels[i], 'TRIBUNAL', names.get(X));
});

test('A03-H-023 7명 판(사람 3) 두 사람 X, 한 사람 X→Y→기권 → 마지막 표로 결과 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [h1, h2, h3] = await openHumans(user, players, 3);
    const t = await openVoteMany(table, [h1, h2, h3], 7);
    const names = await namesOf(t);
    const [X, Y, b2, b3] = t.bots.map(uuidOf);
    // 봇: X·Y·봇3 기권, 봇2 → X / h3가 X면 X 4 재판, Y면 X 3·Y 1·기권 3 밤, 기권이면 X 3·기권 4 밤
    const plan = new Map([[uuidOf(h1), X], [uuidOf(h2), X], [X, null], [Y, null], [b2, X], [b3, null]]);
    await cast(h1, X, names);
    await cast(h2, X, names);
    await cast(h3, X, names);
    await change(h3, X, Y, names);
    await change(h3, Y, null, names);
    const panels = [];
    for (const h of [h1, h2, h3]) panels.push(await openStatus(h.page));
    const fullAt = await castBotsLast(t, plan);
    const resolved = await expectFiveSeconds(t.bots[1], fullAt, 1);
    expect(resolved.outcome).toBe('ABSTAIN_MAJORITY');
    for (const [i, h] of [h1, h2, h3].entries()) {
        await expectOutcome(h.page, panels[i], 'ABSTAIN_MAJORITY');
        await expect(panels[i].getByTestId('vote-status-public-abstain-count')).toHaveText('4');
    }
});

test('A03-H-028 5명 판(사람 4) 동점 2·2·기권 1 → 네 화면 "동점"·밤 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [h1, h2, h3, h4] = await openHumans(user, players, 4);
    const t = await openVoteMany(table, [h1, h2, h3, h4], 5);
    const names = await namesOf(t);
    const bot = uuidOf(t.bots[0]);
    // h3 ← h1·h2, h4 ← h3·봇, h4 기권 → 2·2·기권 1
    const plan = new Map([[uuidOf(h1), uuidOf(h3)], [uuidOf(h2), uuidOf(h3)], [uuidOf(h3), uuidOf(h4)], [uuidOf(h4), null], [bot, uuidOf(h4)]]);
    await castHumans(t, plan, names);
    const panels = [];
    for (const h of t.humans) panels.push(await openStatus(h.page));
    const fullAt = await castBotsLast(t, plan);
    const resolved = await expectFiveSeconds(t.bots[0], fullAt, 1);
    expect(resolved.outcome).toBe('TIE');
    for (const [i, h] of t.humans.entries()) await expectOutcome(h.page, panels[i], 'TIE');
});

test('A03-H-029 7명 판(사람 2) 5초 안 바꾼 사람 화면엔 새 대상, 다른 사람 화면엔 대상 안 보임 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [h1, h2] = await openHumans(user, players, 2);
    const t = await openVoteMany(table, [h1, h2], 7);
    const names = await namesOf(t);
    const [X, Y, b2, b3, b4] = t.bots.map(uuidOf);
    // 봇: X→Y, Y→X, 봇2→X, 봇3→Y, 봇4 기권 / h1 X → (5초 안) Y, h2 기권 → 처음 X 3 재판 모양, 바꾼 뒤 Y 3 → Y 재판
    const plan = new Map([[uuidOf(h1), X], [uuidOf(h2), null], [X, Y], [Y, X], [b2, X], [b3, Y], [b4, null]]);
    await castHumans(t, plan, names);
    const fullAt = await castBotsLast(t, plan);
    await expectSettleShown(h1);
    await change(h1, X, Y, names);
    // 바꾼 사람: Y 카드가 '투표취소'(새 대상)
    const mine = await openMenu(h1, names.get(Y));
    await expect(mine.getByRole('menuitem', { name: '투표취소' })).toBeVisible();
    await closeMenu(h1);
    // 다른 사람: Y·X 카드 모두 '투표하기' 그대로 (h1이 누굴 찍었는지 안 보임)
    for (const nick of [names.get(Y), names.get(X)]) {
        const other = await openMenu(h2, nick);
        await expect(other.getByRole('menuitem', { name: '투표하기' })).toBeVisible();
        await expect(other.getByRole('menuitem', { name: '투표취소' })).toHaveCount(0);
        await closeMenu(h2);
    }
    const resolved = await expectFiveSeconds(t.bots[2], fullAt, 1);
    expect(resolved.tribunalTargetUuid).toBe(Y);
    for (const h of [h1, h2]) await expect(tribunalOf(h.page)).toContainText(names.get(Y), { timeout: 5_000 });
});

test('A03-H-030 6명 판(사람 2) 투표 중 새로고침 세 번 → 낸 표 남음, 다 차면 5초 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const [h1, h2] = await openHumans(user, players, 2);
    const t = await openVoteMany(table, [h1, h2], 6, { settings: { dayVoteTime: 90 } });
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    await cast(h1, X, names);
    for (let i = 0; i < 3; i += 1) {
        await h1.page.reload();
        // 낸 표시: 기권 꺼짐 + X 카드는 '투표취소'
        await expect(abstainButton(h1.page)).toBeDisabled({ timeout: 20_000 });
        const menu = await openMenu(h1, names.get(X));
        await expect(menu.getByRole('menuitem', { name: '투표취소' })).toBeVisible();
        await closeMenu(h1);
    }
    const plan = massPlan(t, X);
    await cast(h2, X, names);
    const fullAt = await castBotsLast(t, plan);
    await Promise.all([h1, h2].map((h) => expectSettleShown(h)));
    const resolved = await expectFiveSeconds(t.bots[1], fullAt, 1);
    expect(resolved.tribunalTargetUuid).toBe(X);
});

test('A03-H-031 6명 판(사람 3) 재판 넘어간 뒤 옛 화면에서 늦게 누름 → 막힘, 다른 사람 화면 영향 없음 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [h1, h2, h3] = await openHumans(user, players, 3);
    const t = await openVoteMany(table, [h1, h2, h3], 6);
    const names = await namesOf(t);
    const [X, Y, b2] = t.bots.map(uuidOf);
    // h1·h2·봇1·봇2 → X, X → Y, h3 기권 → X 4·Y 1·기권 1 → X 재판
    const plan = new Map([[uuidOf(h1), X], [uuidOf(h2), X], [uuidOf(h3), null], [X, Y], [Y, X], [b2, X]]);
    await castHumans(t, plan, names);
    const panels = [await openStatus(h1.page), await openStatus(h2.page)];
    // h3는 판정 전에 Y 카드 '투표하기'를 열어 둔 채(옛 화면) 기다림
    const stale = await openMenu(h3, names.get(Y));
    await castBots(t, plan);
    await D.waitState(t, (g) => g.phase === 'TRIBUNAL');
    await stale.getByRole('menuitem', { name: '투표하기' }).click({ timeout: 2_000 }).catch(() => {});
    // 판은 그대로 X 재판, 모든 화면 같음
    const s = await t.state();
    expect(s.phase).toBe('TRIBUNAL');
    expect(s.tribunal?.defendantUuid).toBe(X);
    for (const [i, h] of [h1, h2].entries()) await expectOutcome(h.page, panels[i], 'TRIBUNAL', names.get(X));
    await expect(tribunalOf(h3.page)).toContainText(names.get(X));
    await expect(abstainButton(h3.page)).toHaveCount(0);
});

test('A03-H-037 6명 판(사람 3) 5초 중 사람끼리 채팅 → 서로 보임 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = await openHumans(user, players, 3);
    const t = await openVoteMany(table, humans, 6);
    const names = await namesOf(t);
    // 모두 기권 (밤으로 가도 낮 채팅 줄을 봄)
    const plan = new Map([...humans.map((h) => [uuidOf(h), null]), ...t.bots.map((b) => [uuidOf(b), null])]);
    await castHumans(t, plan, names);
    const fullAt = await castBotsLast(t, plan);
    await expectSettleShown(humans[0]);
    const lines = [`h037a${Date.now() % 100000}`, `h037b${Date.now() % 100000}`];
    await Promise.all([ui.sendChat(humans[0].page, lines[0]), ui.sendChat(humans[1].page, lines[1])]);
    for (const h of humans) for (const line of lines) await expect(ui.chatLog(h.page)).toContainText(line, { timeout: 3_000 });
    const seenAt = Date.now();
    const resolved = await eventAt(t.bots[1], 'day_vote_resolved', { since: fullAt, match: (p) => p.dayIndex === 1 });
    // 채팅이 다 보인 것은 판정 전 (5초 안)
    expect(seenAt).toBeLessThan(resolved.at);
});

test('A03-H-039 9명 판(사람 3) 다 냄 → 5초, 세 화면 같은 결과 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = await openHumans(user, players, 3);
    const t = await openVoteMany(table, humans, 9);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    const plan = massPlan(t, X);
    await castHumans(t, plan, names);
    const panels = [];
    for (const h of humans) panels.push(await openStatus(h.page));
    const fullAt = await castBotsLast(t, plan);
    await expectFiveSeconds(t.bots[1], fullAt, 1);
    for (const [i, h] of humans.entries()) await expectOutcome(h.page, panels[i], 'TRIBUNAL', names.get(X));
});
