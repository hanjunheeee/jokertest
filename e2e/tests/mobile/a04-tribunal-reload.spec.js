'use strict';

// 모바일 재판 중 새로고침 시험: 안 낸 내가 새로고침하면 단추가 다시 보이고 눌러짐, 낸 내가 새로고침하면 완료 글
// 목록 A04-E-113·115 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;

test('A04-E-113 안 낸 내가 새로고침하면 재판 창·단추가 다시 보이고 누르면 서버가 받음 (모바일 8명) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const log = A.socketLog(page);
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 7 });
    await page.reload();
    await expect(trial.win(page)).toBeVisible({ timeout: 20000 });
    await A.expectCardReadable(page, d.nickname);
    await A.expectButtonsReadable(page);
    await A.pressVote(page, 'GUILTY');
    await A.expectVoteAccepted(log, 'GUILTY', 1);
    // 내 유죄 1표뿐 → 처형 (새로고침 뒤 낸 표가 그대로 셈)
    const s = await A.endTribunal(t);
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(false);
});

test('A04-E-115 표를 낸 내가 새로고침하면 "투표가 완료되었습니다."가 읽히고 단추 없음 (모바일 5명) @game', async ({ user, table }) => {
    const page = user.page;
    await A.startTrial(table, { humans: [user], bots: 4 });
    await A.pressVote(page, 'NOT_GUILTY');
    await page.reload();
    await expect(trial.win(page)).toBeVisible({ timeout: 20000 });
    await A.expectNoticeReadable(trial.done(page));
    await expect(trial.button(page, 'GUILTY')).toHaveCount(0);
    await expect(trial.button(page, 'NOT_GUILTY')).toHaveCount(0);
});
