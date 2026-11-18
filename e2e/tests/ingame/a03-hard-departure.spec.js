'use strict';

// 낮 투표 중 누가 나가거나 끊길 때 어려움 시험: 탭 닫기(60초 기다림이라 다 찬 것 아님)·"나가기"(다 차면 5초)·찍힌 사람 나감·마지막 표 뒤 끊김·59초 안 돌아옴·60초 탈락
// 목록 A03-낮투표.md A03-H-007·008·009·020·021·032, 돌리지 않고 모임만: npx playwright test --list tests/ingame/a03-hard-departure.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const D = require('./a-day/_lib');
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

// 투표 마감 시각 (투표 단계 알림에 실린 값)
async function voteDeadline(bot, day) {
    const p = await bot.waitForEvent('day_phase_changed', { match: (x) => x.dayPhase === 'DAY_VOTE' && x.dayIndex === day });
    return p.dayPhaseDeadline;
}

// 마감 판정: 당김 알림 없이 원래 마감(±1.5초)에 판정 → 판정 값
async function expectAtDeadline(watcher, deadline, day) {
    const resolved = await eventAt(watcher, 'day_vote_resolved', {
        match: (p) => p.dayIndex === day, timeoutMs: Math.max(0, deadline - Date.now()) + 20_000,
    });
    expect(Math.abs(resolved.at - deadline)).toBeLessThanOrEqual(1_500);
    const pulled = watcher.events.filter((r) => r.event === 'phase_settle_started' && r.payload?.phase === 'DAY' && r.payload?.dayIndex === day);
    expect(pulled, '마감 당김 알림이 오면 안 됨').toHaveLength(0);
    return resolved.payload;
}

// 사람 여럿 열기 (첫 사람은 기본 user, 나머지는 새 계정·새 창)
async function openHumans(user, players, count) {
    const list = [{ ...user, mobile: false }];
    for (let i = 1; i < count; i += 1) list.push(await addPerson(players));
    return list;
}

// 그날 낮 당김 알림이 몇 번 왔나
const countSettles = (bot, day) => bot.events.filter((r) => r.event === 'phase_settle_started' && r.payload?.phase === 'DAY' && r.payload?.dayIndex === day).length;

// PC 판 화면 "게임 나가기" → 확인 창(브라우저 확인 창) 수락
async function leaveByUi(h) {
    h.page.once('dialog', (dialog) => dialog.accept().catch(() => {}));
    await h.page.getByRole('button', { name: '게임 나가기' }).click();
    await expect(h.page).not.toHaveURL(/\/ingame/, { timeout: 15_000 });
}

// ── 시험 ──

test('A03-H-007 6명 판(사람 3) 안 낸 사람이 탭 닫음 → 60초 기다림 중이라 다 찬 것 아님, 원래 마감(30초)에 판정·그 사람 기권 @game @hard @realtime @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [h1, h2, h3] = await openHumans(user, players, 3);
    const t = await openVoteMany(table, [h1, h2, h3], 6, { settings: { dayVoteTime: 30 } });
    const deadline = await voteDeadline(t.bots[1], 1);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    // h3 탭 닫음 (표 안 냄) → 나머지: h1·h2·봇1·봇2 → X, X 기권 → 마감에 X 4·기권 2(X·h3)
    await h3.context.close();
    const plan = new Map([[uuidOf(h1), X], [uuidOf(h2), X], ...t.bots.map((b) => [uuidOf(b), uuidOf(b) === X ? null : X])]);
    await castHumans(t, plan, names, [h1, h2]);
    const panels = [await openStatus(h1.page), await openStatus(h2.page)];
    await castBots(t, plan);
    const resolved = await expectAtDeadline(t.bots[1], deadline, 1);
    expect(resolved.publicAbstainCount).toBe(2);
    for (const [i, h] of [h1, h2].entries()) {
        await expectOutcome(h.page, panels[i], 'TRIBUNAL', names.get(X));
        await expect(panels[i].getByTestId('vote-status-public-abstain-count')).toHaveText('2');
    }
});

