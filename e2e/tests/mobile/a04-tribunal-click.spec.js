'use strict';

// 모바일 재판 단추 빨리 두 번 누르기 시험: 표는 하나만 들어감
// 목록 A04-E-141 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;

test('A04-E-141 유죄를 빨리 두 번 눌러도 서버에 표 하나만 들어감 (모바일 6명) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const log = A.socketLog(page);
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 5 });
    // 봇 하나가 무죄 → 내 유죄가 한 표면 1:1로 풀려남, 두 표로 세면 2:1 처형
    await A.botsTribunal(t, [[t.bots[0], 'NOT_GUILTY']]);
    await trial.button(page, 'GUILTY').dblclick();
    await expect(trial.done(page)).toBeVisible();
    await A.expectVoteAccepted(log, 'GUILTY', 1);
    // 화면이 보낸 재판 표 요청은 한 번, 거절 글도 없음
    expect(A.repliesOf(log, 'cast_tribunal_vote')).toHaveLength(1);
    await expect(trial.error(page)).toHaveCount(0);
    const s = await A.endTribunal(t);
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(true);
});
