'use strict';

// 끊김 60초를 손잡이 없이 진짜로 기다리는 어려운 브라우저 시험 (PC, 사람 2~4명) — 59초 안에 돌아오면 이어서·60초면 탈락, 끊긴 피고·밤 차례·투표 기권·승패
// 목록 A09-끊김-나가기-탈주.md A09-H-001·003~015·038·059·060, 끊긴 피고는 사용자 결정(2026-11-16 오전 둘째 11번)대로 — 모이는지만: npx playwright test --list tests/ingame/a09-realtime-multi.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const night = require('./b-night/_night');
const A = require('./_a04-multi');
const K = require('./_a09-simple-kit');
const H = require('./_a09-hard-kit');

const { U, nick, GRACE_MS, TOL, REOPEN_AT_MS } = H;
const { trial } = A;

// 사람 둘(ㄱ·ㄴ)을 열고 ㄴ 브라우저에만 소켓 길목을 걸어 둠 (판에 들어가기 전)
async function pairWithGate(user, players) {
    const [a, b] = await H.openPeople(user, players, 2);
    const gate = await H.socketGate(b);
    return { a, b, gate };
}

// 투표 현황 창 열기 (결과 글·기권 수를 보는 칸)
async function openStatus(page) {
    await A.calm(page, () => page.getByRole('button', { name: '투표 현황 열기' }).click({ timeout: 1500 }));
    const panel = page.getByRole('dialog', { name: '투표 현황' });
    await expect(panel).toBeVisible();
    return panel;
}

// 재판이 처형 없이 끝나 밤: 재판 창 없음·추방 연출 없음·밤 안내
async function expectNightNoExpulsion(page) {
    await expect(trial.win(page)).toBeHidden({ timeout: 15_000 });
    await expect(trial.nightNotice(page)).toBeVisible({ timeout: 15_000 });
    await expect(trial.expulsion(page)).toHaveCount(0);
}

test('A09-H-001 6명 판(사람 2 + 봇 4, 토론 30·투표 30·재판 15) ㄴ이 토론 시작에 오프라인 → 단계가 두 번 넘게 바뀐 뒤 59초 안에 온라인 → ㄴ 산 채·지금 단계·남은 시간·직업 그대로, ㄱ 화면 ㄴ 카드 끊김 → 돌아옴 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const t = await H.seat(table, [a, b], { n: 6, times: H.FAST });
    await K.toDay(t);
    await A.calm(a.page);
    await H.watchStatus(a.page, nick(b));
    const dropAt = await H.goOffline(t, b, gate);
    await H.expectStatus(a.page, nick(b), 'disconnected');

    // 앞 단계는 손잡이로 빨리 (확인하려는 것은 60초라 단계 마감은 넘겨도 됨): 토론 → 투표 → 재판 → 밤
    const [x] = await H.botsBy(t, 'CITIZEN');
    const s = await H.pickDefendant(t, U(x), { voters: [a] });
    expect(s.phase, '시민 봇이 피고로 섬').toBe('TRIBUNAL');
    await t.advance();
    await A.waitState(t, (g) => g.phase === 'NIGHT', { message: '아무도 안 내 처형 없이 밤' });
    expect(Date.now() - dropAt, '단계 셋을 넘기는 데 30초 안 걸림 (넘으면 시험 쪽이 느린 것)').toBeLessThan(30_000);

    const backAt = await H.goOnline(t, b, gate, { at: dropAt + REOPEN_AT_MS });
    expect(backAt - dropAt, '60초 안에 돌아와야 이 규칙을 봄').toBeLessThan(GRACE_MS);
    const row = await t.player(U(b));
    expect(row.alive).toBe(true);
    expect(row.isParticipating).toBe(true);

    // 지금 단계: ㄴ 시간 바 단계 글 = ㄱ 시간 바 단계 글, 남은 초 = 서버 마감까지 (초 단위 표시라 ±2초)
    const theirs = await H.readClock(b.page);
    const mine = await H.readClock(a.page);
    expect(theirs.label).toBe(mine.label);
    const deadline = await H.deadlineOf(t);
    expect(Math.abs(theirs.seconds - (deadline - Date.now()) / 1000), 'ㄴ 화면 남은 초').toBeLessThanOrEqual(2);
    await H.expectMyRole(b.page, '시민');

    // ㄱ 화면: 끊김 → 돌아옴
    await H.expectStatus(a.page, nick(b), 'alive');
    expect(await H.statusSeen(a.page, nick(b))).toEqual(['alive', 'disconnected', 'alive']);
    // 처음 끊긴 때부터 60초가 지나도 탈락 없음
    await K.sleepUntil(dropAt + GRACE_MS + TOL);
    expect((await t.player(U(b))).alive).toBe(true);
});