test('A03-H-008 7명 판(사람 3) 안 낸 사람이 "나가기" → 남은 사람 다 냄 → 5초 뒤 판정 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [h1, h2, h3] = await openHumans(user, players, 3);
    const t = await openVoteMany(table, [h1, h2, h3], 7);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    const plan = new Map([[uuidOf(h1), X], [uuidOf(h2), X], ...t.bots.map((b) => [uuidOf(b), uuidOf(b) === X ? null : X])]);
    await castHumans(t, plan, names, [h1, h2]);
    const panels = [await openStatus(h1.page), await openStatus(h2.page)];
    await castBots(t, plan);
    // 남은 한 사람(h3)이 안 내고 나감 → 그때 다 참
    const fullAt = Date.now();
    await leaveByUi(h3);
    await expectFiveSeconds(t.bots[1], fullAt, 1);
    expect((await t.player(uuidOf(h3))).alive).toBe(false);
    for (const [i, h] of [h1, h2].entries()) await expectOutcome(h.page, panels[i], 'TRIBUNAL', names.get(X));
});

test('A03-H-009 7명 판(사람 3) 찍힌 사람이 5초 중 나감 → 그 표 기권으로 다시 셈, 남은 화면 결과가 다시 센 값 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = await openHumans(user, players, 3);
    const t = await openVoteMany(table, humans, 7);
    const names = await namesOf(t);
    const [X, Y, b2, b3] = t.bots.map(uuidOf);
    // X 3(사람 3)·Y 2(X·봇2)·기권 2(Y·봇3) → X가 나가면 Y 1·기권 5 → 밤
    const plan = new Map([...humans.map((h) => [uuidOf(h), X]), [X, Y], [Y, null], [b2, Y], [b3, null]]);
    await castHumans(t, plan, names);
    const panels = [];
    for (const h of humans) panels.push(await openStatus(h.page));
    const fullAt = await castBotsLast(t, plan);
    await expectSettleShown(humans[0]);
    const left = await t.bots[0].request('leave_game_session', { gameId: t.gameId });
    expect(left?.ok, `나가기 거절: ${left?.code}`).toBe(true);
    // 판정은 처음 다 찬 때부터 5초 (나가도 안 늘어남)
    const resolved = await expectFiveSeconds(t.bots[2], fullAt, 1);
    expect(resolved.outcome).toBe('ABSTAIN_MAJORITY');
    expect(resolved.publicAbstainCount).toBe(5);
    for (const [i, h] of humans.entries()) {
        await expectOutcome(h.page, panels[i], 'ABSTAIN_MAJORITY');
        await expect(panels[i].getByTestId('vote-status-public-abstain-count')).toHaveText('5');
    }
});

test('A03-H-020 6명 판(사람 2) 마지막 표 낸 사람이 바로 끊김 → 판정 그대로 5초 뒤, 남은 화면 결과 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [h1, h2] = await openHumans(user, players, 2);
    const t = await openVoteMany(table, [h1, h2], 6);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    const plan = new Map([[uuidOf(h1), X], [uuidOf(h2), X], ...t.bots.map((b) => [uuidOf(b), uuidOf(b) === X ? null : X])]);
    await castBots(t, plan);
    await cast(h1, X, names);
    const panel = await openStatus(h1.page);
    const fullAt = Date.now();
    await cast(h2, X, names);
    await h2.context.close();
    await expectFiveSeconds(t.bots[1], fullAt, 1);
    await expectOutcome(h1.page, panel, 'TRIBUNAL', names.get(X));
});

