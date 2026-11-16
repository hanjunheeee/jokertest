'use strict';

// 모바일 사람 셋이 재판 낀 판을 처음부터 끝까지 가는 어려운 시험: 1일 재판 무죄 → 2일 재판에서 마지막 광대 처형 → 세 화면 결과
// 목록 A04-H-021 (시험목록/A04-재판.md "브라우저 — 어려움")
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;

// 사람마다 단추가 읽히는지 본 뒤 같은 표를 누름
async function allPress(people, vote) {
    for (const p of people) {
        await expect(trial.done(p.page)).toHaveCount(0);
        await A.expectButtonsReadable(p.page);
    }
    for (const p of people) await A.pressVote(p.page, vote);
}

test('A04-H-021 모바일 처음부터 끝까지: 1일 재판 무죄 → 2일 재판에서 마지막 광대 처형 → 세 화면 결과 시민 승 (사람 3 + 봇 3 = 6명) @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(420_000);
    const people = [user, await players.add({ mobile: true }), await players.add({ mobile: true })];
    // 봇 표(2)가 기권(4)보다 적어 세 사람도 화면(초상 띠 → 투표하기)으로 낮 투표
    const { t, d } = await A.startTrial(table, { humans: people, bots: 3 });
    await allPress(people, 'NOT_GUILTY');
    let s = await A.endTribunal(t);
    expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(true);
    // 2일: 하나뿐인 광대(첫 봇)가 피고 — 버그 8: 1일에 누른 세 사람 모두 2일에도 단추
    await A.toVote(t, 2);
    await A.toTribunal(t, t.bots[0]);
    for (const p of people) await expect(trial.win(p.page)).toBeVisible({ timeout: 15000 });
    await allPress(people, 'GUILTY');
    s = await A.endTribunal(t);
    expect(s.phase).toBe('ENDED');
    await Promise.all(people.map((p) => A.expectResult(p.page, A.TEXT.citizenWin)));
});
