'use strict';

// 같은 계정 다른 기기 어려운 브라우저 시험 (PC, 사람 2명) — 판 중 다른 기기 로그인은 새 기기로 이어짐(남 화면에 끊김 안 뜸), 끊긴 채 45초에 다른 기기로 붙으면 60초 뒤에도 산 채
// 목록 A09-끊김-나가기-탈주.md A09-H-021·040 — 모이는지만: npx playwright test --list tests/ingame/a09-device-multi.spec.js
const { test, expect } = require('../../helpers/fixtures');
const A = require('./_a04-multi');
const K = require('./_a09-simple-kit');
const H = require('./_a09-hard-kit');

const { U, nick, GRACE_MS } = H;

// 같은 계정으로 새 브라우저(다른 기기) 로그인 → 로비가 판 화면으로 되돌림
async function otherDevice(players, person) {
    const other = await players.add({ account: person.account, lobby: false });
    H.collectDialogs(other.page);
    await other.page.goto('/lobby');
    await expect(other.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expect(other.page.locator('[data-ingame-player-nickname]').first()).toBeVisible({ timeout: 30_000 });
    return other;
}

test('A09-H-021 6명 판(사람 2 + 봇 4) ㄱ이 다른 기기로 로그인 → 새 기기로 판 이어짐, 옛 기기 로그인 화면, ㄴ 화면엔 ㄱ 끊김 표시 안 뜸 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const t = await H.seat(table, [a, b], { n: 6 });
    await K.toDay(t);
    await A.calm(b.page);
    await H.watchStatus(b.page, nick(a));
    H.collectDialogs(a.page);

    const other = await otherDevice(players, a);
    await expect(a.page, '옛 기기는 로그인 화면').toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(other.page.locator('[data-ingame-player-nickname]')).toHaveCount(6);
    const row = await t.player(U(a));
    expect(row.alive).toBe(true);
    expect(row.isParticipating).toBe(true);
    // 한 단계 더 가서 두 화면이 따라온 뒤에도 ㄴ 화면 ㄱ 카드는 한 번도 "끊김"이 아님
    await H.toVote(t, [b.page, other.page]);
    expect(await H.statusSeen(b.page, nick(a))).toEqual(['alive']);
});

test('A09-H-040 6명 판(사람 2 + 봇 4) ㄴ 오프라인 → 45초에 다른 기기로 로그인 → 산 채, 끊긴 지 60초 뒤에도 산 채 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const [a, b] = await H.openPeople(user, players, 2);
    const gate = await H.socketGate(b);
    const t = await H.seat(table, [a, b], { n: 6 });
    await K.toDay(t);
    await A.calm(a.page);
    const dropAt = await H.goOffline(t, b, gate);
    await H.expectStatus(a.page, nick(b), 'disconnected');

    await K.sleepUntil(dropAt + 45_000);
    const since = Date.now();
    const other = await otherDevice(players, b);
    const backAt = await K.returnedAt(t, U(b), since);
    expect(backAt - dropAt, '60초 안에 새 기기로 붙음').toBeLessThan(GRACE_MS);
    await K.sleepUntil(dropAt + GRACE_MS + 2000);
    const row = await t.player(U(b));
    expect(row.alive).toBe(true);
    expect(row.isParticipating).toBe(true);
    await H.expectStatus(a.page, nick(b), 'alive');
    await expect(other.page).toHaveURL(/\/ingame/);
});
