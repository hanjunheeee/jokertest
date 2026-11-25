'use strict';

// 모바일 사람이 5초 안에 표를 바꾸는 어려움 시험: 7명 판(PC 1·모바일 2) → 바뀐 표로 판정, PC 화면 결과도 같음
// 목록 A03-낮투표.md A03-H-038, 돌리지 않고 모임만: npx playwright test --list tests/mobile/a03-hard-settle.spec.js
const { test, expect, E2E } = require('../../helpers/fixtures');
const D = require('../ingame/a-day/_lib');
const { talk, openPlayer, closeRoster, trialAny, expectTrialOf } = require('./_talk');

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

// 재판 창: PC는 재판 연출 창, 모바일(세로 카톡형)은 고발 연출·"최후의 변론" 단추·시트 중 하나
const onPhone = (page) => page.url().startsWith(E2E.mobileUrl);
const tribunalOf = (page) => (onPhone(page) ? trialAny(page).first() : page.locator('[data-ingame-tribunal-presentation]'));

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

// 카드 메뉴 열기: PC는 판 카드 메뉴, 모바일은 플레이어 목록 시트의 그 사람 줄
async function openMenu(h, nick) {
    // 모바일 세로 카톡형: 카드 판 대신 플레이어 목록 시트의 그 사람 줄 (줄 안 menuitem이 카드 메뉴 항목)
    if (isMobile(h)) return openPlayer(h.page, nick);
    await D.card(h.page, nick).click();
    const menu = h.page.getByRole('menu', { name: '플레이어 행동' });
    await expect(menu).toBeVisible();
    return menu;
}

// 카드 메뉴 항목 누름 (투표하기·투표취소), 메뉴가 닫힐 때까지
async function menuPick(h, nick, item) {
    const menu = await openMenu(h, nick);
    await menu.getByRole('menuitem', { name: item }).click();
    // 모바일 목록 시트는 고른 뒤에도 열려 있음 → 닫음
    if (isMobile(h)) await closeRoster(h.page);
    await expect(menu).toBeHidden();
}

// 사람 표: null이면 기권 단추 → 기권 단추가 꺼지면 서버가 받은 것
// 사람이면 그 사람 카드 '투표하기' → 그 카드 메뉴가 '투표취소'면 서버가 받은 것
// (PC·모바일 모두 사람을 찍어도 기권 단추가 안 잠김 — 기권으로 바꾸기 됨, 사용자 결정 2026-11-18)
async function cast(h, target, names) {
    if (target === null) {
        await abstainButton(h.page).click();
        await expect(abstainButton(h.page)).toBeDisabled();
        return;
    }
    await menuPick(h, names.get(target), '투표하기');
    await expectVotedFor(h, names.get(target));
}

// 그 사람 카드 메뉴(모바일은 목록 시트 줄)에 '투표취소'가 보일 때까지, 본 뒤 닫음 (PC는 Esc, 모바일은 목록 닫기)
async function expectVotedFor(h, nick) {
    let menu = null;
    await expect(async () => {
        if (!menu || !(await menu.isVisible().catch(() => false))) menu = await openMenu(h, nick);
        await expect(menu.getByRole('menuitem', { name: '투표취소' })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });
    if (isMobile(h)) await closeRoster(h.page);
    else await h.page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
}

// 이미 낸 표 바꾸기: 다른 사람이면 그 카드 '투표하기', 기권이면 기권 단추
// '투표취소'는 기권이 아니라 표 거두기(안 낸 사람으로 돌아감, 사용자 결정 2026-11-18)
// PC·모바일 모두 찍은 뒤에도 기권 단추가 켜져 바로 누름
async function change(h, from, to, names) {
    if (to !== null) {
        await menuPick(h, names.get(to), '투표하기');
        return;
    }
    await abstainButton(h.page).click();
    await expect(abstainButton(h.page)).toBeDisabled();
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
        // 모바일은 시트 설명 "피고: 닉네임"으로 봄
        if (onPhone(page)) await expectTrialOf(page, targetNick);
        else await expect(tribunalOf(page)).toContainText(targetNick);
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

// ── 시험 ──

test('A03-H-038 7명 판(PC 1·모바일 2) 모바일 사람이 5초 중 바꿈 → 바뀐 표로 판정, PC 화면 결과도 같음 @game @hard @realtime @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    // 이 파일은 모바일 프로젝트: 기본 user가 모바일, PC 사람은 따로 엶
    const m1 = { ...user, mobile: true };
    const m2 = await addPerson(players, { mobile: true });
    const pc = await addPerson(players, { mobile: false });
    const t = await openVoteMany(table, [m1, m2, pc], 7);
    const names = await namesOf(t);
    const [X, Y, b2, b3] = t.bots.map(uuidOf);
    // 봇: X→Y, Y→X, 봇2→X, 봇3→Y / m1·m2 → X, pc 기권 → X 4·Y 2·기권 1 (X 재판 모양)
    // m1이 5초 안에 Y로 바꾸면 X 3·Y 3·기권 1 → 동점 밤
    const plan = new Map([[uuidOf(m1), X], [uuidOf(m2), X], [uuidOf(pc), null], [X, Y], [Y, X], [b2, X], [b3, Y]]);
    await castHumans(t, plan, names);
    const fullAt = await castBotsLast(t, plan);
    await expectSettleShown(m1);
    await change(m1, X, Y, names);
    const panels = [];
    for (const h of t.humans) panels.push(await openStatus(h.page));
    const resolved = await expectFiveSeconds(t.bots[2], fullAt, 1);
    expect(resolved.outcome).toBe('TIE');
    for (const [i, h] of t.humans.entries()) await expectOutcome(h.page, panels[i], 'TIE');
});
