'use strict';

// 모바일 역할 확인 10초 브라우저 시험 — 손잡이 없이 진짜 시간으로 9초엔 아직 낮 아님·10초(±1.5초)에 낮·확인 눌러도 안 당겨짐·안 눌러도 창 닫힘
// 목록 A02-판시작-역할.md 번호 A02-E-167~170 (사파리도: E-167), 시작 시각 = 방장 봇이 시작 알림(game_started)을 받은 때
const { test, expect } = require('../../helpers/fixtures');
const { sleep } = require('../../helpers/wait');
const { talk } = require('./_talk');

// 역할 확인 10초 (결정 "확인 10초"), 허용 폭 ±1.5초
const REVEAL_MS = 10_000;
const SLACK_MS = 1_500;
const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

// 사람 1(시민) + 봇 n-1 판 → 방장 봇이 시작 알림 받은 시각
async function openGame(table, user, n) {
    const me = user.account.uuid;
    const t = await table.setup({ humans: [user], bots: n - 1, roles: { [me]: 'CITIZEN' } });
    await t.bots[0].waitForEvent('game_started');
    const startedAt = t.bots[0].events.find((r) => r.event === 'game_started').at;
    const s = await t.state();
    expect(s.players.find((p) => p.uuid === me)?.role, '미리 정한 내 직업').toBe('CITIZEN');
    return { t, startedAt };
}

// 진짜 시간 규칙 확인이라 그 시각까지 그냥 기다림 (이미 지났으면 시험이 늦은 것 → 실패로 알림)
async function waitUntilMs(startedAt, ms) {
    const left = startedAt + ms - Date.now();
    if (left < 0) throw new Error(`시작 ${ms}ms 시각을 이미 지남 (${-left}ms 늦음) — 판 차리기가 느렸음`);
    await sleep(left);
}

// 단계 줄에 '낮'이 있나 + "낮이 되었습니다" 글이 떴나
async function isDay(page) {
    const line = await talk.phaseLine(page).innerText().catch(() => '');
    const notice = await page.getByText('낮이 되었습니다').first().isVisible().catch(() => false);
    return line.includes('낮') || notice;
}

// 낮이 될 때까지 0.1초마다 봄 → 시작부터 걸린 ms
async function msUntilDay(page, startedAt) {
    await expect.poll(() => isDay(page), { timeout: REVEAL_MS + 10_000, intervals: [100] }).toBe(true);
    return Date.now() - startedAt;
}

test('A02-E-167 모바일 5명 시작 뒤 9초 → 아직 낮 아님 @game @realtime @safari @smoke', async ({ user, table }) => {
    const { startedAt } = await openGame(table, user, 5);
    await expect(talk.layout(user.page)).toBeVisible({ timeout: 20_000 });
    await waitUntilMs(startedAt, 9_000);
    expect(await isDay(user.page), '9초엔 낮 아님').toBe(false);
});

test('A02-E-168 모바일 6명 → 10초(±1.5초)에 낮 @game @realtime', async ({ user, table }) => {
    const { startedAt } = await openGame(table, user, 6);
    const ms = await msUntilDay(user.page, startedAt);
    expect(ms).toBeGreaterThanOrEqual(REVEAL_MS - SLACK_MS);
    expect(ms).toBeLessThanOrEqual(REVEAL_MS + SLACK_MS);
});

test('A02-E-169 모바일 8명 확인 눌러도 → 9초엔 낮 아님 (안 당겨짐) @game @realtime', async ({ user, table }) => {
    const { startedAt } = await openGame(table, user, 8);
    const dialog = revealDialog(user.page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', { name: '확인' }).click();
    await expect(dialog).toHaveCount(0);
    // 확인이 9초 전에 눌렸어야 뜻이 있음
    expect(Date.now() - startedAt, '확인 누른 때').toBeLessThan(9_000);
    await waitUntilMs(startedAt, 9_000);
    expect(await isDay(user.page), '확인 눌러도 9초엔 낮 아님').toBe(false);
});

test('A02-E-170 모바일 10명 아무것도 안 누름 → 10초(±1.5초)에 역할 창 저절로 닫힘 @game @realtime', async ({ user, table }) => {
    const { startedAt } = await openGame(table, user, 10);
    const dialog = revealDialog(user.page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => dialog.count(), { timeout: REVEAL_MS + 10_000, intervals: [100] }).toBe(0);
    const ms = Date.now() - startedAt;
    expect(ms).toBeGreaterThanOrEqual(REVEAL_MS - SLACK_MS);
    expect(ms).toBeLessThanOrEqual(REVEAL_MS + SLACK_MS);
});
