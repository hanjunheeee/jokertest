'use strict';

// 모바일 "다 누르면 5초 뒤 판정" 시험: 단계 줄 "5초 뒤 마감"·5초 뒤 닫힘, 남은 시간이 짧으면 원래 마감, 당긴 뒤 새로고침 — 손잡이 없이 진짜 시간으로 기다림
// 목록 A04-E-029~030·037·101 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫, @realtime)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;

// 재판 120초 방: 봇이 먼저 다 내고 사람이 마지막 표 → 그 순간부터 5초(±1.5초) 뒤 재판 창이 닫힘
for (const [no, n] of [['029', 5], ['030', 8]]) {
    test(`A04-E-${no} ${n}명 판 다 누르면 단계 줄에 "5초 뒤 마감", 5초 뒤 재판 창 닫힘 (모바일) @game @realtime${n === 5 ? ' @smoke' : ''}`, async ({ user, table }) => {
        const page = user.page;
        const { t, d } = await A.startTrial(table, { humans: [user], bots: n - 1, settings: { tribunalTime: 120 } });
        await A.botsTribunal(t, 'GUILTY', await A.votersOf(t, d));
        // 내가 아직 안 냈으니 당김 없음
        await A.expectNoSettle(page);
        const pressedAt = Date.now();
        await trial.button(page, 'GUILTY').click();
        await A.expectSettleShown(page);
        const closed = await A.closedAt(page, { timeout: 10000 });
        A.expectNear(closed - pressedAt, 5000, '다 누른 뒤 재판 창이 닫히기까지');
    });
}

test('A04-E-037 남은 4초에 다 차면 당김 없이 원래 마감에 판정 (모바일 5명, 재판 15초) @game @realtime', async ({ user, table }) => {
    const page = user.page;
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 4, settings: { tribunalTime: 15 } });
    const deadline = await A.tribunalDeadline(t);
    await A.botsTribunal(t, 'NOT_GUILTY', await A.votersOf(t, d));
    // 준비가 늦어 이미 4초 밑이면 이 규칙을 못 봄 → 바로 알림
    expect(deadline - Date.now(), '남은 4초 시각 전에 준비가 끝나야 함').toBeGreaterThan(4300);
    await A.sleepUntil(deadline - 4000);
    await trial.button(page, 'NOT_GUILTY').click();
    await expect(trial.done(page)).toBeVisible();
    await A.expectNoSettle(page);
    const closed = await A.closedAt(page, { timeout: 8000 });
    A.expectNear(closed, deadline, '원래 마감에 재판 창이 닫힘');
    // 서버도 마감을 안 당김: 봇이 받은 알림에 마감 당김이 없음
    expect(t.bots[0].events.filter((e) => e.event === 'phase_settle_started')).toHaveLength(0);
});

test('A04-E-101 다 찬 뒤 1초에 새로고침해도 줄어든 남은 시간이 보이고 그 시각에 판정 (모바일 6명) @game @realtime', async ({ user, table }) => {
    const page = user.page;
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 5, settings: { tribunalTime: 120 } });
    await A.botsTribunal(t, 'NOT_GUILTY', await A.votersOf(t, d));
    await A.pressVote(page, 'NOT_GUILTY');
    // 서버가 판 전원에게 알린 당긴 마감 시각 (봇도 같은 알림을 받음)
    const pulled = await t.bots[0].waitForEvent('phase_settle_started', { match: (p) => p.phase === 'TRIBUNAL', timeoutMs: 5000 });
    await A.sleepUntil(pulled.deadline - 4000);
    await page.reload();
    await expect(trial.win(page)).toBeVisible({ timeout: 4000 });
    // 120초 재판인데 새로고침 뒤 남은 시간이 5초 이하
    await expect.poll(async () => (await A.clockSeconds(page)) ?? 999, { timeout: 3000, message: '새로고침 뒤 단계 줄 남은 시간' }).toBeLessThanOrEqual(5);
    const closed = await A.closedAt(page, { timeout: 8000 });
    A.expectNear(closed, pulled.deadline, '당겨진 마감에 재판 창이 닫힘');
});
