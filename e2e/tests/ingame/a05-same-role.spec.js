'use strict';

// 같은 직업 둘 브라우저 시험 (PC) — 사람 + 같은 직업 봇이 같은 사람을 골라야 됨(광대·의사·경비원·마녀사냥꾼), 하나만 남으면 혼자 고른 대로, 동료 의사 지키기
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-075~083·164·165·175, 모이는지만 봄: npx playwright test --list tests/ingame/a05-same-role.spec.js
const { test } = require('../../helpers/fixtures');
const n = require('./b-night/_night');
const k = require('./_a05a-pc-kit');

// 광대 사람 + 광대 봇 (7명 광대2): [번호, 봇이 고르는 것, 기대, 표시] — 사람은 늘 시민 A를 고름
const JOKERS = [
    ['A05-E-075', 'same', '죽음', ' @smoke'],
    ['A05-E-076', 'other', '아무도 안 죽음', ''],
    ['A05-E-077', 'skip', '죽음', ''],
];
const MATE_PICK_TEXT = { same: '같은 대상', other: '다른 대상', skip: '봇은 건너뜀' };
for (const [no, matePick, expected, mark] of JOKERS) {
    test(`${no} 7명 광대2 광대 사람 + 광대 봇: ${MATE_PICK_TEXT[matePick]} → ${expected} @game${mark}`, async ({ user, table }) => {
        const { t, page } = await k.open(table, user, {
            bots: 6, settings: { jokerCount: 2 }, me: 'JOKER', botRoles: ['JOKER', 'CITIZEN', 'CITIZEN'],
        });
        const [mate, a, b] = t.bots;
        const mateTarget = { same: a, other: b, skip: null }[matePick];
        await k.playNight({ t, page, me: 'JOKER', mates: { JOKER: [[mate, mateTarget]] }, picks: { JOKER: a } });
        await k.toDay(t, 2);
        await k.dayShown(page, 2);
        await k.expectDeadNames(page, expected === '죽음' ? [a] : []);
    });
}

// 의사 사람 + 의사 봇 (8명 직접{의사2}): 광대 봇은 시민 A를 노림, 사람은 A를 지킴
for (const [no, same] of [['A05-E-078', true], ['A05-E-079', false]]) {
    test(`${no} 8명 직접{의사2} 의사 사람 + 의사 봇: ${same ? '둘 다 광대 대상을 지킴 → 삶' : '서로 다른 사람을 지킴 → 광대 대상 죽음'} @game`, async ({ user, table }) => {
        const { t, page } = await k.open(table, user, {
            bots: 7, settings: n.custom({ JOKER: 1, DOCTOR: 2 }), me: 'DOCTOR', botRoles: ['JOKER', 'DOCTOR', 'CITIZEN', 'CITIZEN'],
        });
        const [joker, mate, a, b] = t.bots;
        await k.playNight({
            t, page, me: 'DOCTOR',
            who: { JOKER: joker },
            mates: { DOCTOR: [[mate, same ? a : b]] },
            picks: { JOKER: a, DOCTOR: a },
        });
        await k.toDay(t, 2);
        await k.dayShown(page, 2);
        await k.expectDeadNames(page, same ? [] : [a]);
    });
}

// 경비원 사람 + 경비원 봇 (8명 직접{경비원2}): 사람은 광대를 조사
for (const [no, same] of [['A05-E-080', true], ['A05-E-081', false]]) {
    test(`${no} 8명 직접{경비원2} 경비원 사람 + 경비원 봇: ${same ? '같은 대상 → 결과 창' : '다른 대상 → 결과 창 없음'} @game`, async ({ user, table }) => {
        const { t, page } = await k.open(table, user, {
            bots: 7, settings: n.custom({ JOKER: 1, GUARD: 2 }), me: 'GUARD', botRoles: ['JOKER', 'GUARD', 'CITIZEN'],
        });
        const [joker, mate, citizen] = t.bots;
        await k.playNight({ t, page, me: 'GUARD', mates: { GUARD: [[mate, same ? joker : citizen]] }, picks: { GUARD: joker } });
        await k.toDay(t, 2);
        if (same) await k.expectRoleResult(page, 'INVESTIGATE', joker, 'JOKER');
        else await k.expectNoNewResult(page, 2);
    });
}

