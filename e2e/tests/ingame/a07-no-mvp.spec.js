'use strict';

// MVP 없음 브라우저 시험 (PC) — 이긴 편·진 편·10명 판·여러 날 뒤 끝난 판 결과판에 "MVP" 글·칸이 없고, 서버 판 끝 값에도 없음
// 목록 시험목록/A07-승패-결과-골드.md A07-E-021~025, 모이는지만 봄: npx playwright test --list tests/ingame/a07-no-mvp.spec.js
const { test, expect } = require('../../helpers/fixtures');
const n = require('./b-night/_night');
const k = require('./_a07-simple-kit');

const { C, uid } = k;

// 결과 화면 어디에도 MVP 글·MVP 이름이 붙은 칸이 없는지
async function expectNoMvp(page) {
    await expect(k.board(page)).toBeVisible();
    await expect(page.getByText(/MVP/i)).toHaveCount(0);
    await expect(page.locator('[class*="mvp" i], [data-testid*="mvp" i], [aria-label*="mvp" i], [alt*="mvp" i]')).toHaveCount(0);
}

test('A07-E-021 5명 판 이긴 편 결과판에 "MVP" 글·칸 없음 @game @smoke', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
    await k.execute(t, uid(t.bots[0]));
    await k.reachBoard(page);
    await expect(k.banner(page)).toHaveText('승리');
    await expectNoMvp(page);
});

test('A07-E-022 6명 판 진 편 결과판에 "MVP" 없음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', 'JOKER', ...C(3)]);
    // 시민 봇 둘이 나가 2:2 → 광대 승 (나는 진 편)
    await k.leave(t, t.bots[2]);
    await k.leave(t, t.bots[3]);
    await k.reachBoard(page);
    await expect(k.banner(page)).toHaveText('패배');
    await expectNoMvp(page);
});

test('A07-E-023 10명 판 결과판 10줄, "MVP" 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(8)]);
    await k.execute(t, uid(t.bots[0]));
    await k.reachBoard(page);
    await expect(k.rows(page)).toHaveCount(10);
    await expectNoMvp(page);
});

test('A07-E-024 8명 판 재판 유죄 2번·밤 암살 1번 뒤 끝난 판도 "MVP" 없음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(6)]);
    const [joker, executed, killed] = t.bots;
    // 첫날 유죄(시민) → 첫 밤 암살 → 둘째 날 유죄(광대) → 시민 승
    await k.execute(t, uid(executed));
    const day2 = await k.nightKill(t, [joker], uid(killed));
    expect({ phase: day2.phase, day: day2.dayIndex, alive: n.aliveCount(day2) }).toEqual({ phase: 'DAY', day: 2, alive: 6 });
    const end = await k.execute(t, uid(joker));
    expect(end.winResult?.winner).toBe('CITIZEN');
    await k.reachBoard(page);
    await expect(k.rows(page)).toHaveCount(8);
    await expectNoMvp(page);
});

test('A07-E-025 5명 판 서버 판 끝 값(판 요약·판 끝 알림·끝난 판 스냅샷)에도 mvp 칸 없음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
    const [joker, watcher] = t.bots;
    const end = await k.execute(t, uid(joker));
    // 시험 손잡이의 판 요약 (/e2e/games/:id)
    expect(end.winResult?.winner).toBe('CITIZEN');
    expect(JSON.stringify(end.winResult)).not.toMatch(/mvp/i);
    // 판 사람이 받은 판 끝 알림 (재판으로 끝남 → 재판 결과 알림에 판 끝 칸이 실림)
    const ended = await watcher.waitForEvent('tribunal_vote_resolved', { match: (p) => Boolean(p?.winResult) });
    expect(ended.winResult.winner).toBe('CITIZEN');
    expect(JSON.stringify(ended)).not.toMatch(/mvp/i);
    // 끝난 판을 다시 물어 받은 값
    const snapshotWin = await n.publicWinResult(t, 1);
    expect(snapshotWin.reveals).toHaveLength(5);
    expect(JSON.stringify(snapshotWin)).not.toMatch(/mvp/i);
    // 화면도 같은 값으로 그려짐
    await k.reachBoard(page);
    await expect(page.getByText(/MVP/i)).toHaveCount(0);
});
