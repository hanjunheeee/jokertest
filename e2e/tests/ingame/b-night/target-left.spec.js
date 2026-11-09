// 밤 대상 다시 검사 시험: 광대(나)가 고른 사람이 밤이 끝나기 전에 판을 나가면 → 암살은 무효(밤 희생자 없음), 판은 계속
// 빈칸찾기 중 10 — 고르기는 화면으로, 나가기는 그 봇 소켓으로, 결과는 서버 요약·봇이 받은 밤 결과·내 화면으로 봄
const { test, expect, ui } = require('../../../helpers/fixtures');
const n = require('./_night');

test('광대인 내가 암살할 사람을 고른 뒤 그 사람이 판을 나가면 → 밤 결과 희생자 없음·암살 공개 없음, 나머지는 살아서 제 2일 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, humanRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    const [victim, watcher, ...others] = t.bots;
    await n.toTurn(t, 'JOKER');
    await n.nightActUi(user.page, victim.nickname, '암살');
    const left = await victim.request('leave_game_session', { gameId: t.gameId });
    expect(left?.ok, JSON.stringify(left)).toBe(true);

    const s = await n.toDay(t, { dayIndex: 2 });
    const applied = await watcher.waitForEvent('night_result_applied', { match: (p) => p.gameId === t.gameId });
    expect(applied.victimUuid).toBeNull();
    expect((applied.deathReveals ?? []).filter((r) => r.victimUuid === victim.account.uuid && r.source === 'JOKER')).toEqual([]);
    for (const bot of [watcher, ...others]) expect(n.rowOf(s, bot.account.uuid).alive).toBe(true);
    expect(n.rowOf(s, user.account.uuid).alive).toBe(true);
    await expect(user.page.getByText('제 2일')).toBeVisible({ timeout: 15000 });
});

test('광대가 고른 사람이 안 나가면 (대조) → 그 사람이 밤 희생자로 죽음 @game', async ({ user, table }) => {
    const t = await n.setup(table, { humans: [user], bots: 4, humanRoles: ['JOKER'] });
    await ui.readRoleReveal(user.page);
    t.playBots({ dayVote: 'abstain', night: 'skip' });
    const [victim, watcher] = t.bots;
    await n.toTurn(t, 'JOKER');
    await n.nightActUi(user.page, victim.nickname, '암살');
    const s = await n.toDay(t, { dayIndex: 2 });
    const applied = await watcher.waitForEvent('night_result_applied', { match: (p) => p.gameId === t.gameId });
    expect(applied.victimUuid).toBe(victim.account.uuid);
    expect(n.rowOf(s, victim.account.uuid).alive).toBe(false);
});
