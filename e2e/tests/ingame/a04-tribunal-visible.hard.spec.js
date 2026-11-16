'use strict';

// 재판 창 여러 화면 보임 어려운 시험: 같은 재판을 작은 PC·큰 PC·폰 세로·폰 가로 네 화면이 같이 보고 모두 단추·피고 카드가 읽힘
// 목록 A04-H-030 (시험목록/A04-재판.md "브라우저 — 어려움")
const { test, expect } = require('../../helpers/fixtures');
const A = require('./_a04-multi');

const { trial } = A;

test('A04-H-030 같은 재판을 PC 1280·PC 1920·폰 세로·폰 가로 네 화면이 봐도 모두 단추·피고 카드가 읽힘 (사람 4 + 봇 4 = 8명) @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(360_000);
    const pcBig = await players.add();
    const phone = await players.add({ mobile: true });
    const phoneWide = await players.add({ mobile: true });
    const people = [user, pcBig, phone, phoneWide];
    // 낮 투표까지는 기본 크기(봇 표 3 ≤ 기권 5라 네 사람도 화면으로 찍음), 재판이 열린 뒤 화면 크기를 바꿈
    const { d } = await A.startTrial(table, { humans: people, bots: 4 });
    await user.page.setViewportSize({ width: 1280, height: 720 });
    await pcBig.page.setViewportSize({ width: 1920, height: 1080 });
    await phone.page.setViewportSize({ width: 375, height: 812 });
    await phoneWide.page.setViewportSize({ width: 812, height: 375 });
    for (const p of people) {
        // 창이 자리 잡은 모양(카드가 줄고 채팅이 열림)에서 봄
        await expect(trial.win(p.page)).toHaveAttribute('data-ingame-tribunal-layout', 'split', { timeout: 10000 });
        await A.expectCardReadable(p.page, d.nickname);
        await A.expectButtonsReadable(p.page);
    }
});
