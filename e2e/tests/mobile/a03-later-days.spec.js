'use strict';

// 모바일 둘째 날·둘째 판 낮 투표 시험: 1일 표가 2일에 안 남음·2일도 다 내면 5초·당김 표시가 다음 날에 안 남음·같은 방 두 번째 판도 5초
// 목록 A03-낮투표.md A03-E-200·202·207·209 (모바일 몫), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a03-later-days.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const { e2e } = require('../../helpers/internal');
const { playToResult } = require('../room/roomHelpers');
const { talk, startTalkGame, toDay, toVote, clearOverlays, openPlayer, pickPlayer, closeRoster } = require('./_talk');

// ── 이 파일 도우미 (공용으로 올릴 후보: 모바일 낮 투표 묶음) ──

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

// 판 차리고 제 1일 낮 투표까지 (역할 공개·토론은 이 시험이 보는 규칙이 아니라 손잡이로 빨리)
async function openVote(table, user, n, { humanRoles, settings } = {}) {
    const roles = rolePlan(n, humanRoles);
    const t = await startTalkGame(table, user, { bots: n - 1, roles, settings });
    await expectRoles(t, roles);
    await toDay(t, user.page);
    await toVote(t, user.page);
    return t;
}

// uuid → 닉네임
async function namesOf(t) {
    const s = await t.state();
    return new Map(s.players.map((p) => [p.uuid, p.nickname]));
}

const uuidOf = (who) => who.account.uuid;

const abstainButton = (page) => page.getByRole('button', { name: '기권' });

// 세로 카톡형: 카드 판 대신 플레이어 목록 시트 줄마다 행동 단추 (카드 메뉴와 같은 항목·이름) — _talk.js openPlayer·pickPlayer
// 그 사람 줄 열기 (목록 시트를 열고 줄을 줌, 줄 안 menuitem이 카드 메뉴 항목)
const openSheet = (page, nick) => openPlayer(page, nick);

// 사람 표: null이면 기권 단추 → 기권 단추가 꺼지면 서버가 받은 것
// 사람이면 목록 그 사람 줄 '투표하기' → 그 줄이 '투표취소'면 서버가 받은 것
// (사람을 찍어도 기권 단추가 안 잠김 — 기권으로 바꾸기 됨, PC와 같음, 사용자 결정 2026-11-18)
async function castMine(page, target, names) {
    if (target === null) {
        await abstainButton(page).click();
        await expect(abstainButton(page)).toBeDisabled();
        return;
    }
    await pickPlayer(page, names.get(target), '투표하기', { after: '투표취소' });
}

