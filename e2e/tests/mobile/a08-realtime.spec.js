'use strict';

// 모바일 결과 화면 180초 진짜 시간 브라우저 시험 — 손잡이 없이 기다려 로비로 가는 때·원래 방장이 안 올 때 방장이 넘어가는 때를 봄
// 목록 A08-판끝-같은방.md 번호 A08-H-032·040 (허용 폭 ±1.5초, 시험 하나가 3분을 넘어 그 시험 안에서만 제한을 늘림)
const { test, expect } = require('../../helpers/fixtures');
const {
    startButton, hostSeat, seatTable, seatPhoneHosted, jokerLeaves, voteOutJoker, allAtResult, pressReturn,
    closesAtOf, sleepUntil,
} = require('../result/_a08-hard-kit');

// 허용 폭 (ms)
const SLACK_MS = 1500;

// 모바일(상대 화면) 결과 화면엔 남은 초 칸이 없음(커밋 d71ab651) → 닫힘 전엔 결과 화면 그대로, 서버가 닫으면(game_result_closed) 로비로 가는지만 봄
test('A08-H-032 [모바일] 6명 판: 손잡이 없이 기다리면 판 끝 + 180초 전엔 결과 화면 그대로, 180초에 서버가 닫아 로비로 @game @hard @realtime @smoke', async ({ user, table }) => {
    test.setTimeout(360_000);
    const page = user.page;
    const { t, joker, host } = await seatTable(table, [user], 5);
    await voteOutJoker(t, joker);
    await allAtResult([user]);
    // 서버가 정한 닫힘 시각 = 판 끝 시각 + 180초
    const closesAt = await closesAtOf(host, t.gameId);

    // 닫힘 30초 전: 아직 결과 화면
    await sleepUntil(closesAt - 30_000);
    await expect(page).toHaveURL(/\/gameresult/);

    await page.waitForURL(/\/lobby/, { timeout: Math.max(0, closesAt - Date.now()) + 10_000 });
    expect(Math.abs(Date.now() - closesAt), '로비로 간 때 − 닫힘 시각').toBeLessThanOrEqual(SLACK_MS);
    // 서버가 보낸 닫힘 알림을 봇도 받음 (같은 판 결과 화면 사람에게 가는 알림)
    expect(host.events.some((r) => r.event === 'game_result_closed' && r.payload?.gameId === t.gameId), '봇이 받은 game_result_closed').toBe(true);
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