// 마녀사냥꾼 사람 + 마녀사냥꾼 봇 (10명 직접{마녀사냥꾼2}, 둘째 밤): 죽은 사람 둘(첫날 처형 Z1, 첫 밤 암살 Z2), 사람은 Z1을 확인
for (const [no, same] of [['A05-E-082', true], ['A05-E-083', false]]) {
    test(`${no} 10명 직접{마녀사냥꾼2} 둘째 밤 마녀사냥꾼 사람 + 봇: ${same ? '같은 대상 → 결과 창' : '다른 대상 → 결과 창 없음'} @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const { t, page } = await k.open(table, user, {
            bots: 9, settings: n.custom({ JOKER: 1, WITCH_HUNTER: 2 }), me: 'WITCH_HUNTER', botRoles: ['JOKER', 'WITCH_HUNTER', 'CITIZEN', 'CITIZEN'],
        });
        const [joker, mate, z1, z2] = t.bots;
        await k.execute(t, z1);
        await k.playNight({ t, page, me: 'WITCH_HUNTER', night: 1, who: { JOKER: joker }, picks: { JOKER: z2 } });
        await k.toDay(t, 2);
        await k.dayShown(page, 2);
        await k.expectDeadNames(page, [z1, z2]);
        await k.playNight({
            t, page, me: 'WITCH_HUNTER', night: 2,
            mates: { WITCH_HUNTER: [[mate, same ? z1 : z2]] },
            picks: { WITCH_HUNTER: z1 },
        });
        await k.toDay(t, 3);
        if (same) await k.expectRoleResult(page, 'CONFIRM', z1, 'CITIZEN');
        else await k.expectNoNewResult(page, 3);
    });
}

test('A05-E-164 7명 광대2 광대 봇이 첫날 처형된 뒤 남은 광대 사람 혼자: 사람이 고른 대로 죽음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 6, settings: { jokerCount: 2 }, me: 'JOKER', botRoles: ['JOKER', 'CITIZEN'] });
    const [mate, victim] = t.bots;
    await k.execute(t, mate);
    await k.playNight({ t, page, me: 'JOKER', picks: { JOKER: victim } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectDeadNames(page, [mate, victim]);
});

test('A05-E-165 8명 직접{의사2} 의사 봇이 첫날 처형된 뒤 남은 의사 사람 혼자: 사람의 보호가 적용돼 광대 대상이 삶 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, {
        bots: 7, settings: n.custom({ JOKER: 1, DOCTOR: 2 }), me: 'DOCTOR', botRoles: ['JOKER', 'DOCTOR', 'CITIZEN'],
    });
    const [joker, mate, target] = t.bots;
    await k.execute(t, mate);
    await k.playNight({ t, page, me: 'DOCTOR', who: { JOKER: joker }, picks: { JOKER: target, DOCTOR: target } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectAlive(page, target);
    await k.expectDeadNames(page, [mate]);
});

test('A05-E-175 8명 직접{의사2} 동료 의사 지키기: 사람 의사·봇 의사 둘 다 봇 의사를 고르고 광대 봇이 봇 의사를 노림 → 삶 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, {
        bots: 7, settings: n.custom({ JOKER: 1, DOCTOR: 2 }), me: 'DOCTOR', botRoles: ['JOKER', 'DOCTOR'],
    });
    const [joker, mate] = t.bots;
    await k.playNight({
        t, page, me: 'DOCTOR',
        who: { JOKER: joker },
        mates: { DOCTOR: [[mate, mate]] },
        picks: { JOKER: mate, DOCTOR: mate },
    });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectAlive(page, mate);
    await k.expectDeadNames(page, []);
});