// 봇 표 (계획에 있는 봇만, 서버 답 ok까지)
async function castBots(t, plan, bots = t.bots) {
    for (const bot of bots) {
        if (!plan.has(uuidOf(bot))) continue;
        const reply = await bot.request('cast_day_vote', { gameId: t.gameId, targetId: plan.get(uuidOf(bot)) });
        expect(reply?.ok, `봇 낮 표 거절: ${reply?.code}`).toBe(true);
    }
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

const noticeOf = (page) => page.getByRole('dialog', { name: '단계 전환 안내' });

// 다음 날 투표까지: 밤 차례는 손잡이로 넘기고(앞 단계) "낮이 되었습니다" 확인 → 토론 넘기기 → 기권 단추
async function toDayVote(t, page, day) {
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === day);
    await expect(async () => {
        const notice = noticeOf(page);
        if (await notice.isVisible() && (await notice.innerText()).includes('밤이 되었습니다')) {
            await notice.getByRole('button', { name: '확인' }).click();
        }
        await expect(notice).toContainText('낮이 되었습니다', { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await noticeOf(page).getByRole('button', { name: '확인' }).click();
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === day && s.dayPhase === 'DAY_VOTE');
    await clearOverlays(page);
    await expect(abstainButton(page)).toBeVisible();
    await expect(talk.phaseLine(page)).toContainText(`제 ${day}일`);
}

// 모두 기권으로 다 냄 (사람 먼저, 마지막 봇 직전 시각 = 다 찬 때)
async function allAbstain(t, page) {
    const names = await namesOf(t);
    await castMine(page, null, names);
    const plan = new Map(t.bots.map((b) => [uuidOf(b), null]));
    await castBots(t, plan, t.bots.slice(0, -1));
    const fullAt = Date.now();
    await castBots(t, plan, t.bots.slice(-1));
    return fullAt;
}

// 판정 뒤 밤이 될 때까지
async function waitNight(t) {
    await expect.poll(async () => (await t.state())?.phase, { timeout: 15_000 }).toBe('NIGHT');
}

// ── 시험 ──

test('A03-E-200 모바일 7명 판 1일에 표 낸 사람 → 2일 화면에 낸 표시 없음 @game @smoke', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openVote(table, user, 7);
    const names = await namesOf(t);
    const X = uuidOf(t.bots[0]);
    // 1일: 사람이 X, 봇 기권 → 기권 많음 밤
    await castMine(user.page, X, names);
    await castBots(t, new Map(t.bots.map((b) => [uuidOf(b), null])));
    await waitNight(t);
    await toDayVote(t, user.page, 2);
    // 2일: 기권 켜짐, 목록 X 줄은 다시 '투표하기'
    await expect(abstainButton(user.page)).toBeEnabled();
    const sheet = await openSheet(user.page, names.get(X));
    await expect(sheet.getByRole('menuitem', { name: '투표하기' })).toBeEnabled();
    await expect(sheet.getByRole('menuitem', { name: '투표취소' })).toHaveCount(0);
});

test('A03-E-202 모바일 7명 판 1일 5초 뒤 2일 다 내면 다시 "5초 뒤 마감"·5초 @game @realtime', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openVote(table, user, 7);
    const fullAt1 = await allAbstain(t, user.page);
    await expect(talk.phaseLine(user.page)).toContainText('5초 뒤 마감', { timeout: 4_000 });
    await expectFiveSeconds(t.bots[0], fullAt1, 1);
    await waitNight(t);
    await toDayVote(t, user.page, 2);
    const fullAt2 = await allAbstain(t, user.page);
    await expect(talk.phaseLine(user.page)).toContainText('5초 뒤 마감', { timeout: 4_000 });
    expect(await phaseClock(user.page)).toBeLessThanOrEqual(5);
    await expectFiveSeconds(t.bots[0], fullAt2, 2);
});

test('A03-E-207 모바일 6명 판 1일 "5초 뒤 마감" → 2일 투표 시작 때 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openVote(table, user, 6);
    await allAbstain(t, user.page);
    await expect(talk.phaseLine(user.page)).toContainText('5초 뒤 마감', { timeout: 4_000 });
    await waitNight(t);
    await toDayVote(t, user.page, 2);
    await expect(talk.phaseLine(user.page)).not.toContainText('5초 뒤 마감');
    await expect(user.page.locator('[data-ingame-phase-settle]')).toHaveCount(0);
});

test('A03-E-209 모바일 5명 판 같은 방 두 번째 판 첫 낮 다 내면 5초·결과 @game @realtime', async ({ user, table }) => {
    test.setTimeout(300_000);
    // 첫 판: 봇 표로 광대(봇 0) 처형 → 시민 승 → 결과 화면 (앞 단계라 손잡이로 빨리)
    const { t } = await playToResult({ user, table, kind: 'citizenWin' });
    await t.stopBots();
    const firstGameId = t.gameId;

    // 봇 먼저 같은 방으로 돌아감 (첫 판 끝 때 방장이던 봇 0이 다시 방장), 사람은 "대기방으로"
    for (const bot of t.bots) {
        const back = await bot.request('return_to_room', { gameId: firstGameId });
        expect(back?.ok, `봇 대기방으로 거절: ${back?.code}`).toBe(true);
    }
    // 모바일 결과 화면은 결과판 1.5초 뒤 전면 광고 창이 덮음 → 닫고 누름
    await ui.closeResultAd(user.page);
    await user.page.getByRole('button', { name: '대기방으로' }).click();
    await expect(user.page).toHaveURL(/\/game-matching/);
    const room = await e2e.roomOf(uuidOf(t.bots[0]));
    expect(room?.hostUuid).toBe(uuidOf(t.bots[0]));
    for (const bot of t.bots) await bot.setReady(room.roomId, room.settingsVersion);
    await ui.readyUi(user.page);

    // 둘째 판: 직업 다시 고정 → 시작
    const roles = rolePlan(5);
    await e2e.setRoles(roles({ humans: t.humans, bots: t.bots }), { roomId: room.roomId });
    const started = await t.bots[0].startGame(room.roomId, room.settingsVersion);
    t.gameId = started.gameId;
    expect(t.gameId).not.toBe(firstGameId);
    await expect(user.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expectRoles(t, roles);
    await ui.readRoleReveal(user.page);
    await toDay(t, user.page);
    await toVote(t, user.page);

    const fullAt = await allAbstain(t, user.page);
    await expect(talk.phaseLine(user.page)).toContainText('5초 뒤 마감', { timeout: 4_000 });
    const resolved = await expectFiveSeconds(t.bots[1], fullAt, 1);
    expect(resolved.gameId).toBe(t.gameId);
    await expect(noticeOf(user.page)).toContainText('밤이 되었습니다', { timeout: 5_000 });
});
