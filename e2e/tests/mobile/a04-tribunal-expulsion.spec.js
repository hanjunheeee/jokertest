'use strict';

// 모바일 추방 연출 시험: 유죄면 추방 연출이 먼저, 연출이 끝난 뒤 밤 안내가 뜸
// 목록 A04-E-153 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;

test('A04-E-153 추방 연출이 끝난 뒤 밤 안내가 뜸 (모바일 6명) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const { t } = await A.startTrial(table, { humans: [user], bots: 5 });
    await A.pressVote(page, 'GUILTY');
    const s = await A.endTribunal(t);
    expect(s.phase).toBe('NIGHT');
    await expect(trial.expulsion(page)).toBeVisible({ timeout: 15000 });
    // 연출 동안엔 밤 안내가 뒤로 밀림
    await expect(trial.nightNotice(page)).toHaveCount(0);
    await expect(trial.expulsion(page)).toHaveCount(0, { timeout: 30000 });
    await A.readable(trial.nightNotice(page).getByText(A.TEXT.night), { timeout: 10000 });
});