test('A09-H-003 8명 판(사람 2 + 봇 6) ㄴ이 오프라인 61초 → ㄴ 화면 까닭 글 + 방 목록, ㄱ 화면 ㄴ 카드 사망·직업 안 보임 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const messages = H.collectDialogs(b.page);
    const t = await H.seat(table, [a, b], { n: 8 });
    await K.toDay(t);
    await A.calm(a.page);
    const dropAt = await H.goOffline(t, b, gate);
    await H.expectStatus(a.page, nick(b), 'disconnected');

    // 손잡이 없이: 58초엔 아직 끊김(산 채), 60초(±1.5초)에 사망
    await K.sleepUntil(dropAt + GRACE_MS - 2000);
    await H.expectStatus(a.page, nick(b), 'disconnected', 1000);
    const deadAt = await H.statusAt(a.page, nick(b), 'dead', { timeout: 10_000 });
    A.expectNear(deadAt - dropAt, GRACE_MS, '끊긴 지 60초에 ㄱ 화면 ㄴ 카드 사망');
    await H.expectNoRoleOnCard(a.page, nick(b));
    expect((await t.player(U(b))).isParticipating).toBe(false);

    // 61초 넘어 온라인 → 까닭 글 + 방 목록
    await K.sleepUntil(dropAt + GRACE_MS + TOL);
    gate.open();
    await H.expectForfeited(b.page, messages);
});

test('A09-H-004 7명 판(사람 2 + 봇 5) 끊긴 ㄴ을 ㄱ·봇이 찍음 → 결정대로 재판 없이 밤(뽑히는 순간 끊겨 있으면 재판 취소), ㄴ 산 채 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const t = await H.seat(table, [a, b], { n: 7 });
    await H.toVote(t, [a.page]);
    const dropAt = await H.goOffline(t, b, gate);
    await H.expectStatus(a.page, nick(b), 'disconnected');

    // 봇 5 + ㄱ = 6표가 끊긴 ㄴ에게 (기권 1) → 원래면 재판, 결정은 재판 취소하고 밤
    const s = await H.pickDefendant(t, U(b), { voters: [a] });
    expect(s.phase).toBe('NIGHT');
    expect(s.dayIndex, '날짜 그대로').toBe(1);
    expect(K.rowOf(s, U(b)).alive, '끊긴 ㄴ은 처형 안 됨').toBe(true);
    await expectNightNoExpulsion(a.page);
    await expect(trial.win(a.page)).toHaveCount(0);
    await H.expectStatus(a.page, nick(b), 'disconnected');
    expect(Date.now() - dropAt, '60초 안에 일어난 일 (탈락 때문이 아님)').toBeLessThan(GRACE_MS);
});

test('A09-H-005 8명 판(사람 2 + 봇 6, 재판 120초) 피고 ㄴ이 재판 중 오프라인 → 60초가 재판 중에 끝남 → 결정대로 ㄴ 사망, ㄱ 화면 재판 창 닫힘·추방 연출 없이 밤 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const t = await H.seat(table, [a, b], { n: 8 });
    const s = await H.pickDefendant(t, U(b), { voters: [a] });
    expect(s.tribunal?.defendantUuid, '붙어 있는 ㄴ이 피고로 섬').toBe(U(b));
    await expect(trial.win(a.page)).toBeVisible({ timeout: 15_000 });
    await expect(trial.defendantNotice(b.page)).toBeVisible({ timeout: 15_000 });

    const dropAt = await H.goOffline(t, b, gate);
    await H.expectStatus(a.page, nick(b), 'disconnected');
    await K.sleepUntil(dropAt + GRACE_MS - 2000);
    await expect(trial.win(a.page)).toBeVisible();
    const closed = await A.closedAt(a.page, { timeout: 6000 });
    A.expectNear(closed - dropAt, GRACE_MS, '끊긴 지 60초에 재판 창이 닫힘');
    await expectNightNoExpulsion(a.page);
    await H.expectStatus(a.page, nick(b), 'dead');
    const after = await t.state();
    expect(after.phase).toBe('NIGHT');
    expect(K.rowOf(after, U(b)).alive).toBe(false);
});

