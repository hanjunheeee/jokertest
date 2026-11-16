'use strict';

// 모바일 둘째 날 재판 어려운 시험(받은 버그 8): 모바일 사람 둘이 1일 재판에서 누른 뒤 2일 재판에서도 둘 다 단추를 보고 누름 (사파리 포함)
// 목록 A04-H-004·032 (시험목록/A04-재판.md "브라우저 — 어려움")
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;

// 사람 둘 다 모바일: 봇 표가 기권보다 많지 않은 판이라 두 사람도 화면(초상 띠 → 투표하기)으로 낮 투표
const CASES = [
    ['004', 4, '모바일 두 사람', ' @smoke'],
    ['032', 3, '사파리 모바일 두 사람', ' @safari'],
];
for (const [no, botCount, who, tag] of CASES) {
    test(`A04-H-${no} [버그 8] ${who}이 1일 재판에서 누른 뒤 2일 재판에서도 둘 다 단추 (사람 2 + 봇 ${botCount} = ${botCount + 2}명) @game @hard${tag}`, async ({ user, players, table }) => {
        test.setTimeout(360_000);
        const phone = await players.add({ mobile: true });
        const people = [user, phone];
        const logs = people.map((p) => A.socketLog(p.page));
        const { t, d } = await A.startTrial(table, { humans: people, bots: botCount });
        // 1일: 둘 다 무죄 → 풀려남
        for (const p of people) await A.pressVote(p.page, 'NOT_GUILTY');
        const s1 = await A.endTribunal(t);
        expect(A.playerOf(s1, A.uuidOf(d)).alive).toBe(true);
        // 2일: 새로고침 없이 두 화면 다 단추 (완료 글이 미리 떠 있지 않음)
        await A.toVote(t, 2);
        await A.toTribunal(t, d);
        for (const p of people) {
            await expect(trial.win(p.page)).toBeVisible({ timeout: 15000 });
            await expect(trial.done(p.page)).toHaveCount(0);
            await A.expectButtonsReadable(p.page);
        }
        // 봇 하나가 무죄 → 두 사람 유죄가 다 세어져야 2:1 처형 (하나라도 기권으로 빠지면 1:1 풀려남)
        await A.botsTribunal(t, [[t.bots[0], 'NOT_GUILTY']]);
        for (const [i, p] of people.entries()) {
            await A.pressVote(p.page, 'GUILTY');
            await A.expectVoteAccepted(logs[i], 'GUILTY', 2);
            expect(await A.navigationType(p.page)).toBe('navigate');
        }
        const s2 = await A.endTribunal(t);
        expect(A.playerOf(s2, A.uuidOf(d)).alive).toBe(false);
    });
}
