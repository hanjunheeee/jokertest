'use strict';

// 모바일 재판 시간 줄 시험: 방 설정 재판 시간(15·120초)대로 남은 시간이 시작, 재판 15초 마감에 창이 닫힘(진짜 시간)
// 목록 A04-E-097~098·163 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;

// 봇이 받은 재판 진입 알림(낮 판정 결과 TRIBUNAL)의 받은 시각 = 재판에 들어간 때
const tribunalEntry = (t) => t.bots[0].events.findLast((e) => e.event === 'day_vote_resolved' && e.payload?.outcome === 'TRIBUNAL');

for (const [no, sec, n, shown] of [['097', 15, 6, '0:15'], ['098', 120, 7, '2:00']]) {
    test(`A04-E-${no} 재판 ${sec}초 방은 단계 줄 남은 시간이 ${shown}에서 시작 (모바일 ${n}명) @game${no === '097' ? ' @smoke' : ''}`, async ({ user, table }) => {
        const page = user.page;
        const { t } = await A.startTrial(table, { humans: [user], bots: n - 1, settings: { tribunalTime: sec } });
        const deadline = await A.tribunalDeadline(t);
        // 서버 마감 = 재판 진입 + 방 설정 재판 시간
        A.expectNear(deadline - tribunalEntry(t).at, sec * 1000, `재판 길이 ${sec}초`);
        // 화면 남은 시간은 그 마감까지 남은 초 (들어온 뒤 지난 몇 초만큼 줄어 있음)
        const left = await A.clockSeconds(page);
        const readAt = Date.now();
        expect(left, '단계 줄에 남은 시간이 보임').not.toBeNull();
        expect(left).toBeLessThanOrEqual(sec);
        A.expectNear(left * 1000, deadline - readAt, '단계 줄 남은 시간');
        await expect(trial.phaseLine(page)).toContainText('재판');
    });
}

test('A04-E-163 재판 15초 방은 15초 마감 직전엔 창이 그대로, 16초엔 닫혀 있음 (모바일 7명) @game @realtime', async ({ user, table }) => {
    const page = user.page;
    const { t } = await A.startTrial(table, { humans: [user], bots: 6, settings: { tribunalTime: 15 } });
    const deadline = await A.tribunalDeadline(t);
    A.expectNear(deadline - tribunalEntry(t).at, 15000, '재판 길이 15초');
    // 손잡이 없이 기다림: 마감 1.5초 전엔 아직 재판 중
    await A.sleepUntil(deadline - A.TOLERANCE_MS);
    await expect(trial.win(page)).toBeVisible();
    // 마감 1초 뒤(재판 16초)엔 닫혀 있음
    await A.sleepUntil(deadline + 1000);
    await expect(trial.win(page)).toBeHidden({ timeout: 500 });
});
