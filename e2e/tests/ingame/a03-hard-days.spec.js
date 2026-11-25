'use strict';

// 낮 투표 여러 날·여러 판 어려움 시험: 1~3일 처음부터 끝까지·같은 방 두 번째 판·아무도 안 냄·2일 산 4명·3일 내내 5초·PC 2+모바일 2 두 날
// 목록 A03-낮투표.md A03-H-010·011·024·025·026·027, 돌리지 않고 모임만: npx playwright test --list tests/ingame/a03-hard-days.spec.js
const { test, expect, E2E } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const { e2e } = require('../../helpers/internal');
const D = require('./a-day/_lib');
const { waitResult } = require('../room/roomHelpers');
const { talk, openPlayer, closeRoster, trialAny, expectTrialOf } = require('../mobile/_talk');

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
async function openHumans(user, players, count, { mobileAt = [] } = {}) {
    const list = [{ ...user, mobile: false }];
    for (let i = 1; i < count; i += 1) list.push(await addPerson(players, { mobile: mobileAt.includes(i) }));
    return list;
}

// 새 날 투표 시작 때 현황 창이 "집계 전"인지 (어제 결과가 안 남음) 보고 닫음
async function expectFreshStatus(humans) {
    for (const h of humans) {
        const panel = await openStatus(h.page);
        await expect(panel.getByTestId('vote-status-unresolved')).toHaveText('집계 전');
        await closeStatus(h.page);
    }
}

// 하루 투표: 사람 표 → 현황 창 열기 → 봇 마지막 표 → 판정 화면 확인 (재판이면 대상, 밤이면 밤 안내)
async function voteDay(t, plan, names, day, kind, { target, abstain, humans = t.humans } = {}) {
    await castHumans(t, plan, names, humans);
    const panels = [];
    for (const h of humans) panels.push(await openStatus(h.page));
    const fullAt = await castBotsLast(t, plan);
    const resolved = await expectFiveSeconds(t.bots.find((b) => plan.has(uuidOf(b))), fullAt, day);
    expect(resolved.outcome).toBe(kind);
    for (const [i, h] of humans.entries()) {
        await expectOutcome(h.page, panels[i], kind, target ? names.get(target) : undefined);
        if (abstain !== undefined) await expect(panels[i].getByTestId('vote-status-public-abstain-count')).toHaveText(String(abstain));
    }
}

// 토론에서 모두 준비 (봇은 소켓, 사람은 화면 단추) → 바로 투표 단계
async function allReady(t, humans) {
    for (const bot of t.bots) {
        const reply = await bot.request('ready_for_day_vote', { gameId: t.gameId });
        expect(reply?.ok, `봇 준비 거절: ${reply?.code}`).toBe(true);
    }
    for (const h of humans) await h.page.locator('[data-ingame-phase-action="dayReady"]').click();
    for (const h of humans) await expect(abstainButton(h.page)).toBeEnabled({ timeout: 5_000 });
    expect((await t.state()).dayPhase).toBe('DAY_VOTE');
}

// ── 시험 ──

