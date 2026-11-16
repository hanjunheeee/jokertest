'use strict';

// 모바일 둘째 날 재판 시험(받은 버그 8): 1일 재판에서 누른 사람이 2일·3일 재판에서도 단추를 보고 누름(새로고침 없이), 1일 피고·처형된 사람의 2일 재판
// 목록 A04-E-072·073·075·078·079·119·121·167·168 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;
const lastBot = (t, back = 1) => t.bots[t.bots.length - back];

// 그 날 재판을 열어 단추가 읽히는지(완료 글이 미리 떠 있지 않은지) → 눌러 완료 글·서버 답까지
async function trialDay(t, page, log, day, defendant, vote) {
    await A.toVote(t, day);
    await A.toTribunal(t, defendant);
    await expect(trial.win(page)).toBeVisible({ timeout: 15000 });
    await expect(trial.done(page)).toHaveCount(0);
    await A.expectButtonsReadable(page);
    await A.pressVote(page, vote);
    await A.expectVoteAccepted(log, vote, day);
}

// 1일 재판에서 누르고(봇은 기권 → 내 표대로 판정) 2일 재판으로
for (const [no, n, first] of [['072', 6, 'NOT_GUILTY'], ['073', 8, 'GUILTY']]) {
    test(`A04-E-${no} [버그 8] 1일 재판에서 ${A.VOTE_LABEL[first]}를 누른 뒤 2일 재판 단추가 읽히고 눌러짐, 새로고침 없음 (모바일 ${n}명) @game${no === '072' ? ' @smoke' : ''}`, async ({ user, table }) => {
        test.setTimeout(240_000);
        const page = user.page;
        const log = A.socketLog(page);
        const { t, d } = await A.startTrial(table, { humans: [user], bots: n - 1 });
        await A.pressVote(page, first);
        const s1 = await A.endTribunal(t);
        expect(A.playerOf(s1, A.uuidOf(d)).alive).toBe(first !== 'GUILTY');
        // 1일 피고가 처형됐으면 2일엔 다른 봇을 세움
        const d2 = first === 'GUILTY' ? lastBot(t, 2) : d;
        await trialDay(t, page, log, 2, d2, 'GUILTY');
        expect(await A.navigationType(page)).toBe('navigate');
        // 2일 표가 기권으로 안 셈: 내 유죄 1표뿐 → 처형
        const s2 = await A.endTribunal(t);
        expect(A.playerOf(s2, A.uuidOf(d2)).alive).toBe(false);
    });
}

test('A04-E-075 [버그 8] 사흘 연달아 재판: 1·2일 다 눌러도 3일 재판 단추가 읽히고 눌러짐 (모바일 7명) @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const page = user.page;
    const log = A.socketLog(page);
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 6 });
    // 1·2일은 무죄를 눌러 아무도 안 죽게 (같은 봇이 사흘 내내 피고)
    await A.pressVote(page, 'NOT_GUILTY');
    await A.endTribunal(t);
    await trialDay(t, page, log, 2, d, 'NOT_GUILTY');
    await A.endTribunal(t);
    await trialDay(t, page, log, 3, d, 'GUILTY');
    expect(await A.navigationType(page)).toBe('navigate');
});

test('A04-E-078 [버그 8] 2일 낮에 새로고침해도 2일 재판 단추가 읽히고 눌러짐 (모바일 6명) @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const log = A.socketLog(page);
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 5 });
    await A.pressVote(page, 'NOT_GUILTY');
    await A.endTribunal(t);
    await A.toVote(t, 2);
    await page.reload();
    await expect(page).toHaveURL(/\/ingame/, { timeout: 20000 });
    await trialDay(t, page, log, 2, d, 'GUILTY');
});

test('A04-E-079 [버그 8] 사파리에서도 1일 재판에서 누른 뒤 2일 재판 단추가 읽히고 눌러짐 (모바일 5명) @game @safari', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const log = A.socketLog(page);
    const { t, d } = await A.startTrial(table, { humans: [user], bots: 4 });
    await A.pressVote(page, 'NOT_GUILTY');
    await A.endTribunal(t);
    await trialDay(t, page, log, 2, d, 'GUILTY');
    expect(await A.navigationType(page)).toBe('navigate');
});

test('A04-E-119 1일 피고였던 내가 2일 재판에선 단추를 보고 누름 (모바일 5명) @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const log = A.socketLog(page);
    const { t } = await A.startTrial(table, { humans: [user], bots: 4, pick: () => user });
    await A.expectNoticeReadable(trial.defendantNotice(page));
    // 아무도 안 냄 → 무죄, 나는 산 채 2일로
    const s1 = await A.endTribunal(t);
    expect(A.playerOf(s1, user.account.uuid).alive).toBe(true);
    await trialDay(t, page, log, 2, lastBot(t), 'GUILTY');
});

test('A04-E-121 1일에 처형된 나는 2일 재판에서 사망 안내 글을 봄 (모바일 7명) @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const { t } = await A.startTrial(table, { humans: [user], bots: 6, pick: () => user });
    await A.botsTribunal(t, [[t.bots[1], 'GUILTY']]);
    const s1 = await A.endTribunal(t);
    expect(A.playerOf(s1, user.account.uuid).alive).toBe(false);
    await A.keepWatching(page);
    await A.toVote(t, 2);
    await A.toTribunal(t, lastBot(t));
    await expect(trial.win(page)).toBeVisible({ timeout: 15000 });
    await A.expectNoticeReadable(trial.deadNotice(page));
    await expect(trial.button(page, 'GUILTY')).toHaveCount(0);
    await expect(trial.button(page, 'NOT_GUILTY')).toHaveCount(0);
});

// 큰 판: 1일엔 내 유죄 1 : 봇 무죄 2 → 풀려남, 같은 봇이 2일에도 피고
for (const [no, n] of [['167', 9], ['168', 10]]) {
    test(`A04-E-${no} [버그 8] ${n}명 판 2일 재판 단추가 읽히고 눌러짐 (모바일) @game`, async ({ user, table }) => {
        test.setTimeout(300_000);
        const page = user.page;
        const log = A.socketLog(page);
        const { t, d } = await A.startTrial(table, { humans: [user], bots: n - 1 });
        const [b0, b1] = await A.votersOf(t, d);
        await A.botsTribunal(t, [[b0, 'NOT_GUILTY'], [b1, 'NOT_GUILTY']]);
        await A.pressVote(page, 'GUILTY');
        const s1 = await A.endTribunal(t);
        expect(A.playerOf(s1, A.uuidOf(d)).alive).toBe(true);
        await trialDay(t, page, log, 2, d, 'GUILTY');
        expect(await A.navigationType(page)).toBe('navigate');
    });
}
