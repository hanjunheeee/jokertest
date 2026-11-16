'use strict';

// 사람이 줄어도 판이 계속되는 어려운 브라우저 시험 (PC, 사람 2~5명) — 셋이 차례로 탈락해도 계속·사람만 5명 판에서 줄어 승패대로 끝·두 판 중 한 판 탈락은 다른 판에 안 번짐
// 목록 A09-끊김-나가기-탈주.md A09-H-030·044·056, 60초는 손잡이 — 모이는지만: npx playwright test --list tests/ingame/a09-shrink-multi.spec.js
const { test, expect, e2e } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { hostGame, closeReveals } = require('../room/roomHelpers');
const A = require('./_a04-multi');
const K = require('./_a09-simple-kit');
const H = require('./_a09-hard-kit');

const { U } = H;

test('A09-H-030 10명 판(사람 4 + 봇 6) ㄴ·ㄷ·ㄹ이 차례로 탭을 닫고 손잡이로 하나씩 탈락 → 7명 판 계속 → 광대 처형으로 시민 승에서 끝 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const [a, ...others] = await H.openPeople(user, players, 4);
    const t = await H.seat(table, [a, ...others], { n: 10 });
    await K.toDay(t);
    for (const p of others) {
        const since = Date.now();
        await p.page.close();
        await K.droppedAt(t, U(p), since);
        await K.expire(t, U(p));
        const s = await t.state();
        expect(s.phase, '한 사람 빠질 때마다 승부 안 남').not.toBe('ENDED');
        expect(K.rowOf(s, U(p)).isParticipating).toBe(false);
    }
    const s = await t.state();
    expect(s.players.filter((p) => p.alive && p.isParticipating !== false), '남은 산 사람').toHaveLength(7);
    // 판 계속 → 광대 봇 처형으로 끝 (봇 다섯 표 > 기권 둘: ㄱ·광대)
    const [joker] = await H.botsBy(t, 'JOKER');
    const end = await H.execute(t, U(joker));
    expect(end.phase).toBe('ENDED');
    await K.pastExpulsion(a.page);
    await expectReadable(await A.expectResult(a.page, H.TEXT.citizenWin));
});

test('A09-H-044 사람만 5명 판 — 2명 산 채로 나감·1명 탭 닫고 손잡이 탈락 → 남은 광대 ㄱ·시민 ㅁ 1:1 → 광대 진영 승리로 끝 @game @hard @smoke', async ({ user, players }) => {
    test.setTimeout(300_000);
    const people = await H.openPeople(user, players, 5);
    const [a, b, c, d, e] = people;
    const roles = Object.fromEntries(people.map((p) => [U(p), p === a ? 'JOKER' : 'CITIZEN']));
    // 사람이 방장인 판 (봇 없음), 직업은 정해 둠
    const t = await hostGame({ host: a, guests: [b, c, d, e], roles });
    const s0 = await t.state();
    expect(Object.fromEntries(s0.players.map((p) => [p.uuid, p.role]))).toEqual(roles);
    await closeReveals(people.map((p) => p.page));
    await K.toDay(t);

    await K.leaveAlive(b.page);
    expect((await t.state()).phase, '광대 1 : 시민 3').not.toBe('ENDED');
    await K.leaveAlive(c.page);
    expect((await t.state()).phase, '광대 1 : 시민 2').not.toBe('ENDED');
    // 봇이 없어 끊김 알림을 대신 볼 수 없음 → 손잡이가 그 사람을 끝낼 때까지 다시 부름 (서버가 끊김을 알아야 끝냄)
    await d.page.close();
    await expect.poll(async () => (await t.expireGraces()).fired.includes(U(d)), { timeout: 20_000, message: '탭 닫은 ㄹ 탈락' }).toBe(true);
    const end = await A.waitState(t, (g) => g.phase === 'ENDED', { message: '광대 1 : 시민 1로 판 끝' });
    expect(K.rowOf(end, U(a)).alive).toBe(true);
    expect(K.rowOf(end, U(e)).alive).toBe(true);
    for (const p of [a, e]) await expectReadable(await A.expectResult(p.page, H.TEXT.jokerWin));
});

test('A09-H-056 5명 판 둘(방 2개, 사람 2 + 봇 8) 판 1의 ㄱ이 탭을 닫고 손잡이 탈락 → 판 2의 ㄴ은 판 그대로 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const first = await H.seat(table, [a], { n: 5 });
    const second = await H.seat(table, [b], { n: 5 });
    await K.toDay(first);
    await K.toDay(second);
    await A.calm(b.page);

    const since = Date.now();
    await a.page.close();
    await K.droppedAt(first, U(a), since);
    await K.expire(first, U(a));
    expect(K.rowOf(await first.state(), U(a)).isParticipating).toBe(false);

    // 판 2: 손잡이가 끝낼 사람 없음, ㄴ 산 채·참여 중, 화면도 그 판 그대로
    expect((await second.expireGraces()).fired).toEqual([]);
    const s2 = await second.state();
    expect(s2.phase).toBe('DAY');
    expect(K.rowOf(s2, U(b)).alive).toBe(true);
    expect(K.rowOf(s2, U(b)).isParticipating).toBe(true);
    await expect(b.page).toHaveURL(/\/ingame/);
    await expect(b.page.locator('[data-ingame-player-nickname]')).toHaveCount(5);
    await expect(b.page.locator(`[data-ingame-player-nickname="${a.account.nickname}"]`)).toHaveCount(0);
    expect((await e2e.gameOf(U(b)))?.gameId).toBe(second.gameId);
});
