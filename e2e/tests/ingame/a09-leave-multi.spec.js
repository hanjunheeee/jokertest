'use strict';

// 판 중 스스로 나가기 어려운 브라우저 시험 (PC, 사람 2명) — 둘이 같이 나감·나간 사람 패와 골드·나가기 취소 뒤 투표·나가서 다 참 5초·광대 동료·다른 탭·실패 뒤 다시 시도
// 목록 A09-끊김-나가기-탈주.md A09-H-018·019·034·035·045·046·051 — 모이는지만: npx playwright test --list tests/ingame/a09-leave-multi.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { waitResult, resultRow } = require('../room/roomHelpers');
const A = require('./_a04-multi');
const K = require('./_a09-simple-kit');
const H = require('./_a09-hard-kit');

const { U, nick, TOL } = H;

// 판이 안 멈추고 계속: 승부 안 남 + 한 단계 넘겨도 결과로 안 감
async function expectGoesOn(t) {
    const s = await t.state();
    expect(s.phase, '승부 안 남').not.toBe('ENDED');
    await t.advance();
    const next = await A.waitState(t, (g) => g.phase !== s.phase || g.dayPhase !== s.dayPhase, { message: '다음 단계' });
    expect(next.phase, '다음 단계로 계속').not.toBe('ENDED');
}

test('A09-H-018 7명 판(사람 2 + 봇 5) ㄱ·ㄴ이 거의 같이 산 채로 나감 → 둘 다 방 만들기에 탈주 글, 봇들 판은 계속 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 7 });
    await K.toDay(t);
    await Promise.all([K.leaveAlive(a.page), K.leaveAlive(b.page)]);
    for (const p of [a, b]) {
        expect(await K.createRoomAlert(p.page)).toMatch(K.COOLDOWN_FIRST);
        const row = await t.player(U(p));
        expect(row.alive).toBe(false);
        expect(row.isParticipating).toBe(false);
    }
    await expectGoesOn(t);
});

test('A09-H-019 6명 판(사람 2 + 봇 4) ㄴ이 산 채로 나감 → 판 끝(시민 승) → ㄴ은 패로 기록·골드 없음, 끝까지 남은 ㄱ만 "+1골드" @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 6 });
    const goldA = await H.gold(U(a));
    const goldB = await H.gold(U(b));
    await K.toDay(t);
    await K.leaveAlive(b.page);
    // 광대 봇 처형 → 시민 승 (ㄴ 편이 이겨도 산 채로 나간 사람은 패)
    const [joker] = await H.botsBy(t, 'JOKER');
    const end = await H.execute(t, U(joker));
    expect(end.phase).toBe('ENDED');
    await K.pastExpulsion(a.page);
    await waitResult(a.page);
    const reward = resultRow(a.page, nick(a)).getByTestId('game-result-gold-reward');
    await expect(reward).toHaveText('+1골드');
    await expectReadable(reward);
    expect(await H.wonOf(t.gameId, U(a)), 'ㄱ 승').toBe(true);
    expect(await H.wonOf(t.gameId, U(b)), 'ㄴ 패').toBe(false);
    await expect.poll(() => H.gold(U(a)), { timeout: 30_000, message: 'ㄱ 지갑' }).toBe(goldA + 1);
    expect(await H.gold(U(b)), 'ㄴ 지갑 그대로').toBe(goldB);
});

test('A09-H-034 5명 판(사람 2 + 봇 3) ㄴ이 "게임 나가기" → 취소 → ㄱ·ㄴ·봇이 다 냄 → 둘 다 "5초 뒤 마감" @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 5 });
    await H.toVote(t, [a.page, b.page]);
    const message = await K.pressExit(b.page, { accept: false });
    for (const line of K.EXIT_ALIVE_LINES) expect(message, '산 사람 확인 창 글').toContain(line);
    await expect(b.page).toHaveURL(/\/ingame/);
    const row = await t.player(U(b));
    expect(row.alive).toBe(true);
    expect(row.isParticipating).toBe(true);

    // 다 냄: ㄱ·ㄴ·시민 봇 둘 → 광대 봇, 광대 봇 → 시민 봇 (손잡이 안 씀)
    const [joker] = await H.botsBy(t, 'JOKER');
    const [c0] = await H.botsBy(t, 'CITIZEN');
    await A.dayVoteUi(a.page, nick(joker));
    await A.dayVoteUi(b.page, nick(joker));
    await A.botsDayVote(t, U(joker), t.bots.filter((bot) => bot !== joker));
    expect((await joker.request('cast_day_vote', { gameId: t.gameId, targetId: U(c0) }))?.ok).toBe(true);
    for (const p of [a, b]) await A.expectSettleShown(p.page, { light: true });
});

