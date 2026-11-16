'use strict';

// 모바일 결과 화면 180초 진짜 시간 브라우저 시험 — 손잡이 없이 기다려 로비로 가는 때·원래 방장이 안 올 때 방장이 넘어가는 때를 봄
// 목록 A08-판끝-같은방.md 번호 A08-H-032·040 (허용 폭 ±1.5초, 시험 하나가 3분을 넘어 그 시험 안에서만 제한을 늘림)
const { test, expect } = require('../../helpers/fixtures');
const {
    startButton, hostSeat, seatTable, seatPhoneHosted, jokerLeaves, voteOutJoker, allAtResult, pressReturn,
    closesAtOf, secondsLeft, sleepUntil,
} = require('../result/_a08-hard-kit');

// 허용 폭 (ms)
const SLACK_MS = 1500;

test('A08-H-032 [모바일] 6명 판: 손잡이 없이 기다리면 남은 초가 줄다가 판 끝 + 180초에 로비로 @game @hard @realtime @smoke', async ({ user, table }) => {
    test.setTimeout(360_000);
    const page = user.page;
    const { t, joker, host } = await seatTable(table, [user], 5);
    await voteOutJoker(t, joker);
    await allAtResult([user]);
    // 서버가 정한 닫힘 시각 = 판 끝 시각 + 180초
    const closesAt = await closesAtOf(host, t.gameId);

    // 화면 남은 초 = 닫힘 시각까지 남은 시간 (±1.5초)
    const readLeft = async () => {
        const left = await secondsLeft(page);
        const real = (closesAt - Date.now()) / 1000;
        expect(Math.abs(left - real), `화면 ${left}초 · 실제 ${real.toFixed(1)}초`).toBeLessThanOrEqual(SLACK_MS / 1000);
        return left;
    };
    const first = await readLeft();
    expect(first).toBeLessThanOrEqual(180);
    await sleepUntil(closesAt - 30_000);
    expect(await readLeft(), '30초 남았을 때').toBeLessThan(first);

    await page.waitForURL(/\/lobby/, { timeout: Math.max(0, closesAt - Date.now()) + 10_000 });
    expect(Math.abs(Date.now() - closesAt), '로비로 간 때 − 닫힘 시각').toBeLessThanOrEqual(SLACK_MS);
});

test('A08-H-040 [모바일] 5명 판: ㄴ이 먼저 대기방으로, 원래 방장 ㄱ은 결과 화면 그대로 → 180초 전엔 "게임시작" 없음, 지나면 ㄴ에게 생김 @game @hard @realtime', async ({ user, players, bots }) => {
    test.setTimeout(420_000);
    const a = user;
    const b = await players.add();
    const { t, joker, botList } = await seatPhoneHosted(bots, a, [b], 3);
    await jokerLeaves(t, joker);
    await allAtResult([a, b]);
    const closesAt = await closesAtOf(botList.find((bot) => bot !== joker), t.gameId);

    await pressReturn(b.page);
    await expect(hostSeat(b.page)).toBeVisible();

    // 판 끝 + 178초: 아직 방장 자리를 비워 둠
    await sleepUntil(closesAt - 2000);
    await expect(startButton(b.page)).toHaveCount(0);
    await expect(a.page).toHaveURL(/\/gameresult/);
    expect(Date.now(), '178초 확인이 닫힘 전에 끝남').toBeLessThan(closesAt);

    // 판 끝 + 182초: ㄴ이 방장, ㄱ은 로비
    await sleepUntil(closesAt + 2000);
    await expect(startButton(b.page)).toBeVisible({ timeout: 1000 });
    await expect(hostSeat(b.page)).toHaveCount(0);
    await expect(a.page).toHaveURL(/\/lobby/, { timeout: 1000 });
});
