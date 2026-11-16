'use strict';

// 모바일 재판 창 기본 시험: 재판 창이 읽히는지(인원 5~10), 피고·죽은 사람·낸 사람 안내 글, 누르면 서버가 받음, "재판 판정" 단추 없음
// 목록 A04-E-007~012·016~018·021~022·083 (시험목록/A04-재판.md "브라우저 — 간단" 모바일 몫)
const { test, expect } = require('../../helpers/fixtures');
const A = require('../ingame/_a04-multi');

const { trial } = A;

// 사람 1(시민) + 봇, 맨 끝 봇이 피고 → 재판 창에 피고 카드·단추 둘이 사람 눈에 읽히는지
for (const [no, n] of [['007', 5], ['008', 6], ['009', 7], ['010', 8], ['011', 9], ['012', 10]]) {
    test(`A04-E-${no} ${n}명 판 재판 창에 피고 카드·유죄·무죄가 읽힘 (모바일) @game${n === 5 ? ' @smoke' : ''}`, async ({ user, table }) => {
        const { d } = await A.startTrial(table, { humans: [user], bots: n - 1 });
        await A.expectCardReadable(user.page, d.nickname);
        await A.expectButtonsReadable(user.page);
    });
}

test('A04-E-016 내가 피고면 피고 안내 글이 읽히고 유죄·무죄 단추 없음 (모바일 5명) @game', async ({ user, table }) => {
    const page = user.page;
    await A.startTrial(table, { humans: [user], bots: 4, pick: () => user });
    await A.expectNoticeReadable(trial.defendantNotice(page));
    await expect(trial.button(page, 'GUILTY')).toHaveCount(0);
    await expect(trial.button(page, 'NOT_GUILTY')).toHaveCount(0);
});

test('A04-E-017 죽은 내 화면엔 사망 안내 글이 읽히고 유죄·무죄 단추 없음 (모바일 8명) @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const page = user.page;
    const t = await A.openTable(table, { humans: [user], bots: 7, roles: A.plainRoles() });
    // 1일 밤 광대 봇이 나를 죽임 → 2일 재판 (죽은 사람으로 재판을 봄)
    await t.advanceUntil((s) => s.phase === 'NIGHT' && s.nightTurnRole === 'JOKER', { stepDelayMs: 500 });
    const kill = await t.bots[0].request('submit_night_action', { gameId: t.gameId, targetId: user.account.uuid });
    expect(kill?.ok).toBe(true);
    await A.toVote(t, 2);
    await A.keepWatching(page);
    await A.toTribunal(t, t.bots[6]);
    await expect(trial.win(page)).toBeVisible({ timeout: 15000 });
    await A.expectNoticeReadable(trial.deadNotice(page));
    await expect(trial.button(page, 'GUILTY')).toHaveCount(0);
    await expect(trial.button(page, 'NOT_GUILTY')).toHaveCount(0);
});

test('A04-E-018 표를 낸 뒤엔 완료 글이 읽히고 유죄·무죄 단추 없음 (모바일 10명) @game', async ({ user, table }) => {
    const page = user.page;
    await A.startTrial(table, { humans: [user], bots: 9 });
    await A.pressVote(page, 'GUILTY');
    await A.expectNoticeReadable(trial.done(page));
    await expect(trial.button(page, 'GUILTY')).toHaveCount(0);
    await expect(trial.button(page, 'NOT_GUILTY')).toHaveCount(0);
});

// 내 표 하나로 판정이 갈리게 둠: 유죄면 봇은 안 냄(1:0 → 처형), 무죄면 봇 하나가 유죄(1:1 → 풀려남)
for (const [no, vote] of [['021', 'GUILTY'], ['022', 'NOT_GUILTY']]) {
    test(`A04-E-${no} "${A.VOTE_LABEL[vote]}"를 누르면 완료 글이 뜨고 서버가 그 표 하나를 받음 (모바일 7명) @game`, async ({ user, table }) => {
        const page = user.page;
        const log = A.socketLog(page);
        const { t, d } = await A.startTrial(table, { humans: [user], bots: 6 });
        if (vote === 'NOT_GUILTY') await A.botsTribunal(t, [[t.bots[0], 'GUILTY']]);
        await A.pressVote(page, vote);
        await A.expectVoteAccepted(log, vote, 1);
        expect(A.repliesOf(log, 'cast_tribunal_vote')).toHaveLength(1);
        const s = await A.endTribunal(t);
        expect(A.playerOf(s, A.uuidOf(d)).alive).toBe(vote !== 'GUILTY');
    });
}

test('A04-E-083 재판 중 화면에 "재판 판정" 단추 없음 (모바일 5명) @game', async ({ user, table }) => {
    const page = user.page;
    await A.startTrial(table, { humans: [user], bots: 4 });
    await expect(trial.button(page, 'GUILTY')).toBeVisible();
    await expect(page.getByRole('button', { name: '재판 판정' })).toHaveCount(0);
    await expect(page.getByText('재판 판정')).toHaveCount(0);
});
