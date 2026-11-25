'use strict';

// "낮 집계" 단추 없음 브라우저 시험 (PC) — 토론·투표·5초 중 × 산 사람·죽은 사람 화면 어디에도 "낮 집계"(누가 눌러 바로 판정하던 단추)가 없음
// 목록 A03-낮투표.md 번호 A03-E-116~127 중 PC 몫(116~126 짝수) — 6·7·8명 판 고루, 5초 중은 손잡이 없이 그 5초 안에 봄
const { test, expect, ui } = require('../../helpers/fixtures');
const { customRoleSettings } = require('../../helpers/game');
const L = require('./a-day/_lib');

const U = (x) => x.account.uuid;

// 직업 전부 정함: 사람 시민, 첫 봇 광대, 나머지 시민 (직접 구성 광대 1 — 밤 차례가 광대뿐이라 날 넘기기가 단순)
function rolesFor() {
    return ({ humans, bots }) => {
        const out = { [U(humans[0])]: 'CITIZEN' };
        bots.forEach((b, i) => { out[U(b)] = i === 0 ? 'JOKER' : 'CITIZEN'; });
        return out;
    };
}

// n명 판 (사람 1 + 봇 n-1) 차리고 직업이 정한 대로 됐는지 한 번 확인 (서버 예약이 가끔 못 맞음)
async function openTable(table, user, n) {
    const roles = rolesFor();
    const t = await table.setup({ humans: [user], bots: n - 1, settings: customRoleSettings({ JOKER: 1 }), roles });
    const want = roles({ humans: t.humans, bots: t.bots });
    const s = await t.state();
    expect(s.players).toHaveLength(n);
    for (const p of s.players) expect(p.role, `${p.nickname} 직업`).toBe(want[p.uuid]);
    return t;
}

// 봇이 받은 알림 한 줄 기다림 → { event, payload, at(받은 시각) }
async function eventRow(bot, event, { since = 0, match = () => true, timeout = 20000 } = {}) {
    let row = null;
    await expect.poll(() => {
        row = bot.events.find((r) => r.event === event && r.at >= since && match(r.payload)) ?? null;
        return row !== null;
    }, { timeout, message: `${event} 알림 기다림` }).toBe(true);
    return row;
}

// 1일 낮 표·재판으로 사람 처형 → 관전 계속 → 2일 낮 토론까지 (앞 단계라 손잡이로 넘김)
async function humanDiesThenDay2(t, page) {
    const me = U(t.humans[0]);
    await L.toVote(t);
    await L.botsVote(t, t.bots.map((b) => [b, me]));
    const tri = await L.resolveVote(t);
    expect(tri.tribunal?.defendantUuid).toBe(me);
    await L.botsTribunal(t, t.bots.map((b) => [b, 'GUILTY']));
    await L.resolveTribunal(t);
    await L.waitState(t, (g) => g.players.find((p) => p.uuid === me)?.alive === false);
    await L.keepWatching(page);
    await t.advanceUntil((s) => s.phase === 'DAY' && s.dayIndex === 2 && s.dayPhase === 'DAY_DISCUSSION');
    // 죽은 사람 단계 안내는 저절로 닫힘
    // 그 앞 "지난밤 아무 일도 일어나지 않았습니다" 창(이름 같음, 죽은 사람도 봄)은 확인을 눌러야 닫혀서 넘김
    await expect(page.locator('[aria-label="제 2일 시간 흐름"]')).toBeVisible({ timeout: 20000 });
    await expect(async () => {
        await ui.closeQuietDawn(page);
        await expect(page.getByRole('dialog', { name: '단계 전환 안내', exact: true })).toHaveCount(0, { timeout: 2000 });
    }).toPass({ timeout: 20000 });
}

// 죽은 사람 화면이 투표 단계로 바뀔 때까지: 죽으면 준비·기권 단추가 없어, 산 봇 카드의 꺼진 "투표하기" 까닭 글로 봄 (토론이면 토론 안내 글) → 메뉴 닫음
async function waitDeadVoteScreen(t, page) {
    const menu = page.getByRole('menu', { name: '플레이어 행동' });
    await expect(async () => {
        if (!(await menu.isVisible())) await L.card(page, t.bots[1].account.nickname).click({ timeout: 1500 });
        await expect(menu.getByRole('menuitem', { name: '투표하기' })).toHaveAttribute('title', '사망한 플레이어는 행동할 수 없습니다', { timeout: 1000 });
    }).toPass({ timeout: 15000 });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
}