test('A03-H-010 8명 판(사람 3) 1일 재판 → 2일 기권 많음 밤 → 3일 동점 밤, 세 화면 날마다 결과·표시 맞음 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const humans = await openHumans(user, players, 3);
    const t = await openVoteMany(table, humans, 8);
    const names = await namesOf(t);
    const [b0, b1, b2, b3, b4] = t.bots.map(uuidOf);
    const [a, b, c] = humans.map(uuidOf);

    // 1일: 전원 봇0(시민), 봇0은 기권 → 재판 → 봇 유죄 → 처형
    const day1 = new Map([[a, b0], [b, b0], [c, b0], [b0, null], [b1, b0], [b2, b0], [b3, b0], [b4, b0]]);
    await voteDay(t, day1, names, 1, 'TRIBUNAL', { target: b0, abstain: 1 });
    await finishTribunalGuilty(t, b0);
    for (const h of humans) await closeStatus(h.page);

    // 2일 (산 7): a만 봇1, 나머지 기권 → 기권 많음 밤
    await toDayVote(t, 2);
    await expectFreshStatus(humans);
    const day2 = new Map([[a, b1], [b, null], [c, null], [b1, null], [b2, null], [b3, null], [b4, null]]);
    await voteDay(t, day2, names, 2, 'ABSTAIN_MAJORITY', { abstain: 6 });
    for (const h of humans) await closeStatus(h.page);

    // 3일 (산 7): 봇1 3(a·c·봇2)·봇2 3(b·봇1·봇3)·기권 1 → 동점 밤
    await toDayVote(t, 3);
    await expectFreshStatus(humans);
    const day3 = new Map([[a, b1], [b, b2], [c, b1], [b1, b2], [b2, b1], [b3, b2], [b4, null]]);
    await voteDay(t, day3, names, 3, 'TIE', { abstain: 1 });
    expect((await t.state()).dayIndex).toBe(3);
});

test('A03-H-011 6명 판(사람 2) 같은 방 두 번째 판 첫 낮 다 내면 5초 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const humans = await openHumans(user, players, 2);
    const t = await openVoteMany(table, humans, 6);
    const names = await namesOf(t);
    // 첫 판: 광대(봇 3)를 몰표로 처형 → 시민 승 → 결과 화면 (앞 단계)
    const joker = uuidOf(t.bots[3]);
    expect((await t.player(joker)).role).toBe('JOKER');
    const first = new Map([...humans.map((h) => [uuidOf(h), joker]), ...t.bots.map((b) => [uuidOf(b), uuidOf(b) === joker ? null : joker])]);
    await castHumans(t, first, names);
    await castBots(t, first);
    await finishTribunalGuilty(t, joker);
    for (const h of humans) await waitResult(h.page);
    const firstGameId = t.gameId;

    // 같은 방으로: 봇 먼저 (첫 판 끝 때 방장이던 봇 0이 다시 방장), 사람은 "대기방으로"
    for (const bot of t.bots) {
        const back = await bot.request('return_to_room', { gameId: firstGameId });
        expect(back?.ok, `봇 대기방으로 거절: ${back?.code}`).toBe(true);
    }
    for (const h of humans) {
        await h.page.getByRole('button', { name: '대기방으로' }).click();
        await expect(h.page).toHaveURL(/\/game-matching/);
    }
    const room = await e2e.roomOf(uuidOf(t.bots[0]));
    expect(room?.hostUuid).toBe(uuidOf(t.bots[0]));
    for (const bot of t.bots) await bot.setReady(room.roomId, room.settingsVersion);
    for (const h of humans) await ui.readyUi(h.page);
    const roles = rolePlan(6);
    await e2e.setRoles(roles({ humans: t.humans, bots: t.bots }), { roomId: room.roomId });
    const started = await t.bots[0].startGame(room.roomId, room.settingsVersion);
    t.gameId = started.gameId;
    expect(t.gameId).not.toBe(firstGameId);
    for (const h of humans) await expect(h.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expectRoles(t, roles);

    // 둘째 판 첫 낮: 몰표 다 냄 → 5초
    await D.toDay(t);
    await D.toVote(t);
    const X = uuidOf(t.bots[0]);
    const plan = new Map([...humans.map((h) => [uuidOf(h), X]), ...t.bots.map((b) => [uuidOf(b), uuidOf(b) === X ? null : X])]);
    await castHumans(t, plan, names);
    const fullAt = await castBotsLast(t, plan);
    await Promise.all(humans.map((h) => expectSettleShown(h)));
    const resolved = await expectFiveSeconds(t.bots[1], fullAt, 1);
    expect(resolved.gameId).toBe(t.gameId);
    for (const h of humans) await expect(tribunalOf(h.page)).toContainText(names.get(X), { timeout: 5_000 });
});

