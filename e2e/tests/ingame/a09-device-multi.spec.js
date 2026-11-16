'use strict';

// 같은 계정 다른 기기 어려운 브라우저 시험 (PC, 사람 2명) — 판 중 다른 기기 로그인은 새 기기로 이어짐(남 화면 끊김 표시는 2초 안에 사라짐), 끊긴 채 45초에 다른 기기로 붙으면 60초 뒤에도 산 채
// 목록 A09-끊김-나가기-탈주.md A09-H-021·040 — 모이는지만: npx playwright test --list tests/ingame/a09-device-multi.spec.js
const { test, expect } = require('../../helpers/fixtures');
const A = require('./_a04-multi');
const K = require('./_a09-simple-kit');
const H = require('./_a09-hard-kit');

const { U, nick, GRACE_MS } = H;
// 다른 기기 로그인 때 남 화면에 잠깐 뜨는 끊김 표시 허용 길이: 옛 세션이 먼저 끊기고 새 기기가 뒤에 붙는 순서라 1~2초 뜸 (그대로 두기로 함 2026-11-16)
const SWITCH_BLIP_MS = 2_000;

// 같은 계정으로 새 브라우저(다른 기기) 로그인 → 로비가 판 화면으로 되돌림
async function otherDevice(players, person) {
    const other = await players.add({ account: person.account, lobby: false });
    H.collectDialogs(other.page);
    await other.page.goto('/lobby');
    await expect(other.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expect(other.page.locator('[data-ingame-player-nickname]').first()).toBeVisible({ timeout: 30_000 });
    return other;
}

test('A09-H-021 [지금 동작] 6명 판(사람 2 + 봇 4) ㄱ이 다른 기기로 로그인 → 새 기기로 판 이어짐, 옛 기기 로그인 화면, ㄴ 화면 ㄱ 끊김 표시는 2초 안에 사라지고 그 뒤 산 채 @game @hard @smoke', async ({ user, players, table }) => {
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
    // 한 단계 더 가서 두 화면이 따라온 뒤: ㄴ 화면 ㄱ 카드는 산 채로 시작·끝, 사이 "끊김"은 있어도 2초 안 (옛 세션 끊김 → 새 기기 붙음 순서)
    await H.toVote(t, [b.page, other.page]);
    const spans = await H.statusSpans(b.page, nick(a));
    const seen = spans.map((x) => x.status);
    expect(seen[0], `처음 상태 (${JSON.stringify(spans)})`).toBe('alive');
    expect(seen[seen.length - 1], `끝 상태 (${JSON.stringify(spans)})`).toBe('alive');
    expect(seen.every((x) => x === 'alive' || x === 'disconnected'), `산 채·끊김 말고 다른 상태 없음 (${JSON.stringify(spans)})`).toBe(true);
    for (const blip of spans.filter((x) => x.status === 'disconnected')) {
        expect(blip.ms, `끊김 표시 ${Math.round(blip.ms)}ms (2초 안이어야 함)`).toBeLessThanOrEqual(SWITCH_BLIP_MS);
    }
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
