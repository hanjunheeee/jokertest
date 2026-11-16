'use strict';

// 밤에 승패 브라우저 시험 (PC) — 밤 암살로 산 광대 ≥ 나머지가 되면 결과 화면(광대 승), 아니면 낮으로 계속
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-088~092·177·178, 모이는지만 봄: npx playwright test --list tests/ingame/a05-night-win.spec.js
const { test, expect } = require('../../helpers/fixtures');
const n = require('./b-night/_night');
const k = require('./_a05a-pc-kit');

const JOKER_WIN = '광대 진영 승리';

// 낮 화면이고 결과 화면이 아닌지
async function expectStillPlaying(t, page, dayIndex) {
    await k.dayShown(page, dayIndex);
    await expect(page).toHaveURL(/\/ingame/);
    const s = await t.state();
    expect({ phase: s.phase, day: s.dayIndex, winner: s.winResult?.winner ?? null }).toEqual({ phase: 'DAY', day: dayIndex, winner: null });
}

test('A05-E-088 5명 광대2 광대 사람: 첫 밤 암살로 2:2 → 결과 화면에 광대 승리가 읽힘 @game @smoke', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 4, settings: { jokerCount: 2 }, me: 'JOKER', botRoles: ['JOKER', 'CITIZEN'] });
    const [mate, victim] = t.bots;
    await k.playNight({ t, page, me: 'JOKER', mates: { JOKER: [[mate, victim]] }, picks: { JOKER: victim } });
    await n.toEnd(t);
    await k.expectResultScreen(page, { banner: '승리', team: JOKER_WIN });
});

test('A05-E-089 5명 광대2 시민 사람: 첫 밤 암살로 판이 끝남 → 결과 화면에 패배가 읽힘 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 4, settings: { jokerCount: 2 }, me: 'CITIZEN', botRoles: ['JOKER', 'JOKER', 'CITIZEN'] });
    const [joker, mate, victim] = t.bots;
    await k.playNight({ t, page, me: 'CITIZEN', who: { JOKER: joker }, mates: { JOKER: [[mate, victim]] }, picks: { JOKER: victim } });
    await n.toEnd(t);
    await k.expectResultScreen(page, { banner: '패배', team: JOKER_WIN });
});

test('A05-E-090 5명 직접{광대2·의사1}: 의사 봇이 광대 대상을 살리면 판이 계속 → 낮 화면이고 결과 화면이 아님 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, {
        bots: 4, settings: n.custom({ JOKER: 2, DOCTOR: 1 }), me: 'JOKER', botRoles: ['JOKER', 'DOCTOR', 'CITIZEN'],
    });
    const [mate, doctor, target] = t.bots;
    await k.playNight({
        t, page, me: 'JOKER',
        who: { DOCTOR: doctor },
        mates: { JOKER: [[mate, target]] },
        picks: { JOKER: target, DOCTOR: target },
    });
    await k.toDay(t, 2);
    await expectStillPlaying(t, page, 2);
    await k.expectDeadNames(page, []);
});

test('A05-E-091 7명 광대1 광대 사람 첫 밤 암살: 1:5라 낮으로 계속 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 6, me: 'JOKER', botRoles: ['CITIZEN'] });
    const victim = t.bots[0];
    await k.playNight({ t, page, me: 'JOKER', picks: { JOKER: victim } });
    await k.toDay(t, 2);
    await expectStillPlaying(t, page, 2);
    await k.expectDeadNames(page, [victim]);
});

test('A05-E-092 6명 광대2 광대 사람: 첫날 시민 처형(2:3) 뒤 둘째 밤 암살로 2:2 → 결과 화면에 광대 승리 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, { bots: 5, settings: { jokerCount: 2 }, me: 'JOKER', botRoles: ['JOKER', 'CITIZEN', 'CITIZEN'] });
    const [mate, executed, victim] = t.bots;
    await k.execute(t, executed);
    // 첫 밤은 아무도 안 고름 → 둘째 밤에 광대 둘이 같은 시민을 고름
    await k.playNight({ t, page, me: 'JOKER', night: 2, mates: { JOKER: [[mate, victim]] }, picks: { JOKER: victim } });
    await n.toEnd(t);
    await k.expectResultScreen(page, { banner: '승리', team: JOKER_WIN });
});

test('A05-E-177 7명 광대1 광대 사람: 처형·암살로 1:2가 된 셋째 밤에 암살 → 1:1 → 결과 화면에 광대 승리 @game', async ({ user, table }) => {
    test.setTimeout(300_000);
    const { t, page } = await k.open(table, user, {
        bots: 6, me: 'JOKER', botRoles: ['DOCTOR', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN', 'CITIZEN'],
    });
    const [doctor, c1, c2, c3, c4] = t.bots;
    // 첫날: 의사 처형 (1:5) → 첫 밤 암살 (1:4)
    await k.execute(t, doctor);
    await k.playNight({ t, page, me: 'JOKER', night: 1, picks: { JOKER: c1 } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    // 둘째 날: 시민 처형 (1:3) → 둘째 밤 암살 (1:2)
    await k.execute(t, c2);
    await k.playNight({ t, page, me: 'JOKER', night: 2, picks: { JOKER: c3 } });
    await k.toDay(t, 3);
    await expectStillPlaying(t, page, 3);
    await k.expectDeadNames(page, [doctor, c1, c2, c3]);
    // 셋째 밤 (1:2): 암살 → 1:1 → 광대 승
    await k.playNight({ t, page, me: 'JOKER', night: 3, picks: { JOKER: c4 } });
    await n.toEnd(t);
    await k.expectResultScreen(page, { banner: '승리', team: JOKER_WIN });
});

test('A05-E-178 8명 광대2 광대 사람: 처형·암살로 2:3이 된 둘째 밤에 암살 → 2:2 → 결과 화면에 광대 승리 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const { t, page } = await k.open(table, user, {
        bots: 7, settings: { jokerCount: 2 }, me: 'JOKER', botRoles: ['JOKER', 'DOCTOR', 'GUARD', 'CITIZEN', 'CITIZEN'],
    });
    const [mate, doctor, guard, c1, c2] = t.bots;
    // 첫날: 의사 처형 (2:5) → 첫 밤 암살 (2:4)
    await k.execute(t, doctor);
    await k.playNight({ t, page, me: 'JOKER', night: 1, mates: { JOKER: [[mate, c1]] }, picks: { JOKER: c1 } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    // 둘째 날: 경비원 처형 (2:3) → 둘째 밤 암살 (2:2) → 광대 승
    await k.execute(t, guard);
    await k.playNight({ t, page, me: 'JOKER', night: 2, mates: { JOKER: [[mate, c2]] }, picks: { JOKER: c2 } });
    await n.toEnd(t);
    await k.expectResultScreen(page, { banner: '승리', team: JOKER_WIN });
});