test('A09-H-006 6명 판(사람 2 + 봇 4, 재판 120초) 피고 ㄴ이 재판 중 오프라인 → 59초 안에 온라인 → ㄴ 재판 창 피고 화면, 무죄 → 밤에 산 채 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const t = await H.seat(table, [a, b], { n: 6 });
    const s = await H.pickDefendant(t, U(b), { voters: [a] });
    expect(s.tribunal?.defendantUuid).toBe(U(b));
    await expect(trial.win(b.page)).toBeVisible({ timeout: 15_000 });

    const dropAt = await H.goOffline(t, b, gate);
    const backAt = await H.goOnline(t, b, gate, { at: dropAt + REOPEN_AT_MS });
    expect(backAt - dropAt, '60초 안에 돌아와야 이 규칙을 봄').toBeLessThan(GRACE_MS);
    await expect(trial.win(b.page)).toBeVisible({ timeout: 15_000 });
    await A.expectNoticeReadable(trial.defendantNotice(b.page));
    // 처음 끊긴 때부터 60초가 지나도 탈락 없이 재판 그대로
    await K.sleepUntil(dropAt + GRACE_MS + TOL);
    expect((await t.player(U(b))).alive).toBe(true);
    await expect(trial.win(b.page)).toBeVisible();

    // 무죄: 봇 넷 + ㄱ → 다 냄 → 5초 뒤 판정
    await H.botsJudge(t, 'NOT_GUILTY');
    await A.pressVote(a.page, 'NOT_GUILTY');
    const after = await A.waitState(t, (g) => g.phase === 'NIGHT', { timeout: 20_000, message: '무죄 판정 뒤 밤' });
    expect(K.rowOf(after, U(b)).alive).toBe(true);
    await expect(trial.win(b.page)).toBeHidden({ timeout: 15_000 });
    await H.expectStatus(a.page, nick(b), 'alive');
});

test('A09-H-007 8명 판(사람 2 + 봇 6, 밤 30초) 의사 ㄴ이 자기 차례에 오프라인 → 차례 마감(30초) 지나 59초 안에 온라인 → 산 채, 그 밤 보호 없음 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const t = await H.seat(table, [a, b], { n: 8, humanRoles: ['CITIZEN', 'DOCTOR'], times: { ...H.ROOMY, nightActionTime: 30 } });
    const [joker] = await H.botsBy(t, 'JOKER');
    const [x] = await H.botsBy(t, 'CITIZEN');
    await night.toTurn(t, 'JOKER', { dayIndex: 1 });
    expect((await night.botNight(t, joker, U(x)))?.ok, '광대 봇이 시민 봇을 고름').toBe(true);
    await A.waitState(t, (g) => g.phase === 'NIGHT' && g.nightTurnRole === 'DOCTOR', { message: '의사 차례' });
    const turnEnd = await H.deadlineOf(t);

    const dropAt = await H.goOffline(t, b, gate);
    // 의사 차례가 진짜 마감에 닫힘 → 그때 ㄴ은 산 채 (차례 마감이 아니라 60초)
    await K.sleepUntil(turnEnd + TOL);
    const mid = await t.state();
    expect(mid.phase === 'NIGHT' && mid.nightTurnRole === 'DOCTOR', '의사 차례는 닫힘').toBe(false);
    expect(K.rowOf(mid, U(b)).alive).toBe(true);

    const backAt = await H.goOnline(t, b, gate, { at: dropAt + REOPEN_AT_MS });
    expect(backAt - dropAt).toBeLessThan(GRACE_MS);
    // 낮으로 (손잡이) → 보호가 없었으니 광대가 고른 시민 봇이 죽음
    const day = await night.toDay(t, { dayIndex: 2 });
    expect(K.rowOf(day, U(x)).alive, '그 밤 보호 없음').toBe(false);
    expect(K.rowOf(day, U(b)).alive).toBe(true);
    await H.expectStatus(a.page, nick(x), 'dead', 20_000);
});

