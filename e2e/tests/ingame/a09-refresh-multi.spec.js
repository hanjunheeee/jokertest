'use strict';

// 셋이 서로 다른 단계에서 새로고침하는 어려운 브라우저 시험 (PC, 사람 3명) — 토론·재판·밤에 새로고침해도 판 끝까지 아무도 안 빠짐
// 목록 A09-끊김-나가기-탈주.md A09-H-039 — 모이는지만: npx playwright test --list tests/ingame/a09-refresh-multi.spec.js
const { test, expect } = require('../../helpers/fixtures');
const A = require('./_a04-multi');
const K = require('./_a09-simple-kit');
const H = require('./_a09-hard-kit');

const { U } = H;
const { trial } = A;

test('A09-H-039 7명 판(사람 3 + 봇 4) ㄱ은 토론·ㄴ은 재판·ㄷ은 밤에 새로고침 → 판 끝(시민 승)까지 아무도 안 빠짐 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const people = await H.openPeople(user, players, 3);
    const [a, b, c] = people;
    const t = await H.seat(table, people, { n: 7 });

    // ㄱ: 첫 낮 토론에 새로고침
    await K.toDay(t);
    await H.reloadIngame(a.page, 7);
    // ㄴ: 재판(시민 봇 피고) 중 새로고침 → 재판 창 다시 보임
    const [x] = await H.botsBy(t, 'CITIZEN');
    const s = await H.pickDefendant(t, U(x), { voters: [a, c] });
    expect(s.phase).toBe('TRIBUNAL');
    await expect(trial.win(b.page)).toBeVisible({ timeout: 15_000 });
    await H.reloadIngame(b.page, 7);
    await expect(trial.win(b.page)).toBeVisible({ timeout: 30_000 });
    // 아무도 안 내 처형 없이 밤 → ㄷ: 밤에 새로고침
    await t.advance();
    await A.waitState(t, (g) => g.phase === 'NIGHT', { message: '밤' });
    await H.reloadIngame(c.page, 7);
    expect((await H.readClock(c.page)).label, 'ㄷ 화면 밤 그대로').toMatch(/^\[밤-/);

    // 둘째 낮 광대 봇 처형 → 시민 승 (봇 셋 표로는 모자라 셋 다 화면으로 찍음)
    const [joker] = await H.botsBy(t, 'JOKER');
    const end = await H.execute(t, U(joker), { voters: people });
    expect(end.phase).toBe('ENDED');
    for (const p of people) {
        const row = K.rowOf(end, U(p));
        expect(row.alive, '새로고침한 사람도 끝까지 산 채').toBe(true);
        expect(row.isParticipating, '새로고침한 사람도 판에서 안 빠짐').toBe(true);
    }
    for (const p of people) {
        await K.pastExpulsion(p.page);
        await A.expectResult(p.page, H.TEXT.citizenWin);
    }
});
