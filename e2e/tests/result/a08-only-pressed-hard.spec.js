'use strict';

// 결과 화면에 오래 머무는 사람이 다음 판을 안 막는 브라우저 시험 (PC, 어려움) — 누른 사람끼리 새 사람을 채워 시작, 머문 사람은 닫히면 로비
// 목록 A08-판끝-같은방.md 번호 A08-H-016 (판은 광대 봇 밤 암살로 탈주 없이 끝냄, 180초는 손잡이 closeResults로)
const { test, expect } = require('../../helpers/fixtures');
const { e2e } = require('../../helpers/internal');
const {
    U, openHumans, rolesFor, expectRoles, killByNight, allAtResult, pressReturn, botReturn, expectParty, startByBot,
} = require('./_a08-hard-kit');

test('A08-H-016 5명 판(사람 3 + 봇 2): ㄷ은 결과 화면 그대로, ㄱ·ㄴ·봇 + 새 사람 1이 둘째 판 시작 → 결과 화면 닫힘 → ㄷ 로비, 둘째 판은 그대로 @game @hard @smoke', async ({ players, table, bots }) => {
    test.setTimeout(420_000);
    const [a, b, c] = await openHumans(players, 3);
    // 광대 2(ㄷ + 방장 봇) → 방장 봇이 밤에 다른 봇을 암살 → 광대 2 : 나머지 2 → 광대 승 (아무도 안 나가 봇 2가 다 돌아옴)
    const t = await table.setup({
        humans: [a, b, c],
        bots: 2,
        settings: { jokerCount: 2 },
        roles: ({ bots: list }) => rolesFor([a, b, c], [c, list[0]]),
    });
    const [host, victim] = t.bots;
    await expectRoles(t.gameId, rolesFor([a, b, c], [c, host]));
    await killByNight(t, [host], [U(victim)]);
    await allAtResult([a, b, c]);

    await pressReturn(a.page);
    await pressReturn(b.page);
    for (const bot of t.bots) await botReturn(bot, t.gameId);
    // 새 사람(판 밖 봇)이 같은 코드로 → 5명
    const [fresh] = await bots.spawn(1);
    await fresh.joinByCode(t.roomCode);
    await expectParty(a.page, 5);

    const t2 = await startByBot(host, [a, b], [...t.bots, fresh], rolesFor([a, b], [host, fresh]));
    expect(t2.gameId, '새 판').not.toBe(t.gameId);
    const s2 = await e2e.game(t2.gameId);
    expect(s2.players, '둘째 판 5명').toHaveLength(5);
    expect(s2.players.map((p) => p.uuid), '둘째 판에 ㄷ 없음').not.toContain(U(c));
    await expect(c.page).toHaveURL(/\/gameresult/);

    const closed = await t.closeResults();
    expect(closed.fired, '판1 180초 시계 돌림').toBe(true);
    await expect(c.page).toHaveURL(/\/lobby/, { timeout: 15_000 });
    for (const p of [a, b]) await expect(p.page).toHaveURL(/\/ingame/);
    expect((await e2e.game(t2.gameId))?.phase, '둘째 판 진행 중').not.toBe('ENDED');
});
