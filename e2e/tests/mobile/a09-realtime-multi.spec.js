'use strict';

// 모바일 끊김 진짜 시간 어려운 브라우저 시험 (사람 2명 모두 모바일) — 오프라인 59초 안·30초에 돌아오면 판 그대로, 남은 사람 채팅에 끊김 알림
// 목록 A09-끊김-나가기-탈주.md A09-H-002·041, 60초는 손잡이 없이 진짜로 기다림 — 모이는지만: npx playwright test --list tests/mobile/a09-realtime-multi.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { talk, expectPlayerStatus } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');
const H = require('../ingame/_a09-hard-kit');

const { U, nick, GRACE_MS, TOL, REOPEN_AT_MS } = H;

// 모바일 사람 둘(ㄱ·ㄴ) → 7명 판 첫 낮 토론, ㄴ 브라우저에 소켓 길목
async function openDay(user, players, table) {
    const [a, b] = await H.openPeople(user, players, 2);
    const gate = await H.socketGate(b);
    const t = await H.seat(table, [a, b], { n: 7 });
    await K.toDay(t);
    for (const p of [a, b]) await expect(talk.phaseLine(p.page)).toContainText('낮', { timeout: 15_000 });
    return { a, b, gate, t };
}

// 남은 사람 채팅 칸에 "○○님의 연결이 끊겼습니다" 알림 줄
async function expectDropNotice(page, name) {
    const line = talk.system(page).filter({ hasText: H.TEXT.disconnectedNotice(name) });
    await expect(line).toHaveCount(1, { timeout: 15_000 });
    await expectReadable(line.getByText(H.TEXT.disconnectedNotice(name)), { uncovered: false });
}

// 돌아온 사람 판 그대로: 서버 산 채·참여 중, 화면은 판 화면에 낮 토론 단계 줄
async function expectStillIn(t, person) {
    const row = await t.player(U(person));
    expect(row.alive).toBe(true);
    expect(row.isParticipating).toBe(true);
    await expect(person.page).toHaveURL(/\/ingame/);
    await expect(talk.phaseLine(person.page)).toContainText('낮', { timeout: 20_000 });
}

test('A09-H-002 모바일 7명 판(사람 2 + 봇 5) ㄴ이 오프라인 → 59초 안에 온라인 → 판 그대로 이어짐, ㄱ 채팅에 끊김 알림 @game @hard @realtime', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const { a, b, gate, t } = await openDay(user, players, table);
    const dropAt = await H.goOffline(t, b, gate);
    await expectDropNotice(a.page, nick(b));
    const backAt = await H.goOnline(t, b, gate, { at: dropAt + REOPEN_AT_MS });
    expect(backAt - dropAt, '60초 안에 돌아와야 이 규칙을 봄').toBeLessThan(GRACE_MS);
    await expectStillIn(t, b);
    // 처음 끊긴 때부터 60초가 지나도 판 그대로
    await K.sleepUntil(dropAt + GRACE_MS + TOL);
    await expectStillIn(t, b);
});

test('A09-H-041 모바일 7명 판(사람 2 + 봇 5) ㄴ이 오프라인 30초 → 다시 붙으면 판 그대로 @game @hard @realtime @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const { a, b, gate, t } = await openDay(user, players, table);
    const dropAt = await H.goOffline(t, b, gate);
    await expectDropNotice(a.page, nick(b));
    const backAt = await H.goOnline(t, b, gate, { at: dropAt + 30_000 });
    expect(backAt - dropAt).toBeLessThan(GRACE_MS);
    await expectStillIn(t, b);
    // 남은 사람 화면 플레이어 목록에도 ㄴ 줄 그대로 (끊김 표시 없이)
    await expectPlayerStatus(a.page, nick(b), null);
});