test('A03-H-024 6명 판(사람 3) 아무도 안 냄 → 30초 끝에 세 화면 "전원 기권"·밤 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = await openHumans(user, players, 3);
    const t = await openVoteMany(table, humans, 6, { settings: { dayVoteTime: 30 } });
    const deadline = await voteDeadline(t.bots[1], 1);
    const panels = [];
    for (const h of humans) panels.push(await openStatus(h.page));
    await expectAtDeadline(t.bots[1], deadline, 1);
    for (const [i, h] of humans.entries()) await expectOutcome(h.page, panels[i], 'ABSTAINED');
});

test('A03-H-025 5명 판(사람 2) 2일 산 4명 다 냄 → 5초 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const humans = await openHumans(user, players, 2);
    const t = await openVoteMany(table, humans, 5);
    const names = await namesOf(t);
    const [b0, b1, b2] = t.bots.map(uuidOf);
    // 1일: 봇0(시민) 처형 (앞 단계)
    const day1 = new Map([...humans.map((h) => [uuidOf(h), b0]), [b0, null], [b1, b0], [b2, b0]]);
    await castHumans(t, day1, names);
    await castBots(t, day1);
    await finishTribunalGuilty(t, b0);
    // 2일 산 4명: 사람 2·봇2 → 봇1, 봇1 기권 → 다 참 → 5초 뒤 봇1 재판
    await toDayVote(t, 2);
    const day2 = new Map([...humans.map((h) => [uuidOf(h), b1]), [b1, null], [b2, b1]]);
    await castHumans(t, day2, names);
    const fullAt = await castBotsLast(t, day2);
    await Promise.all(humans.map((h) => expectSettleShown(h)));
    const resolved = await expectFiveSeconds(t.bots[1], fullAt, 2);
    expect(resolved.tribunalTargetUuid).toBe(b1);
    for (const h of humans) await expect(tribunalOf(h.page)).toContainText(names.get(b1), { timeout: 5_000 });
});

test('A03-H-026 8명 판(사람 3) 3일 내내 다 내면 날마다 다시 5초 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const humans = await openHumans(user, players, 3);
    const t = await openVoteMany(table, humans, 8);
    const names = await namesOf(t);
    for (const day of [1, 2, 3]) {
        if (day > 1) await toDayVote(t, day);
        // 모두 기권 → 다 참 → 5초 뒤 밤 (아무도 안 죽어 다음 날도 8명)
        const plan = new Map([...humans.map((h) => [uuidOf(h), null]), ...t.bots.map((b) => [uuidOf(b), null])]);
        await castHumans(t, plan, names);
        const fullAt = await castBotsLast(t, plan);
        await Promise.all(humans.map((h) => expectSettleShown(h)));
        await expectFiveSeconds(t.bots[0], fullAt, day);
        await D.waitState(t, (g) => g.phase === 'NIGHT' && g.dayIndex === day);
    }
});

test('A03-H-027 6명 판 PC 2 + 모바일 2: 토론 전원 준비 → 투표 → 다 냄 5초 → 기권 많음 밤 → 2일 같은 흐름 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const humans = await openHumans(user, players, 4, { mobileAt: [2, 3] });
    const roles = rolePlan(6);
    const t = await table.setup({ humans, bots: 2, roles, settings: MANY_SETTINGS });
    await expectRoles(t, roles);
    await D.toDay(t);
    const names = await namesOf(t);
    const [X, b1] = t.bots.map(uuidOf);
    for (const day of [1, 2]) {
        if (day > 1) {
            await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === day);
            for (const h of humans) await clearToDay(h);
        }
        await allReady(t, humans);
        // PC 둘 → X, 모바일 둘·봇 둘 기권 → X 2·기권 4 → 밤
        const plan = new Map([[uuidOf(humans[0]), X], [uuidOf(humans[1]), X], [uuidOf(humans[2]), null], [uuidOf(humans[3]), null], [X, null], [b1, null]]);
        await voteDay(t, plan, names, day, 'ABSTAIN_MAJORITY', { abstain: 4 });
        for (const h of humans) await closeStatus(h.page);
    }
});