test('A09-H-008 7명 판(사람 2 + 봇 5, 밤 30초) 광대 차례에 의사 ㄴ 오프라인 → 의사 차례가 끝나도 ㄱ 화면 ㄴ 산 채, 끊긴 지 60초에 사망 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const t = await H.seat(table, [a, b], { n: 7, humanRoles: ['CITIZEN', 'DOCTOR'], times: { ...H.ROOMY, nightActionTime: 30 } });
    const [joker] = await H.botsBy(t, 'JOKER');
    const [x] = await H.botsBy(t, 'CITIZEN');
    await night.toTurn(t, 'JOKER', { dayIndex: 1 });
    const dropAt = await H.goOffline(t, b, gate);
    // 광대 봇이 바로 냄 → 다 냈으니 5초 뒤 의사 차례 (손잡이 안 씀)
    expect((await night.botNight(t, joker, U(x)))?.ok).toBe(true);
    await A.waitState(t, (g) => g.phase === 'NIGHT' && g.nightTurnRole === 'DOCTOR', { timeout: 20_000, message: '의사 차례' });
    const turnEnd = await H.deadlineOf(t);
    expect(turnEnd - dropAt, '의사 차례가 60초 전에 끝나야 이 규칙을 봄').toBeLessThan(GRACE_MS - 5000);

    await K.sleepUntil(turnEnd + TOL);
    const mid = await t.state();
    expect(mid.phase === 'NIGHT' && mid.nightTurnRole === 'DOCTOR', '의사 차례는 닫힘').toBe(false);
    expect(K.rowOf(mid, U(b)).alive, '자기 차례 끝에 안 죽음').toBe(true);
    await H.expectStatus(a.page, nick(b), 'disconnected', 1000);
    const deadAt = await H.statusAt(a.page, nick(b), 'dead', { timeout: GRACE_MS });
    A.expectNear(deadAt - dropAt, GRACE_MS, '끊긴 지 60초에 ㄱ 화면 ㄴ 사망');
});

test('A09-H-009 5명 판(사람 2 + 봇 3) 역할 확인 중 ㄴ 오프라인 → 첫 낮을 넘어 59초 안에 온라인 → 산 채로 낮 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const t = await H.seat(table, [a, b], { n: 5, reveal: false });
    expect((await t.state()).phase, '끊기는 순간 단계').toBe('ROLE_REVEAL');
    const dropAt = await H.goOffline(t, b, gate);
    // 역할 확인 10초가 손잡이 없이 끝나 첫 낮
    await A.waitState(t, (g) => g.phase === 'DAY', { timeout: 20_000, message: '첫 낮' });

    const backAt = await H.goOnline(t, b, gate, { at: dropAt + REOPEN_AT_MS });
    expect(backAt - dropAt).toBeLessThan(GRACE_MS);
    const row = await t.player(U(b));
    expect(row.alive).toBe(true);
    expect(row.isParticipating).toBe(true);
    await expect(b.page).toHaveURL(/\/ingame/);
    const theirs = await H.readClock(b.page);
    expect(theirs.label).toMatch(/^\[낮-/);
    expect(theirs.label).toBe((await H.readClock(a.page)).label);
    await K.sleepUntil(dropAt + GRACE_MS + TOL);
    expect((await t.player(U(b))).alive).toBe(true);
});

