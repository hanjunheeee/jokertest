'use strict';

// 밤 차례 순서 브라우저 시험 (PC) — 내 직업 차례 안내 창, 시민 화면이 본 차례 안내 목록(자동·직접 구성), 차례 타이머 시작값
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-001~011·151~160, 모이는지만 봄: npx playwright test --list tests/ingame/a05-turn-order.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const n = require('./b-night/_night');
const k = require('./_a05a-pc-kit');

const NIGHT_WORD = { 1: '첫', 2: '둘째' };
// 차례 목록을 글로: ['JOKER', 'DOCTOR'] → '광대→의사'
const turnsText = (order) => order.map((role) => n.ROLE_NAMES[role]).join('→');
// 직접 구성을 글로: { JOKER: 1, GUARD: 2 } → '광대1·경비원2'
const countsText = (counts) => Object.entries(counts).map(([role, count]) => `${n.ROLE_NAMES[role]}${count}`).join('·');

// 밤 차례 안내 창의 글 (창은 잠깐 떴다 저절로 닫힘)
const turnMessage = (page, role) => page.getByRole('dialog', { name: '밤 역할 안내' }).getByText(n.TURN_MESSAGES[role]);

// 내 직업 차례 안내: [번호, 내 직업, 인원, 몇 번째 밤, 표시]
const MY_TURN = [
    ['A05-E-001', 'JOKER', 5, 1, ' @smoke'],
    ['A05-E-002', 'DOCTOR', 6, 1, ''],
    ['A05-E-003', 'GUARD', 8, 1, ''],
    ['A05-E-004', 'WITCH_HUNTER', 10, 2, ''],
];
for (const [no, role, players, night, mark] of MY_TURN) {
    test(`${no} ${players}명 판 ${n.ROLE_NAMES[role]} 사람: ${NIGHT_WORD[night]} 밤 내 차례에 "${n.TURN_MESSAGES[role]}" 창이 읽힘 @game${mark}`, async ({ user, table }) => {
        if (night > 1) test.setTimeout(180_000);
        const { t, page } = await k.open(table, user, { bots: players - 1, me: role });
        // 안내 창이 금방 닫혀서, 차례까지 넘기는 동안 같이 기다림
        await Promise.all([
            expectReadable(turnMessage(page, role), { timeout: 90_000 }),
            n.toTurn(t, role, { dayIndex: night }),
        ]);
        await k.expectTurn(t, role, night);
    });
}

/**
 * 그 밤을 차례마다 틈을 주며 넘기고, 그 밤 동안 시민 화면에 뜬 차례 안내를 순서대로 돌려줌
 * (틈: 차례가 너무 빨리 넘어가면 화면이 안내를 띄우기 전에 다음 차례가 됨)
 */
async function watchNight(t, page, night) {
    await k.toDay(t, night);
    await k.dayShown(page, night);
    const before = (await k.turnsSeen(page)).length;
    await n.toDay(t, { dayIndex: night + 1, stepDelayMs: 1300 });
    await k.dayShown(page, night + 1);
    return (await k.turnsSeen(page)).slice(before);
}

// 시민 화면이 본 차례 안내: [번호, 인원, 직접 구성(없으면 자동), 몇 번째 밤, 기대 차례]
const ALL_FOUR = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'];
const WATCH = [
    ['A05-E-005', 5, null, 1, ['JOKER']],
    ['A05-E-006', 6, null, 1, ['JOKER', 'DOCTOR']],
    ['A05-E-007', 8, null, 1, ['JOKER', 'DOCTOR', 'GUARD']],
    ['A05-E-008', 10, null, 2, ALL_FOUR],
    ['A05-E-151', 10, { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 }, 2, ALL_FOUR],
    ['A05-E-152', 5, { JOKER: 1, WITCH_HUNTER: 1 }, 1, ['JOKER']],
    ['A05-E-153', 5, { JOKER: 1, WITCH_HUNTER: 1 }, 2, ['JOKER', 'WITCH_HUNTER']],
    ['A05-E-154', 7, { JOKER: 1, GUARD: 2 }, 1, ['JOKER', 'GUARD']],
    ['A05-E-155', 5, { JOKER: 2, DOCTOR: 1 }, 1, ['JOKER', 'DOCTOR']],
    ['A05-E-156', 9, { JOKER: 1, DOCTOR: 2, GUARD: 2 }, 1, ['JOKER', 'DOCTOR', 'GUARD']],
];
for (const [no, players, counts, night, order] of WATCH) {
    const setup = counts ? `직접{${countsText(counts)}}` : '자동 구성';
    test(`${no} ${players}명 ${setup} 시민 화면: ${NIGHT_WORD[night]} 밤 차례 안내가 [${turnsText(order)}] @game`, async ({ user, table }) => {
        if (night > 1) test.setTimeout(180_000);
        const { t, page } = await k.open(table, user, { bots: players - 1, settings: counts ? n.custom(counts) : {}, me: 'CITIZEN' });
        const seen = await watchNight(t, page, night);
        // 서버가 연 차례(봇이 받은 알림)와 화면에 뜬 안내가 둘 다 목록대로
        expect(n.turnOrder(t.bots[0], night), '서버가 연 차례').toEqual(order);
        expect(seen, '화면에 뜬 차례 안내').toEqual(order);
    });
}

