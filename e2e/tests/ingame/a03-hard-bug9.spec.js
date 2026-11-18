'use strict';

// [받은 버그 9] 기권이 많은데 한 명이 투표하면 재판 — 사람 여럿이 같은 판에서 다시 생기는지 보는 어려움 시험 (여러 날·10명 판·PC+모바일)
// 목록 A03-낮투표.md A03-H-001·002·018·019·033·034·035·036, 돌리지 않고 모임만: npx playwright test --list tests/ingame/a03-hard-bug9.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
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

// 사람 표: null이면 기권 단추 → 기권 단추가 꺼지면 서버가 받은 것
// 사람이면 그 사람 카드 '투표하기' → 그 카드 메뉴가 '투표취소'면 서버가 받은 것
// (PC는 사람을 찍어도 기권 단추가 안 잠김 — 기권으로 바꾸기 됨, 사용자 결정 2026-11-18)
async function cast(h, target, names) {
    if (target === null) {
        await abstainButton(h.page).click();
        await expect(abstainButton(h.page)).toBeDisabled();
        return;
    }
    await menuPick(h, names.get(target), '투표하기');
    await expectVotedFor(h, names.get(target));
}

// 그 사람 카드 메뉴(모바일은 카드 시트)에 '투표취소'가 보일 때까지, 본 뒤 닫음 (PC는 Esc, 모바일은 시트 '닫기')
async function expectVotedFor(h, nick) {
    let menu = null;
    await expect(async () => {
        if (!menu || !(await menu.isVisible().catch(() => false))) menu = await openMenu(h, nick);
        await expect(menu.getByRole('menuitem', { name: '투표취소' })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    if (isMobile(h)) await menu.getByRole('button', { name: '닫기' }).click();
    else await h.page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
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

// 표 나누기: order 차례로 X에 x표, Y에 y표, 나머지 기권 (자기는 못 찍어 X는 Y·기권, Y는 X·기권)
// 예: allocate([나, X, Y, 봇2], X, Y, { x: 2, y: 1 }) → 나→X, X→Y, Y→X, 봇2→기권
function allocate(order, X, Y, { x = 0, y = 0 }) {
    const need = { x, y };
    const plan = new Map();
    for (const v of order) {
        if (v !== X && need.x > 0) { need.x -= 1; plan.set(v, X); }
        else if (Y && v !== Y && need.y > 0) { need.y -= 1; plan.set(v, Y); }
        else plan.set(v, null);
    }
    if (need.x > 0 || need.y > 0) throw new Error(`표 나누기 실패 (남은 X ${need.x}·Y ${need.y})`);
    return plan;
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

// 투표 현황 창 닫기 (밤 안내 등이 덮은 동안은 못 누르니 닫힐 때까지 다시)
async function closeStatus(page) {
    const panel = page.getByRole('dialog', { name: '투표 현황' });
    await expect(async () => {
        await ui.closeOverlays(page, { names: ['단계 전환 안내', '밤 역할 안내', '알림', '밤 조사 결과'], keepWatching: true, rounds: 2 });
        if (await panel.isVisible()) await panel.getByRole('button', { name: '투표 현황 닫기' }).click({ timeout: 1_000 });
        await expect(panel).toBeHidden({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
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

// 판정 뒤 사람 화면 전부 같은 결과 (기권 칸 수까지)
async function expectAllOutcome(humans, panels, kind, { targetNick, abstain } = {}) {
    for (const [i, h] of humans.entries()) {
        await expectOutcome(h.page, panels[i], kind, targetNick);
        if (abstain !== undefined) await expect(panels[i].getByTestId('vote-status-public-abstain-count')).toHaveText(String(abstain));
    }
}

// 사람들 표 → 각자 현황 창 열기 → 봇 마지막 표 → 5초(±1.5) 판정 → 판정 값
async function voteAndSettle(t, plan, names, humans, day) {
    await castHumans(t, plan, names, humans);
    const panels = [];
    for (const h of humans) panels.push(await openStatus(h.page));
    const fullAt = await castBotsLast(t, plan);
    const resolved = await expectFiveSeconds(t.bots.find((b) => plan.has(uuidOf(b))), fullAt, day);
    return { panels, resolved };
}

// ── 시험 ──

test('A03-H-001 [버그 9] 7명 판(사람 3: PC 2·모바일 1 + 봇 4) 사람 1명만 X, 나머지 6 기권 → 세 화면 다 재판 창 안 뜨고 밤, "기권이 많아 재판 없음" @game @hard @realtime @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const a = { ...user, mobile: false };
    const b = await addPerson(players);
    const c = await addPerson(players, { mobile: true });
    const t = await openVoteMany(table, [a, b, c], 7);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    const plan = new Map([[uuidOf(a), X], [uuidOf(b), null], [uuidOf(c), null], ...t.bots.map((bot) => [uuidOf(bot), null])]);
    const { panels, resolved } = await voteAndSettle(t, plan, names, t.humans, 1);
    expect(resolved.outcome).toBe('ABSTAIN_MAJORITY');
    await expectAllOutcome(t.humans, panels, 'ABSTAIN_MAJORITY', { abstain: 6 });
});

test('A03-H-002 [버그 9] 7명 판(사람 3) 1일 재판·처형 → 밤 → 2일 1표 5기권 → 밤, 세 화면 같음 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const a = { ...user, mobile: false };
    const b = await addPerson(players);
    const c = await addPerson(players, { mobile: true });
    const t = await openVoteMany(table, [a, b, c], 7);
    const names = await namesOf(t);
    const [X, Y] = t.bots.map(uuidOf);
    // 1일: 사람 3·봇 3이 X(시민 봇 0), X는 기권 → 재판 → 봇 유죄 → X 처형
    const day1 = new Map([...t.humans.map((h) => [uuidOf(h), X]), [X, null], ...t.bots.slice(1).map((bot) => [uuidOf(bot), X])]);
    await castHumans(t, day1, names);
    await castBots(t, day1);
    await finishTribunalGuilty(t, X);
    // 2일 (산 6): 사람 a만 Y, 나머지 기권
    await toDayVote(t, 2);
    const day2 = new Map([[uuidOf(a), Y], [uuidOf(b), null], [uuidOf(c), null], ...t.bots.slice(1).map((bot) => [uuidOf(bot), null])]);
    await castHumans(t, day2, names);
    const panels = [];
    for (const h of t.humans) panels.push(await openStatus(h.page));
    await castBots(t, day2);
    await expectAllOutcome(t.humans, panels, 'ABSTAIN_MAJORITY', { abstain: 5 });
    expect((await t.state()).dayIndex).toBe(2);
});

test('A03-H-018 [버그 9] 6명 판(사람 3) 사람 3이 X, 봇 3 기권 → 밤 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [{ ...user, mobile: false }, await addPerson(players), await addPerson(players)];
    const t = await openVoteMany(table, humans, 6);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    const plan = new Map([...humans.map((h) => [uuidOf(h), X]), ...t.bots.map((bot) => [uuidOf(bot), null])]);
    const { panels, resolved } = await voteAndSettle(t, plan, names, humans, 1);
    expect(resolved.outcome).toBe('ABSTAIN_MAJORITY');
    await expectAllOutcome(humans, panels, 'ABSTAIN_MAJORITY', { abstain: 3 });
});

test('A03-H-019 [버그 9] 7명 판(사람 4) 사람 4가 X, 봇 3 기권 → 재판 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [{ ...user, mobile: false }, await addPerson(players), await addPerson(players), await addPerson(players)];
    const t = await openVoteMany(table, humans, 7);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    const plan = new Map([...humans.map((h) => [uuidOf(h), X]), ...t.bots.map((bot) => [uuidOf(bot), null])]);
    const { panels, resolved } = await voteAndSettle(t, plan, names, humans, 1);
    expect(resolved.outcome).toBe('TRIBUNAL');
    await expectAllOutcome(humans, panels, 'TRIBUNAL', { targetNick: names.get(X), abstain: 3 });
});

test('A03-H-033 [버그 9] 5명 판 사람 5(1~2일) 1일 1표 4기권 → 밤 → 2일 산 4명 2표 2기권 → 밤 @game @hard @realtime', async ({ user, players }) => {
    test.setTimeout(300_000);
    const h1 = { ...user, mobile: false };
    const [h2, h3, h4, h5] = [await addPerson(players), await addPerson(players), await addPerson(players), await addPerson(players)];
    // 사람 5명 판은 봇 방장이 없어 사람이 방장 (화면으로 방 만들기), 광대는 h5
    const presets = { [uuidOf(h1)]: 'CITIZEN', [uuidOf(h2)]: 'CITIZEN', [uuidOf(h3)]: 'CITIZEN', [uuidOf(h4)]: 'CITIZEN', [uuidOf(h5)]: 'JOKER' };
    const t = await hostGame({ host: h1, guests: [h2, h3, h4, h5], roles: presets, settings: { discussion: 90, vote: 60 } });
    await expectRoles(t, () => presets);
    await D.toDay(t);
    await D.toVote(t);
    const names = await namesOf(t);

    // 1일: h1만 h2, h2~h4 기권, 마지막 표는 h5 기권 → 봇이 없어 화면에서 판정 시각을 잼
    await cast(h1, uuidOf(h2), names);
    for (const h of [h2, h3, h4]) await cast(h, null, names);
    const panels1 = [];
    for (const h of [h1, h2, h3, h4]) panels1.push(await openStatus(h.page));
    const shown1 = outcomeShownAt(h1.page);
    const fullAt1 = Date.now();
    await cast(h5, null, names);
    panels1.push(await openStatus(h5.page));
    const at1 = await shown1;
    expect(at1 - fullAt1).toBeGreaterThanOrEqual(3_500);
    expect(at1 - fullAt1).toBeLessThanOrEqual(6_500);
    for (const [i, h] of t.humans.entries()) await expectOutcome(h.page, panels1[i], 'ABSTAIN_MAJORITY');

    // 밤: 광대 h5가 화면으로 h4 암살 → 낮 2일 (밤 차례는 다 고르면 저절로 끝남)
    for (const h of t.humans) await closeStatus(h.page);
    await D.waitState(t, (g) => g.phase === 'NIGHT' && g.nightTurnRole === 'JOKER');
    await expect(async () => {
        await ui.closeOverlays(h5.page, { names: ['단계 전환 안내', '밤 역할 안내', '알림'], keepWatching: false, rounds: 2 });
        await D.cardAction(h5.page, names.get(uuidOf(h4)), '암살');
    }).toPass({ timeout: 30_000 });
    await D.waitState(t, (g) => g.phase === 'DAY' && g.dayIndex === 2, { timeout: 60_000 });
    expect((await t.player(uuidOf(h4))).alive).toBe(false);

    // 2일 (산 4): h2·h3이 h1, h1·h5 기권 → 2 = 2 → 밤
    await toDayVote(t, 2, { dead: [h4] });
    await cast(h2, uuidOf(h1), names);
    await cast(h3, uuidOf(h1), names);
    await cast(h1, null, names);
    const panels2 = [];
    for (const h of [h1, h2, h3, h4]) panels2.push(await openStatus(h.page));
    const shown2 = outcomeShownAt(h1.page);
    const fullAt2 = Date.now();
    await cast(h5, null, names);
    panels2.push(await openStatus(h5.page));
    const at2 = await shown2;
    expect(at2 - fullAt2).toBeGreaterThanOrEqual(3_500);
    expect(at2 - fullAt2).toBeLessThanOrEqual(6_500);
    for (const [i, h] of [h1, h2, h3, h4, h5].entries()) await expectOutcome(h.page, panels2[i], 'ABSTAIN_MAJORITY');
});

// E-034·035: 10명 판(사람 2) X 5표·5기권 → 밤 / X 6표·4기권 → 재판
[
    { no: '034', x: 5, outcome: 'ABSTAIN_MAJORITY', label: 'X 5표·5기권 → 밤' },
    { no: '035', x: 6, outcome: 'TRIBUNAL', label: 'X 6표·4기권 → 재판' },
].forEach(({ no, x, outcome, label }) => {
    test(`A03-H-${no} [버그 9] 10명 판(사람 2) ${label} @game @hard @realtime`, async ({ user, players, table }) => {
        test.setTimeout(240_000);
        const humans = [{ ...user, mobile: false }, await addPerson(players)];
        const t = await openVoteMany(table, humans, 10);
        const names = await namesOf(t);
        const X = uuidOf(t.bots[0]);
        const plan = allocate([...humans.map(uuidOf), ...t.bots.map(uuidOf)], X, null, { x });
        const { panels, resolved } = await voteAndSettle(t, plan, names, humans, 1);
        expect(resolved.outcome).toBe(outcome);
        await expectAllOutcome(humans, panels, outcome, { targetNick: names.get(X), abstain: 10 - x });
    });
});

test('A03-H-036 [버그 9] 8명 판(사람 3) 기권 많음 → 밤 첫 차례 안내가 세 화면에 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = [{ ...user, mobile: false }, await addPerson(players), await addPerson(players)];
    const t = await openVoteMany(table, humans, 8);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    const plan = new Map([[uuidOf(humans[0]), X], ...humans.slice(1).map((h) => [uuidOf(h), null]), ...t.bots.map((bot) => [uuidOf(bot), null])]);
    const { panels, resolved } = await voteAndSettle(t, plan, names, humans, 1);
    expect(resolved.outcome).toBe('ABSTAIN_MAJORITY');
    // 세 화면 같이: 밤 안내 확인 → 첫 차례(광대) 안내 (2.6초만 떠서 화면마다 따로 기다리지 않고 한꺼번에)
    await Promise.all(humans.map(async (h, i) => {
        await expectOutcome(h.page, panels[i], 'ABSTAIN_MAJORITY');
        await noticeOf(h.page).getByRole('button', { name: '확인' }).click();
        await expect(h.page.getByRole('dialog', { name: '밤 역할 안내' })).toContainText('광대의 시간입니다', { timeout: 10_000 });
    }));
    expect((await t.state()).nightTurnRole).toBe('JOKER');
});