test('A09-H-010 6명 판(사람 2 + 봇 4, 투표 30초) ㄴ이 투표 남은 1초에 새로고침 → 판 그대로 산 채 (옛 "바로 탈락" 아님) @game @hard @realtime @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 6, times: { ...H.ROOMY, dayVoteTime: 30 } });
    await H.toVote(t, [b.page]);
    const deadline = await H.deadlineOf(t);
    expect(deadline - Date.now(), '1초 전까지 기다릴 틈').toBeGreaterThan(3000);
    await K.sleepUntil(deadline - 1000);
    await H.reloadIngame(b.page, 6);
    // 투표는 마감(진짜 30초)에 판정되어 낮 투표를 벗어남
    const s = await A.waitState(t, (g) => !(g.phase === 'DAY' && g.dayPhase === 'DAY_VOTE'), { message: '투표 마감 판정' });
    expect(K.rowOf(s, U(b)).alive).toBe(true);
    expect(K.rowOf(s, U(b)).isParticipating).toBe(true);
    await H.expectStatus(a.page, nick(b), 'alive');
    await expect(b.page).toHaveURL(/\/ingame/);
});

test('A09-H-011 7명 판(사람 2 + 봇 5, 투표 30초) ㄴ 오프라인·안 냄 → 30초 마감에 판정 → ㄱ 투표 현황에 ㄴ 표 없음(기권 1) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const t = await H.seat(table, [a, b], { n: 7, times: { ...H.ROOMY, dayVoteTime: 30 } });
    await H.toVote(t, [a.page]);
    const deadline = await H.deadlineOf(t);
    const [x, y] = await H.botsBy(t, 'CITIZEN');
    await H.goOffline(t, b, gate);
    // ㄱ·봇 넷 → X, X → Y, ㄴ만 안 냄 → X 5 · Y 1 · 기권 1(ㄴ)
    await A.dayVoteUi(a.page, nick(x));
    expect((await x.request('cast_day_vote', { gameId: t.gameId, targetId: U(y) }))?.ok).toBe(true);
    await A.botsDayVote(t, U(x), t.bots.filter((bot) => bot !== x));
    const panel = await openStatus(a.page);
    const watcher = y;
    const resolved = await H.eventAt(watcher, 'day_vote_resolved', { match: (p) => p.dayIndex === 1, timeoutMs: 45_000 });
    A.expectNear(resolved.at, deadline, '끊긴 ㄴ이 안 냈으니 원래 30초 마감에 판정');
    expect(resolved.payload.publicAbstainCount, 'ㄴ 표는 기권').toBe(1);
    await expect(panel.getByTestId('vote-status-public-abstain-count')).toHaveText('1', { timeout: 15_000 });
});

test('A09-H-012 6명 판(사람 3 + 봇 3) 마지막 광대 ㄷ이 오프라인 61초 → ㄱ·ㄴ 결과 화면 시민 진영 승리 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const [a, b, c] = await H.openPeople(user, players, 3);
    const gate = await H.socketGate(c);
    const t = await H.seat(table, [a, b, c], { n: 6, humanRoles: ['CITIZEN', 'CITIZEN', 'JOKER'] });
    await K.toDay(t);
    const dropAt = await H.goOffline(t, c, gate);
    const gone = await K.eliminatedAt(t, U(c), dropAt, { timeoutMs: 75_000 });
    A.expectNear(gone - dropAt, GRACE_MS, '끊긴 지 60초에 탈락');
    for (const p of [a, b]) {
        const badge = await A.expectResult(p.page, H.TEXT.citizenWin);
        await expectReadable(badge);
    }
});

test('A09-H-013 10명 판(사람 3 + 봇 7) ㄴ은 0초·ㄷ은 20초에 오프라인 → ㄴ은 끊긴 지 60초에 탈락, ㄷ은 끊긴 지 59초 안에 돌아와 산 채 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const [a, b, c] = await H.openPeople(user, players, 3);
    const gateB = await H.socketGate(b);
    const gateC = await H.socketGate(c);
    const t = await H.seat(table, [a, b, c], { n: 10 });
    await K.toDay(t);
    await A.calm(a.page);
    const dropB = await H.goOffline(t, b, gateB);
    await K.sleepUntil(dropB + 20_000);
    const dropC = await H.goOffline(t, c, gateC);

    const goneB = await K.eliminatedAt(t, U(b), dropB, { timeoutMs: 75_000 });
    A.expectNear(goneB - dropB, GRACE_MS, 'ㄴ은 끊긴 지 60초에 탈락');
    expect((await t.player(U(c))).alive, 'ㄷ은 아직 산 채').toBe(true);
    const backC = await H.goOnline(t, c, gateC, { at: dropC + REOPEN_AT_MS });
    expect(backC - dropC, 'ㄷ은 자기 60초 안에 돌아옴').toBeLessThan(GRACE_MS);
    await K.sleepUntil(dropC + GRACE_MS + TOL);
    const s = await t.state();
    expect(K.rowOf(s, U(b)).alive).toBe(false);
    expect(K.rowOf(s, U(b)).isParticipating).toBe(false);
    expect(K.rowOf(s, U(c)).alive).toBe(true);
    await H.expectStatus(a.page, nick(b), 'dead');
    await H.expectStatus(a.page, nick(c), 'alive');
});

