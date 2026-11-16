'use strict';

// 광대에게 지목된 사람의 그 밤 능력 브라우저 시험 (PC) — 찍힌 경비원·마녀사냥꾼은 살아나야 결과를 받음, 찍힌 의사의 선택은 적용, 의사는 밤 중에 찍힌 줄 모름
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-058~064·166·167, 모이는지만 봄: npx playwright test --list tests/ingame/a05-marked.spec.js
const { test, expect } = require('../../helpers/fixtures');
const n = require('./b-night/_night');
const k = require('./_a05a-pc-kit');

test('A05-E-058 5명 직접{광대1·경비원1} 찍힌 경비원 사람(의사 없음): 조사해도 결과 창이 안 뜨고 낮에 내 카드 사망 @game @smoke', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 4, settings: n.custom({ JOKER: 1, GUARD: 1 }), me: 'GUARD', botRoles: ['JOKER'] });
    const joker = t.bots[0];
    await k.playNight({ t, page, me: 'GUARD', who: { JOKER: joker }, picks: { JOKER: user, GUARD: joker } });
    await k.toDay(t, 2);
    await k.expectNoNewResult(page, 2);
    await k.expectDead(page, user);
});

test('A05-E-059 6명 직접{광대1·의사1·경비원1} 찍힌 경비원 사람을 의사 봇이 살림: 결과 창이 뜨고 낮에 살아 있음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, {
        bots: 5, settings: n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }), me: 'GUARD', botRoles: ['JOKER', 'DOCTOR'],
    });
    const [joker, doctor] = t.bots;
    await k.playNight({ t, page, me: 'GUARD', who: { JOKER: joker, DOCTOR: doctor }, picks: { JOKER: user, DOCTOR: user, GUARD: joker } });
    await k.toDay(t, 2);
    await k.expectRoleResult(page, 'INVESTIGATE', joker, 'JOKER');
    await k.expectAlive(page, user);
});

test('A05-E-060 6명 직접{광대1·마녀사냥꾼1} 둘째 밤 찍힌 마녀사냥꾼 사람(의사 없음): 확인해도 결과 창이 안 뜨고 사망 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, {
        bots: 5, settings: n.custom({ JOKER: 1, WITCH_HUNTER: 1 }), me: 'WITCH_HUNTER', botRoles: ['JOKER', 'CITIZEN'],
    });
    const [joker, executed] = t.bots;
    // 확인할 죽은 사람을 첫날 처형으로 만듦
    await k.execute(t, executed);
    await k.playNight({ t, page, me: 'WITCH_HUNTER', night: 2, who: { JOKER: joker }, picks: { JOKER: user, WITCH_HUNTER: executed } });
    await k.toDay(t, 3);
    await k.expectNoNewResult(page, 3);
    await k.expectDead(page, user);
});

test('A05-E-061 7명 직접{광대1·의사1·마녀사냥꾼1} 둘째 밤 찍힌 마녀사냥꾼 사람을 의사 봇이 살림: 결과 창이 뜸 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, {
        bots: 6, settings: n.custom({ JOKER: 1, DOCTOR: 1, WITCH_HUNTER: 1 }), me: 'WITCH_HUNTER', botRoles: ['JOKER', 'DOCTOR', 'CITIZEN'],
    });
    const [joker, doctor, executed] = t.bots;
    await k.execute(t, executed);
    await k.playNight({
        t, page, me: 'WITCH_HUNTER', night: 2,
        who: { JOKER: joker, DOCTOR: doctor },
        picks: { JOKER: user, DOCTOR: user, WITCH_HUNTER: executed },
    });
    await k.toDay(t, 3);
    await k.expectRoleResult(page, 'CONFIRM', executed, 'CITIZEN');
    await k.expectAlive(page, user);
});

test('A05-E-062 6명 찍힌 의사 사람이 자기를 보호: 낮에 살아 있음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, me: 'DOCTOR', botRoles: ['JOKER'] });
    const joker = t.bots[0];
    await k.playNight({ t, page, me: 'DOCTOR', who: { JOKER: joker }, picks: { JOKER: user, DOCTOR: user } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectAlive(page, user);
    await k.expectDeadNames(page, []);
});

test('A05-E-063 6명 찍힌 의사 사람이 딴 사람을 보호: 낮에 사망 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, me: 'DOCTOR', botRoles: ['JOKER', 'CITIZEN'] });
    const [joker, citizen] = t.bots;
    await k.playNight({ t, page, me: 'DOCTOR', who: { JOKER: joker }, picks: { JOKER: user, DOCTOR: citizen } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    await k.expectDead(page, user);
    await k.expectDeadNames(page, [user]);
});

test('A05-E-064 6명 광대 봇이 의사 사람을 노린 밤: 의사 차례 화면에 암살 영상·찍혔다는 글이 없음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, me: 'DOCTOR', botRoles: ['JOKER'] });
    const joker = t.bots[0];
    await k.playNight({ t, page, me: 'DOCTOR', who: { JOKER: joker }, picks: { JOKER: user } });
    // 내 차례 화면이 열린 뒤에 봄 (광대 차례는 이미 닫힘)
    await n.toTurn(t, 'DOCTOR', { dayIndex: 1 });
    await k.myTurnReady(page);
    const rec = await n.readUi(page);
    expect(rec.kills, '암살 영상이 뜬 수').toBe(0);
    expect(rec.videos, '틀어진 연출 영상').toEqual([]);
    expect(rec.dawnReports, '낮 시작 글 창').toEqual([]);
    expect(rec.dawnMessages, '살해 글').toEqual([]);
    await expect(page.locator('[data-ingame-night-success-kill]')).toHaveCount(0);
    await expect(page.getByRole('dialog').filter({ hasText: /암살|살해|공격|지목/ })).toHaveCount(0);
    await expect(k.resultBox(page)).toHaveCount(0);
    await k.expectTurn(t, 'DOCTOR', 1);
});

test('A05-E-166 8명 직접{광대1·경비원2} 봇 경비원이 찍힘(못 살림)·사람 경비원은 안 찍힘: 사람 화면에 결과 창이 뜸 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 7, settings: n.custom({ JOKER: 1, GUARD: 2 }), me: 'GUARD', botRoles: ['JOKER', 'GUARD'] });
    const [joker, mate] = t.bots;
    await k.playNight({
        t, page, me: 'GUARD',
        who: { JOKER: joker },
        mates: { GUARD: [[mate, joker]] },
        picks: { JOKER: mate, GUARD: joker },
    });
    await k.toDay(t, 2);
    await k.expectRoleResult(page, 'INVESTIGATE', joker, 'JOKER');
    await k.expectDead(page, mate);
    await k.expectAlive(page, user);
});

test('A05-E-167 8명 직접{광대1·경비원2} 사람 경비원이 찍힘(못 살림): 결과 창이 안 뜨고 사망 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 7, settings: n.custom({ JOKER: 1, GUARD: 2 }), me: 'GUARD', botRoles: ['JOKER', 'GUARD'] });
    const [joker, mate] = t.bots;
    await k.playNight({
        t, page, me: 'GUARD',
        who: { JOKER: joker },
        mates: { GUARD: [[mate, joker]] },
        picks: { JOKER: user, GUARD: joker },
    });
    await k.toDay(t, 2);
    await k.expectNoNewResult(page, 2);
    await k.expectDead(page, user);
});
