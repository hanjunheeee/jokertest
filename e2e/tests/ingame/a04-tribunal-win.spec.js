'use strict';

// 재판으로 승패가 갈리는 브라우저 시험 (PC): 마지막 광대 처형 → 시민 승 결과 화면, 시민 처형 → 광대 승, 광대 2 중 1 처형이면 밤 계속, 결과 화면 남은 시간, 내가 마지막 광대면 패
// 목록 docs/게임_의도_2026-11-15/시험목록/A04-재판.md A04-E-054·055·057·059·060·061·174
const { test, expect } = require('../../helpers/fixtures');
const { waitResult, resultRow } = require('../room/roomHelpers');
const K = require('./_a04-pc');

const { uuidOf } = K;

// 봇 표로 defendant를 재판에 세우고 유죄로 마감 (사람은 안 냄) → 마감 뒤 판 요약(판이 끝나 빠졌으면 null)
async function executeByBots(t, user, defendantUuid) {
    await K.toFirstDay(t);
    await K.watchScreen(user.page);
    await K.openTribunal(t, defendantUuid);
    await K.expectTribunal(user.page);
    await K.botsVerdict(t, 'GUILTY', t.bots.filter((b) => uuidOf(b) !== defendantUuid));
    return K.closeTribunal(t);
}

[[54, 5], [55, 7]].forEach(([no, n], i) => {
    const smoke = i === 0 ? ' @smoke' : '';
    test(`A04-E-0${no} PC ${n}명 판 하나뿐인 광대 처형 → 추방 연출 뒤 결과 화면 "시민 진영 승리" @game${smoke}`, async ({ user, table }) => {
        const t = await K.seat(table, user, { n });
        const joker = t.bots[0];
        await executeByBots(t, user, uuidOf(joker));
        await K.expectExpelled(user.page, joker.nickname);
        await waitResult(user.page);
        await K.readable(user.page.getByText('시민 진영 승리', { exact: true }));
        await expect(user.page.getByText('광대 진영 승리')).toHaveCount(0);
        // 나는 시민 → 내 띠는 승리
        await expect(user.page.getByText('승리', { exact: true })).toBeVisible();
    });
});

test('A04-E-057 PC 5명 판(광대 2) 시민 처형 → 산 광대 2 : 나머지 2 → 결과 화면 "광대 진영 승리" @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 5, bots: ['JOKER', 'JOKER'] });
    const citizen = t.bots[2];
    await executeByBots(t, user, uuidOf(citizen));
    await K.expectExpelled(user.page, citizen.nickname);
    await waitResult(user.page);
    await K.readable(user.page.getByText('광대 진영 승리', { exact: true }));
    await expect(user.page.getByText('시민 진영 승리')).toHaveCount(0);
    await expect(user.page.getByText('패배', { exact: true })).toBeVisible();
});

[[59, 8], [60, 10]].forEach(([no, n]) => {
    test(`A04-E-0${no} PC ${n}명 판 광대 2명 중 1명 처형 → 결과 화면 아님, 밤 계속 @game`, async ({ user, table }) => {
        const t = await K.seat(table, user, { n, bots: ['JOKER', 'JOKER'] });
        const joker = t.bots[0];
        const after = await executeByBots(t, user, uuidOf(joker));
        expect(after.phase).toBe('NIGHT');
        expect(after.winResult).toBeNull();
        await K.expectExpelled(user.page, joker.nickname);
        await K.passExpulsion(user.page);
        await K.expectNightNotice(user.page);
        await expect(user.page).toHaveURL(/\/ingame/);
        expect((await t.state()).phase).not.toBe('ENDED');
    });
});

test('A04-E-061 PC 5명 판 재판으로 판 끝 → 결과 화면 오른쪽 위 남은 시간이 읽힘 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 5 });
    await executeByBots(t, user, uuidOf(t.bots[0]));
    await waitResult(user.page);
    const timer = user.page.getByTestId('result-close-timer');
    await K.readable(timer);
    // 판 끝부터 180초 → 막 들어온 결과 화면은 180초 이하·0초보다 큼
    const left = Number(await timer.getAttribute('data-seconds-left'));
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(180);
    await expect(timer).toContainText('남은 시간');
});

test('A04-E-174 PC 5명 판 내가 하나뿐인 광대로 처형 → 결과 화면 내 띠 "패배", 내 줄 광대 @game', async ({ user, table }) => {
    const t = await K.seat(table, user, { n: 5, me: 'JOKER', bots: [] });
    await executeByBots(t, user, uuidOf(user));
    await K.expectExpelled(user.page, user.account.nickname);
    await waitResult(user.page);
    // 띠 글은 누름이 통과하는 칸이라 가려짐 검사는 뺌
    await K.readable(user.page.getByText('패배', { exact: true }), { large: true, uncovered: false });
    await expect(user.page.getByText('시민 진영 승리', { exact: true })).toBeVisible();
    const mine = resultRow(user.page, user.account.nickname);
    await expect(mine).toContainText('내 정보');
    await expect(mine).toContainText('광대');
});
