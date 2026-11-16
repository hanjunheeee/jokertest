'use strict';

// 연달아 고르기 브라우저 시험 (PC) — 둘째 밤에 어제와 같은 사람을 다시 고름: 의사 자기 보호, 경비원 조사, 광대 암살, 마녀사냥꾼 확인
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-084~087, 모이는지만 봄: npx playwright test --list tests/ingame/a05-repeat.spec.js
const { test, expect } = require('../../helpers/fixtures');
const k = require('./_a05a-pc-kit');

test('A05-E-084 7명 의사 사람이 첫 밤·둘째 밤 연달아 자기를 보호: 둘째 밤도 받고, 광대 봇이 의사를 노려도 삶 @game @smoke', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, { bots: 6, me: 'DOCTOR', botRoles: ['JOKER'] });
    const joker = t.bots[0];
    await k.playNight({ t, page, me: 'DOCTOR', night: 1, picks: { DOCTOR: user } });
    await k.toDay(t, 2);
    await k.dayShown(page, 2);
    // 둘째 밤: 같은 보호를 다시 냄 (서버가 받아야 playNight가 지나감)
    await k.playNight({ t, page, me: 'DOCTOR', night: 2, who: { JOKER: joker }, picks: { JOKER: user, DOCTOR: user } });
    await k.toDay(t, 3);
    await k.dayShown(page, 3);
    await k.expectAlive(page, user);
    await k.expectDeadNames(page, []);
});

test('A05-E-085 8명 경비원 사람이 둘째 밤에 어제와 같은 사람을 조사: 결과 창이 다시 뜸 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, { bots: 7, me: 'GUARD', botRoles: ['CITIZEN'] });
    const target = t.bots[0];
    await k.playNight({ t, page, me: 'GUARD', night: 1, picks: { GUARD: target } });
    await k.toDay(t, 2);
    await k.expectRoleResult(page, 'INVESTIGATE', target, 'CITIZEN');
    await k.confirmResult(page);
    await k.playNight({ t, page, me: 'GUARD', night: 2, picks: { GUARD: target } });
    await k.toDay(t, 3);
    await k.expectRoleResult(page, 'INVESTIGATE', target, 'CITIZEN');
    expect(await k.resultsSeen(page), '두 밤 동안 뜬 결과 창').toHaveLength(2);
});

test('A05-E-086 7명 광대 사람이 둘째 밤에 어제 의사가 살린 사람을 다시 노림(의사 봇은 딴 사람): 이번엔 죽음 @game', async ({ user, table }) => {
    test.setTimeout(180_000);
    const { t, page } = await k.open(table, user, { bots: 6, me: 'JOKER', botRoles: ['DOCTOR', 'CITIZEN', 'CITIZEN'] });
    const [doctor, target, other] = t.bots;
    await k.playNight({ t, page, me: 'JOKER', night: 1, who: { DOCTOR: doctor }, picks: { JOKER: target, DOCTOR: target } });
    await k.toDay(t, 2);
    // 첫 밤은 막힘: 암살 실패 글을 확인하고 닫음 (열어 두면 판 화면을 못 누름)
    await k.expectResult(page, 'ASSASSINATE', ['이번 밤의 암살이 실패했습니다.']);
    await k.confirmResult(page);
    await k.expectAlive(page, target);
    await k.playNight({ t, page, me: 'JOKER', night: 2, who: { DOCTOR: doctor }, picks: { JOKER: target, DOCTOR: other } });
    await k.toDay(t, 3);
    await k.dayShown(page, 3);
    await k.expectDeadNames(page, [target]);
});

test('A05-E-087 10명 마녀사냥꾼 사람이 둘째·셋째 밤 연달아 같은 죽은 사람을 확인: 결과 창이 두 번 뜸 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const { t, page } = await k.open(table, user, { bots: 9, me: 'WITCH_HUNTER', botRoles: ['CITIZEN'] });
    const dead = t.bots[0];
    // 확인할 죽은 사람을 첫날 처형으로 만듦 (첫 밤엔 마녀사냥꾼 차례가 없어 둘째 밤부터)
    await k.execute(t, dead);
    await k.playNight({ t, page, me: 'WITCH_HUNTER', night: 2, picks: { WITCH_HUNTER: dead } });
    await k.toDay(t, 3);
    await k.expectRoleResult(page, 'CONFIRM', dead, 'CITIZEN');
    await k.confirmResult(page);
    await k.playNight({ t, page, me: 'WITCH_HUNTER', night: 3, picks: { WITCH_HUNTER: dead } });
    await k.toDay(t, 4);
    await k.expectRoleResult(page, 'CONFIRM', dead, 'CITIZEN');
    expect(await k.resultsSeen(page), '두 밤 동안 뜬 결과 창').toHaveLength(2);
});
