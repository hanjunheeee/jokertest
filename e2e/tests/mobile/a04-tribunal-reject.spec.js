'use strict';

// 모바일 재판 표 거절 시험(받은 버그 8): 서버가 판정을 끝낸 직후(화면엔 창이 아직 떠 있음) 유죄를 누르면 재판 창에 거절 까닭 글이 읽힘
// 목록 A04-E-081 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;

test('A04-E-081 판정 직후(창이 닫히기 전) 유죄를 누르면 재판 창에 거절 까닭 글이 읽힘 (모바일 7명) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    // 거절 만드는 길: 서버 → 화면 사건을 잠깐 붙잡아 "판정 알림이 아직 안 온 화면"을 만듦 (누른 요청의 답은 그대로 받음)
    const gate = await A.socketGate(page);
    const { t } = await A.startTrial(table, { humans: [user], bots: 6 });
    await expect(trial.button(page, 'GUILTY')).toBeEnabled();
    gate.holding = true;
    const s = await A.endTribunal(t);
    expect(s.phase).toBe('NIGHT');
    await trial.button(page, 'GUILTY').click();
    const error = trial.error(page);
    await A.expectNoticeReadable(error);
    await expect(error).toHaveAttribute('role', 'alert');
    expect(A.LATE_VOTE_TEXTS).toContain((await error.innerText()).trim());
    // 까닭 글은 재판 창이 떠 있는 동안 보임, 붙잡은 알림을 풀면 창이 닫힘
    await expect(trial.win(page)).toBeVisible();
    gate.release();
    await expect(trial.win(page)).toBeHidden({ timeout: 10000 });
});