test('A09-H-014 8명 판(사람 2 + 봇 6) ㄴ 오프라인 → 30초 안에 마지막 광대 처형으로 판 끝 → ㄴ 돌아와 방 만들기 됨(탈주 아님) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const t = await H.seat(table, [a, b], { n: 8 });
    await H.toVote(t, [a.page]);
    const dropAt = await H.goOffline(t, b, gate);
    const [joker] = await H.botsBy(t, 'JOKER');
    const end = await H.execute(t, U(joker), { voters: [a] });
    expect(end.phase).toBe('ENDED');
    expect(Date.now() - dropAt, '끊긴 지 30초 안에 판 끝').toBeLessThan(30_000);

    // 끊긴 지 60초가 지나도 탈락·탈주 처리 없음
    await K.sleepUntil(dropAt + GRACE_MS + TOL);
    gate.open();
    expect(await H.desertionRows(U(b))).toEqual([]);
    const tab = await b.context.newPage();
    H.collectDialogs(tab);
    await K.createRoomOk(tab);
});

test('A09-H-015 7명 판(사람 2 + 봇 5) 의사 ㄴ이 보호 고른 뒤 오프라인 → 60초 전에 낮 → ㄱ 화면 "지난밤 의사가 공격받은 사람을 살려냈습니다" @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const t = await H.seat(table, [a, b], { n: 7, humanRoles: ['CITIZEN', 'DOCTOR'] });
    const [joker] = await H.botsBy(t, 'JOKER');
    const [x] = await H.botsBy(t, 'CITIZEN');
    await night.toTurn(t, 'JOKER', { dayIndex: 1 });
    expect((await night.botNight(t, joker, U(x)))?.ok).toBe(true);
    await A.waitState(t, (g) => g.phase === 'NIGHT' && g.nightTurnRole === 'DOCTOR', { timeout: 20_000, message: '의사 차례' });
    await night.nightActUi(b.page, nick(x), '보호');
    const dropAt = await H.goOffline(t, b, gate);

    const day = await night.toDay(t, { dayIndex: 2 });
    expect(Date.now() - dropAt, '60초 전에 낮').toBeLessThan(GRACE_MS);
    expect(K.rowOf(day, U(x)).alive, '보호로 살아남음').toBe(true);
    expect(K.rowOf(day, U(b)).alive).toBe(true);
    const report = a.page.locator('[data-ingame-dawn-report="SAVED"]');
    await expect(report).toContainText(H.TEXT.saved, { timeout: 20_000 });
    await expectReadable(report.getByText(H.TEXT.saved));
});

test('A09-H-038 6명 판(사람 2 + 봇 4) ㄴ 오프라인 → 59초 안에 온라인 → 바로 투표 → ㄱ 투표 현황에 ㄴ 표가 셈에 듦(기권 0) @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const t = await H.seat(table, [a, b], { n: 6 });
    await H.toVote(t, [a.page, b.page]);
    const [x, y] = await H.botsBy(t, 'CITIZEN');
    const dropAt = await H.goOffline(t, b, gate);
    // ㄴ 빼고 다 냄: ㄱ·봇 셋 → X, X → Y
    await A.dayVoteUi(a.page, nick(x));
    expect((await x.request('cast_day_vote', { gameId: t.gameId, targetId: U(y) }))?.ok).toBe(true);
    await A.botsDayVote(t, U(x), t.bots.filter((bot) => bot !== x));
    const panel = await openStatus(a.page);

    const backAt = await H.goOnline(t, b, gate, { at: dropAt + REOPEN_AT_MS });
    expect(backAt - dropAt).toBeLessThan(GRACE_MS);
    const since = Date.now();
    await A.dayVoteUi(b.page, nick(x));
    // ㄴ 표로 다 참 → 5초 뒤 판정, 기권 0
    const resolved = await H.eventAt(y, 'day_vote_resolved', { since, match: (p) => p.dayIndex === 1, timeoutMs: 20_000 });
    expect(resolved.payload.publicAbstainCount).toBe(0);
    await expect(panel.getByTestId('vote-status-public-abstain-count')).toHaveText('0', { timeout: 15_000 });
    await expect(panel.getByTestId('vote-status-outcome')).toHaveText('재판 회부', { timeout: 15_000 });
});