test('A03-H-021 6명 판(사람 2) 끊긴 사람이 59초 안 돌아와 표 냄 → 다 참 → 5초 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [h1, h2] = await openHumans(user, players, 2);
    const t = await openVoteMany(table, [h1, h2], 6, { settings: { dayVoteTime: 90 } });
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    // h2 끊김 (탭 닫기) → 나머지 다 냄 → 다 찬 것 아님 (h2는 60초 기다림 중 산 사람)
    const goneAt = Date.now();
    await h2.context.close();
    const plan = new Map([[uuidOf(h1), X], ...t.bots.map((b) => [uuidOf(b), uuidOf(b) === X ? null : X])]);
    await cast(h1, X, names);
    await castBots(t, plan);
    expect(countSettles(t.bots[1], 1)).toBe(0);
    // 같은 계정으로 다시 접속 → 로비가 판 화면으로 되돌림 → 표 냄 (59초 안)
    const back = { ...await players.add({ account: h2.account, lobby: false }), mobile: false };
    await back.page.goto('/lobby');
    await expect(back.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    // 낮 투표 중 새 창으로 돌아오면 역할 창은 안 뜸(사용자 결정 2026-11-16 일곱째 고를 것 4) → 안내 창만 닫고 역할 창이 없는지 봄
    await expect(async () => {
        await ui.closeOverlays(back.page, { names: ['단계 전환 안내', '알림', '내 역할 보기'], keepWatching: false, rounds: 2 });
        await expect(back.page.getByRole('dialog', { name: '내 역할 보기' })).toHaveCount(0, { timeout: 1_000 });
        await expect(abstainButton(back.page)).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    const panel = await openStatus(h1.page);
    // 메뉴를 먼저 열고 "투표하기" 누르기 바로 앞 시각을 다 찬 때로 잼 (메뉴 여는 시간이 5초에 안 섞이게)
    const menu = await openMenu(back, names.get(X));
    const fullAt = Date.now();
    expect(fullAt - goneAt).toBeLessThan(59_000);
    await menu.getByRole('menuitem', { name: '투표하기' }).click();
    await expect(menu).toBeHidden();
    // 서버가 받은 표시: X 카드 메뉴가 '투표취소' (PC는 찍어도 기권 단추가 안 잠김, 2026-11-18)
    await expectVotedFor(back, names.get(X));
    await expectSettleShown(back);
    await expectFiveSeconds(t.bots[1], fullAt, 1);
    await expectOutcome(h1.page, panel, 'TRIBUNAL', names.get(X));
    await expect(tribunalOf(back.page)).toContainText(names.get(X));
});

test('A03-H-032 6명 판(사람 2, 투표 90초) 끊긴 사람 60초 탈락으로 다 참 → 그때+5초 판정 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const [h1, h2] = await openHumans(user, players, 2);
    const t = await openVoteMany(table, [h1, h2], 6, { settings: { dayVoteTime: 90 } });
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    const closeAt = Date.now();
    await h2.context.close();
    // 60초는 서버가 끊김을 안 때부터 셈 → 판 사람들이 받는 끊김 알림 시각을 시작으로 잼 (탭 닫기가 늦게 닿는 만큼 안 섞이게)
    const gone = await eventAt(t.bots[1], 'session_player_connection_changed', { since: closeAt, match: (p) => p.uuid === uuidOf(h2) && p.isConnected === false });
    const goneAt = gone.at;
    const plan = new Map([[uuidOf(h1), X], ...t.bots.map((b) => [uuidOf(b), uuidOf(b) === X ? null : X])]);
    await cast(h1, X, names);
    const panel = await openStatus(h1.page);
    await castBots(t, plan);
    // 60초 기다림(손잡이 안 씀) 끝에 탈락 → 산 사람 다 냄 → 그때 당김, 5초 뒤 판정
    const settle = await eventAt(t.bots[1], 'phase_settle_started', { match: (p) => p.phase === 'DAY' && p.dayIndex === 1, timeoutMs: 90_000 });
    expect(settle.at - goneAt).toBeGreaterThanOrEqual(60_000 - 1_500);
    expect(settle.at - goneAt).toBeLessThanOrEqual(60_000 + 1_500);
    expect((await t.player(uuidOf(h2))).alive).toBe(false);
    await expectFiveSeconds(t.bots[1], settle.at - 200, 1);
    await expectOutcome(h1.page, panel, 'TRIBUNAL', names.get(X));
});