test('A09-H-035 6명 판(사람 2 + 봇 4) ㄱ·봇은 다 내고 ㄴ만 안 냄 → ㄴ이 산 채로 나감 → ㄱ 화면 "5초 뒤 마감"(나가서 다 참) @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 6 });
    await H.toVote(t, [a.page]);
    const [x, y] = await H.botsBy(t, 'CITIZEN');
    await A.dayVoteUi(a.page, nick(x));
    expect((await x.request('cast_day_vote', { gameId: t.gameId, targetId: U(y) }))?.ok).toBe(true);
    await A.botsDayVote(t, U(x), t.bots.filter((bot) => bot !== x));
    expect(y.events.filter((r) => r.event === 'phase_settle_started'), 'ㄴ이 안 내서 아직 당김 없음').toHaveLength(0);

    const since = Date.now();
    await K.leaveAlive(b.page);
    const settle = await H.eventAt(y, 'phase_settle_started', { since, match: (p) => p.phase === 'DAY' && p.dayIndex === 1, timeoutMs: 15_000 });
    expect(Math.abs(settle.payload.deadline - settle.at - 5000), '나간 때부터 5초 뒤 마감').toBeLessThanOrEqual(TOL);
    await A.expectSettleShown(a.page);
});

test('A09-H-045 8명 판(사람 2 + 봇 6, 광대 2) 광대 ㄴ이 산 채로 나감 → 동료 광대 ㄱ 화면: 판 계속, ㄴ 카드 사망 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 8, humanRoles: ['JOKER', 'JOKER'], settings: { jokerCount: 2 } });
    await K.toDay(t);
    await A.calm(a.page);
    await K.leaveAlive(b.page);
    await H.expectStatus(a.page, nick(b), 'dead');
    await expect(a.page).toHaveURL(/\/ingame/);
    expect(K.rowOf(await t.state(), U(b)).alive).toBe(false);
    // 광대 1 : 나머지 6 → 승부 아님
    await expectGoesOn(t);
    await expect(a.page).toHaveURL(/\/ingame/);
});

test('A09-H-046 6명 판(사람 2 + 봇 4) 나간 ㄴ이 다른 탭에서 판 주소를 열면 방 목록, ㄱ은 판 계속 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 6 });
    await K.toDay(t);
    await K.leaveAlive(b.page);
    const tab = await b.context.newPage();
    H.collectDialogs(tab);
    await tab.goto('/ingame');
    await expect(tab).toHaveURL(/\/multiplay/, { timeout: 20_000 });
    await expect(tab.getByRole('region', { name: '공개 방 목록' })).toBeVisible();
    expect((await t.player(U(b))).isParticipating).toBe(false);
    await expect(a.page).toHaveURL(/\/ingame/);
    await expectGoesOn(t);
});

test('A09-H-051 5명 판(사람 2 + 봇 3) ㄴ이 오프라인에서 나가기 → 실패 안내 창 → 온라인 → "다시 시도" → 나감, 방 만들기에 탈주 글 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const gate = await H.socketGate(b);
    const t = await H.seat(table, [a, b], { n: 5 });
    await K.toDay(t);
    await H.goOffline(t, b, gate);
    await K.pressExit(b.page, { accept: true });
    const notice = K.leaveNotice(b.page);
    await expectReadable(notice.getByText('게임에서 나가지 못했습니다.', { exact: true }));
    await expectReadable(notice.getByText('연결이 끊겨 나가기를 보내지 못했습니다. 다시 시도해 주세요.', { exact: true }));
    expect((await t.player(U(b))).alive, '나가기가 안 갔으니 산 채').toBe(true);

    await H.goOnline(t, b, gate);
    await notice.getByRole('button', { name: '다시 시도' }).click();
    await expect(b.page).toHaveURL(/\/multiplay/, { timeout: 15_000 });
    expect((await t.player(U(b))).alive).toBe(false);
    expect(await K.createRoomAlert(b.page)).toMatch(K.COOLDOWN_FIRST);
});
