'use strict';

// 점검으로 끝난 판 브라우저 시험 (PC) — 판 중 점검 시각이 되면 승패 없이 끝나 판 골드도 업적도 없음 (결과 화면 없이 지움)
// 목록 시험목록/A07-승패-결과-골드.md A07-E-039·127 (서버 전체에 걸려 @serial), 모이는지만 봄: npx playwright test --list tests/ingame/a07-gold-maintenance.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { query } = require('../../helpers/db');
const maint = require('../maintenance/_maint');
const k = require('./_a07-simple-kit');

const { C, uid } = k;

test.afterEach(k.cleanSeeds);

/**
 * 판 중에 점검을 걸어 서버가 판을 승패 없이 끝낼 때까지 → 판 끝 처리(전적 저장·프로필 다시 읽기 신호)까지 끝남
 * 점검은 꼭 다시 끔 (안 끄면 다른 시험 방 만들기가 막힘)
 */
async function abortByMaintenance(internal, t, watcher) {
    try {
        await maint.setMaintenance(internal, { enabled: true, startsInMs: 3000 });
        // 전적 줄이 "점검으로 끝남"으로 남음
        await expect.poll(
            async () => (await query('SELECT win_reason FROM game_results WHERE id = ?', [t.gameId]))[0]?.win_reason ?? null,
            { timeout: 40_000, message: '점검으로 끝난 판 전적' },
        ).toBe('MAINTENANCE');
        // 점검 판은 프로필 다시 읽기 신호만 옴 → 이게 오면 그 판 뒤처리는 끝
        await watcher.waitForEvent('account_cache_invalidated', { timeoutMs: 30_000, match: (p) => p?.gameId === t.gameId });
    } finally {
        await maint.clearMaintenance(internal);
    }
}

// 결과 화면 없이 판이 지워짐: 서버에 판 없음, 화면은 결과 화면이 아니고 결과판·골드 칸 없음
async function expectNoResultScreen(t, page) {
    await expect.poll(async () => (await t.state()) === null, { timeout: 20_000, message: '판이 서버에서 지워짐' }).toBe(true);
    await expect(page).not.toHaveURL(/\/gameresult/);
    await expect(k.board(page)).toHaveCount(0);
    await expect(page.getByTestId('game-result-gold-reward')).toHaveCount(0);
}

test('A07-E-039 5명 판 판 중 점검 시각 → 판 끝남, 지갑 그대로·장부 0줄, 결과판 골드 없음 @game @serial @smoke', async ({ user, table, internal }) => {
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)]);
    const before = await k.gold(uid(user));
    await abortByMaintenance(internal, t, t.bots[1]);
    await expectNoResultScreen(t, page);
    expect(await k.rewardRows(t.gameId)).toHaveLength(0);
    expect(await k.gold(uid(user))).toBe(before);
});

test('A07-E-127 5명 판 판 수 2인 사람 판이 점검으로 끝남 → 판 수 업적 없음 @game @serial', async ({ user, table, internal }) => {
    const events = k.watchSocket(user.page);
    const { t, page } = await k.open(table, user, 'CITIZEN', ['JOKER', ...C(3)], { keepUser: true });
    // 끝까지 간 판이 2개 → 이 판이 제대로 끝났다면 3판째라 "판 수 3" 업적을 받을 자리
    await k.seedGames(uid(user), 2);
    const before = await k.gold(uid(user));
    await abortByMaintenance(internal, t, t.bots[1]);
    await expectNoResultScreen(t, page);
    expect(await k.grantedIds(uid(user))).toEqual([]);
    expect(k.grantedEvents(events)).toEqual([]);
    expect(await k.gold(uid(user))).toBe(before);
});