test('A05-E-009 10명 자동 구성 시민 화면: 첫 밤엔 마녀사냥꾼 안내가 0번, 경비원 차례 뒤 바로 낮 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 9, me: 'CITIZEN' });
    const seen = await watchNight(t, page, 1);
    expect(seen.filter((role) => role === 'WITCH_HUNTER'), '마녀사냥꾼 안내').toHaveLength(0);
    // 경비원이 마지막 안내 → 그 뒤는 낮 (watchNight가 낮 화면까지 본 뒤 돌아옴)
    expect(seen).toEqual(['JOKER', 'DOCTOR', 'GUARD']);
    expect(n.turnOrder(t.bots[0], 1), '서버가 연 차례').toEqual(['JOKER', 'DOCTOR', 'GUARD']);
    expect((await t.state()).phase).toBe('DAY');
});

test('A05-E-010 6명 직접{광대1·경비원1} 시민 화면: 구성에 없는 의사 안내 0번, 경비원 안내 1번 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, settings: n.custom({ JOKER: 1, GUARD: 1 }), me: 'CITIZEN' });
    const seen = await watchNight(t, page, 1);
    expect(seen.filter((role) => role === 'DOCTOR'), '의사 안내').toHaveLength(0);
    expect(seen.filter((role) => role === 'GUARD'), '경비원 안내').toHaveLength(1);
});

test('A05-E-011 5명 직접{광대1·의사1·경비원1·마녀사냥꾼1} 시민 화면: 첫 밤 안내 3개, 둘째 밤 4개 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, {
        bots: 4, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 1 }), me: 'CITIZEN',
    });
    const first = await watchNight(t, page, 1);
    const second = await watchNight(t, page, 2);
    expect(first, '첫 밤').toEqual(['JOKER', 'DOCTOR', 'GUARD']);
    expect(second, '둘째 밤').toEqual(ALL_FOUR);
});

// 차례 시간 = 방 설정 밤 시간: [번호, 밤 시간(초)]
for (const [no, seconds] of [['A05-E-157', 30], ['A05-E-158', 60], ['A05-E-159', 90], ['A05-E-160', 120]]) {
    test(`${no} 6명 밤 ${seconds}초 방: 광대 차례 시작 때 타이머 남은 시간이 ${seconds}초(±1.5) @game`, async ({ user, table }) => {
        const { t, page } = await k.open(table, user, { bots: 5, settings: { nightActionTime: seconds }, me: 'CITIZEN', botRoles: ['JOKER'] });
        // 첫 낮에 시간 바를 펼쳐 둠 (접힌 바엔 남은 시간이 안 보임)
        await k.toDay(t, 1);
        await k.expandTimebar(page);
        await n.toTurn(t, 'JOKER', { dayIndex: 1 });
        // 차례가 열린 때(봇이 알림을 받은 때)부터 흐른 시간만큼 뺀 값과 화면 타이머를 견줌 (아무도 안 골라 마감이 안 당겨짐)
        const startedAt = await k.eventAt(t.bots[1], 'night_turn_started', (p) => p.role === 'JOKER' && p.dayIndex === 1);
        await expect.poll(async () => {
            const shown = await k.timerSeconds(page);
            if (shown === null) return Number.POSITIVE_INFINITY;
            return Math.abs(shown - (seconds - (Date.now() - startedAt) / 1000));
        }, { timeout: 8000, message: `타이머가 ${seconds}초에서 시작` }).toBeLessThanOrEqual(1.5);
        await k.expectTurn(t, 'JOKER', 1);
    });
}
