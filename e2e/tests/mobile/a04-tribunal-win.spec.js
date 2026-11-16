'use strict';

// 모바일 재판으로 판이 끝나는 시험: 마지막 광대 처형 → 추방 연출 뒤 시민 승 결과 화면, 시민 처형으로 광대 승
// 목록 A04-E-056·058 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;

test('A04-E-056 마지막 광대 처형 → 추방 연출 뒤 결과 화면 시민 승 (모바일 6명) @game @smoke', async ({ user, table }) => {
    const page = user.page;
    // 하나뿐인 광대(첫 봇)가 피고, 내 유죄 1표로 처형
    const { t } = await A.startTrial(table, { humans: [user], bots: 5, pick: (tt) => tt.bots[0] });
    await A.pressVote(page, 'GUILTY');
    const s = await A.endTribunal(t);
    expect(s.phase).toBe('ENDED');
    // 추방 연출이 먼저 뜨고 그동안은 판 화면 주소 그대로
    await expect(trial.expulsion(page)).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/ingame/);
    await A.expectResult(page, A.TEXT.citizenWin);
});

test('A04-E-058 시민 처형으로 산 광대 2 ≥ 나머지 2 → 결과 화면 광대 승 (모바일 5명, 광대 2) @game', async ({ user, table }) => {
    const page = user.page;
    const { t } = await A.startTrial(table, {
        humans: [user],
        bots: 4,
        settings: { jokerCount: 2 },
        roles: A.plainRoles(({ bots }) => ({ [A.uuidOf(bots[1])]: 'JOKER' })),
        pick: (tt) => tt.bots[2],
    });
    // 봇 광대 둘이 유죄 → 시민 봇 처형 (나는 안 냄)
    await A.botsTribunal(t, [[t.bots[0], 'GUILTY'], [t.bots[1], 'GUILTY']]);
    const s = await A.endTribunal(t);
    expect(s.phase).toBe('ENDED');
    await A.expectResult(page, A.TEXT.jokerWin);
});