test('A09-H-059 10명 판(사람 2 + 봇 8, 밤 30초) 둘째 밤 마녀사냥꾼 ㄴ 오프라인 → 차례는 마감에 건너뜀(ㄴ 산 채) → 끊긴 지 60초에 탈락 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const { a, b, gate } = await pairWithGate(user, players);
    const t = await H.seat(table, [a, b], { n: 10, humanRoles: ['CITIZEN', 'WITCH_HUNTER'], times: { ...H.ROOMY, nightActionTime: 30 } });
    await night.toTurn(t, 'WITCH_HUNTER', { dayIndex: 2 });
    const turnEnd = await H.deadlineOf(t);
    const dropAt = await H.goOffline(t, b, gate);

    await K.sleepUntil(turnEnd + TOL);
    const mid = await t.state();
    expect(mid.phase === 'NIGHT' && mid.nightTurnRole === 'WITCH_HUNTER', '마녀사냥꾼 차례는 마감에 닫힘').toBe(false);
    expect(K.rowOf(mid, U(b)).alive, '차례가 건너뛰어져도 산 채').toBe(true);
    const deadAt = await H.statusAt(a.page, nick(b), 'dead', { timeout: GRACE_MS });
    A.expectNear(deadAt - dropAt, GRACE_MS, '끊긴 지 60초에 탈락');
});

test('A09-H-060 7명 판(사람 4 + 봇 3, 투표 30초) 봇 하나가 끊기고 나머지 6이 다 냄 → "5초 뒤 마감" 안 뜸, 투표 30초 끝에 판정 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const humans = await H.openPeople(user, players, 4);
    // 봇 차례: 시민 → 의사 → 광대
    const t = await H.seat(table, humans, { n: 7, times: { ...H.ROOMY, dayVoteTime: 30 } });
    await H.toVote(t, humans.map((h) => h.page));
    const deadline = await H.deadlineOf(t);
    const [off, doctor, joker] = t.bots;
    const since = Date.now();
    K.dropBot(off);
    await K.droppedAt(t, U(off), since);

    // 사람 넷 → 광대 봇, 의사 봇 → 광대 봇, 광대 봇 → 의사 봇 (끊긴 봇만 안 냄)
    await Promise.all(humans.map((h) => A.dayVoteUi(h.page, nick(joker))));
    expect((await doctor.request('cast_day_vote', { gameId: t.gameId, targetId: U(joker) }))?.ok).toBe(true);
    expect((await joker.request('cast_day_vote', { gameId: t.gameId, targetId: U(doctor) }))?.ok).toBe(true);
    expect(deadline - Date.now(), '남은 시간이 5초보다 넉넉할 때 다 내야 이 규칙을 봄').toBeGreaterThan(5500);

    await K.sleepUntil(deadline - TOL);
    for (const h of humans) await A.expectNoSettle(h.page);
    const resolved = await H.eventAt(doctor, 'day_vote_resolved', { since, match: (p) => p.dayIndex === 1, timeoutMs: 10_000 });
    A.expectNear(resolved.at, deadline, '원래 30초 마감에 판정');
    const pulled = doctor.events.filter((r) => r.event === 'phase_settle_started' && r.at >= since && r.payload?.phase === 'DAY');
    expect(pulled, '마감 당김 알림이 오면 안 됨').toHaveLength(0);
});