// 화면 어디에도 "낮 집계" 글·집계 단추가 없음 (잠긴 판 화면 안까지 DOM으로 봄, 현황 창 안 "낮 투표 집계" 표 이름은 단추 아님)
async function expectNoResolveButton(page) {
    await expect(page.getByText('낮 집계')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /집계/ })).toHaveCount(0);
    await expect(page.locator('button, [role="button"], [role="menuitem"]').filter({ hasText: '집계' })).toHaveCount(0);
    await expect(page.locator('button[aria-label*="집계"], [role="button"][aria-label*="집계"], [role="menuitem"][aria-label*="집계"]')).toHaveCount(0);
}

// 다 낸 뒤 당김 알림까지 → 그 5초 안에 보는지 확인용으로 아직 투표 단계인지 돌려줌
async function settleStarted(t, since, dayIndex) {
    await eventRow(t.bots[0], 'phase_settle_started', { since, match: (p) => p.phase === 'DAY' && p.dayIndex === dayIndex, timeout: 5000 });
}

test('A03-E-116 PC 6명 판 토론 · 산 사람 → "낮 집계" 단추 없음 @game @smoke', async ({ user, table }) => {
    const t = await openTable(table, user, 6);
    const page = user.page;
    await L.toDay(t);
    await expect(page.getByRole('button', { name: '투표 시작 준비' })).toBeVisible();
    await expectNoResolveButton(page);
});

test('A03-E-118 PC 7명 판 토론 · 죽은 사람 → "낮 집계" 단추 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 7);
    const page = user.page;
    await L.toDay(t);
    await humanDiesThenDay2(t, page);
    expect((await t.state()).dayPhase).toBe('DAY_DISCUSSION');
    await expectNoResolveButton(page);
});

test('A03-E-120 PC 8명 판 투표 · 산 사람 → "낮 집계" 단추 없음 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 8);
    const page = user.page;
    await L.toDay(t);
    await L.toVote(t);
    await expectNoResolveButton(page);
    // 봇이 다 내도(사람만 남음) 집계 단추가 새로 생기지 않음
    await L.botsVote(t, t.bots.map((b) => [b, null]));
    await expectNoResolveButton(page);
});

test('A03-E-122 PC 6명 판 투표 · 죽은 사람 → "낮 집계" 단추 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 6);
    const page = user.page;
    await L.toDay(t);
    await humanDiesThenDay2(t, page);
    await t.advance();
    await L.waitState(t, (g) => g.dayIndex === 2 && g.dayPhase === 'DAY_VOTE');
    // 화면도 투표 단계로 바뀐 뒤 봄 (죽은 사람에겐 준비·기권 단추가 없음)
    await waitDeadVoteScreen(t, page);
    await expect(page.getByRole('button', { name: /투표 시작 준비|준비 완료|기권/ })).toHaveCount(0);
    await expectNoResolveButton(page);
});

test('A03-E-124 PC 7명 판 5초 중 · 산 사람 → "낮 집계" 단추 없음 @game', async ({ user, table }) => {
    const t = await openTable(table, user, 7);
    const page = user.page;
    await L.toDay(t);
    await L.toVote(t);
    const since = Date.now();
    await L.botsVote(t, t.bots.map((b) => [b, null]));
    // 사람이 마지막 표 → 다 참 → 5초 중 (손잡이 안 씀)
    const abstain = page.getByRole('button', { name: '기권' });
    await abstain.click();
    await expect(abstain).toBeDisabled();
    await settleStarted(t, since, 1);
    await expectNoResolveButton(page);
    expect((await t.state()).dayPhase, '5초 안에 봄').toBe('DAY_VOTE');
});

test('A03-E-126 PC 8명 판 5초 중 · 죽은 사람 → "낮 집계" 단추 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const t = await openTable(table, user, 8);
    const page = user.page;
    await L.toDay(t);
    await humanDiesThenDay2(t, page);
    await t.advance();
    await L.waitState(t, (g) => g.dayIndex === 2 && g.dayPhase === 'DAY_VOTE');
    // 산 봇 전원이 냄 → 다 참 → 5초 중 (손잡이 안 씀)
    const since = Date.now();
    await L.botsVote(t, t.bots.map((b) => [b, null]));
    await settleStarted(t, since, 2);
    await expectNoResolveButton(page);
    expect((await t.state()).dayPhase, '5초 안에 봄').toBe('DAY_VOTE');
    await ui.closeOverlays(page).catch(() => {});
});
