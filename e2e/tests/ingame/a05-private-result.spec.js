'use strict';

// 내게만 오는 밤 결과 브라우저 시험 (PC) — 경비원 조사·마녀사냥꾼 확인 결과 창(닉네임·직업 이름), 광대 암살 실패 글, 결과가 없는 직업·경우엔 창 없음
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-043~057·163·176·179~181, 모이는지만 봄: npx playwright test --list tests/ingame/a05-private-result.spec.js
const { test } = require('../../helpers/fixtures');
const n = require('./b-night/_night');
const k = require('./_a05a-pc-kit');

// 시험 이름에 붙일 조사: quoted('시민') → '"시민"이', object('시민') → '시민을'
const quoted = (word) => `"${word}"${n.josa(word, '이', '가').slice(word.length)}`;
const object = (word) => n.josa(word, '을', '를');

// 경비원 사람이 첫 밤 봇 하나를 조사하고 낮까지 → { t, page, target }
async function guardInvestigates(table, user, { players, targetRole }) {
    const { t, page } = await k.open(table, user, { bots: players - 1, me: 'GUARD', botRoles: [targetRole] });
    const target = t.bots[0];
    await k.playNight({ t, page, me: 'GUARD', picks: { GUARD: target } });
    await k.toDay(t, 2);
    return { t, page, target };
}

// 경비원 조사 결과 창: [번호, 인원, 조사할 봇 직업, 표시]
const INVESTIGATE = [
    ['A05-E-043', 8, 'JOKER', ' @smoke'],
    ['A05-E-044', 8, 'CITIZEN', ''],
    ['A05-E-045', 8, 'DOCTOR', ''],
    ['A05-E-046', 10, 'WITCH_HUNTER', ''],
    // 자동 구성 8·9·10명에서 시민 조사
    ['A05-E-179', 8, 'CITIZEN', ''],
    ['A05-E-180', 9, 'CITIZEN', ''],
    ['A05-E-181', 10, 'CITIZEN', ''],
];
for (const [no, players, targetRole, mark] of INVESTIGATE) {
    const roleName = n.ROLE_NAMES[targetRole];
    test(`${no} ${players}명 자동 구성 경비원 사람이 ${roleName} 봇을 조사 → 낮에 결과 창에 그 닉네임과 ${quoted(roleName)} 읽힘 @game${mark}`, async ({ user, table }) => {
        const { page, target } = await guardInvestigates(table, user, { players, targetRole });
        await k.expectRoleResult(page, 'INVESTIGATE', target, targetRole);
    });
}

test('A05-E-047 [지금 동작] 8명 직접{경비원2}: 봇 경비원은 건너뛰고 사람 경비원이 봇 경비원을 조사 → 결과 창 "경비원" @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 7, settings: n.custom({ JOKER: 1, GUARD: 2 }), me: 'GUARD', botRoles: ['GUARD'] });
    const mate = t.bots[0];
    await k.playNight({ t, page, me: 'GUARD', mates: { GUARD: [[mate, null]] }, picks: { GUARD: mate } });
    await k.toDay(t, 2);
    await k.expectRoleResult(page, 'INVESTIGATE', mate, 'GUARD');
});

// 마녀사냥꾼 확인 결과 창: [번호, 죽은 사람 직업, 방 설정] — 그 직업 봇을 첫날 봇 표로 처형하고 둘째 밤에 확인
const CONFIRM = [
    // 광대가 하나뿐이면 처형 순간 판이 끝남 → 광대 2명 판
    ['A05-E-048', 'JOKER', { jokerCount: 2 }, '광대 2명 판'],
    ['A05-E-049', 'CITIZEN', {}, '자동 구성'],
    ['A05-E-050', 'DOCTOR', {}, '자동 구성'],
    ['A05-E-051', 'GUARD', {}, '자동 구성'],
    // 동료 마녀사냥꾼이 죽은 판 → 마녀사냥꾼 2명 판
    ['A05-E-052', 'WITCH_HUNTER', n.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 2 }), '마녀사냥꾼 2명 판'],
];
for (const [no, deadRole, settings, setupName] of CONFIRM) {
    const roleName = n.ROLE_NAMES[deadRole];
    test(`${no} 10명 ${setupName} 마녀사냥꾼 사람이 처형된 ${object(roleName)} 둘째 밤에 확인 → 결과 창에 그 닉네임과 ${quoted(roleName)} 읽힘 @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        const { t, page } = await k.open(table, user, { bots: 9, settings, me: 'WITCH_HUNTER', botRoles: [deadRole] });
        const dead = t.bots[0];
        await k.execute(t, dead);
        await k.playNight({ t, page, me: 'WITCH_HUNTER', night: 2, picks: { WITCH_HUNTER: dead } });
        await k.toDay(t, 3);
        await k.expectRoleResult(page, 'CONFIRM', dead, deadRole);
    });
}

test('A05-E-053 6명 광대 사람이 고른 사람을 의사 봇이 지킴 → 낮에 "이번 밤의 암살이 실패했습니다."가 읽힘 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, me: 'JOKER', botRoles: ['DOCTOR', 'CITIZEN'] });
    const [doctor, victim] = t.bots;
    await k.playNight({ t, page, me: 'JOKER', who: { DOCTOR: doctor }, picks: { JOKER: victim, DOCTOR: victim } });
    await k.toDay(t, 2);
    await k.expectResult(page, 'ASSASSINATE', ['이번 밤의 암살이 실패했습니다.']);
    await k.expectAlive(page, victim);
});

test('A05-E-054 6명 의사 사람이 광대 대상을 살려도 결과 창이 안 뜸 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 5, me: 'DOCTOR', botRoles: ['JOKER', 'CITIZEN'] });
    const [joker, victim] = t.bots;
    await k.playNight({ t, page, me: 'DOCTOR', who: { JOKER: joker }, picks: { JOKER: victim, DOCTOR: victim } });
    await k.toDay(t, 2);
    await k.expectNoNewResult(page, 2);
    // 살린 것은 맞음 (준비 확인): 아무도 안 죽음
    await k.expectDeadNames(page, []);
});

test('A05-E-055 10명 시민 사람: 봇들이 밤 행동을 다 해도 내 화면엔 결과 창이 안 뜸 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 9, me: 'CITIZEN', botRoles: ['JOKER', 'DOCTOR', 'GUARD', 'CITIZEN', 'CITIZEN'] });
    const [joker, doctor, guard, victim, other] = t.bots;
    await k.playNight({
        t, page, me: 'CITIZEN',
        who: { JOKER: joker, DOCTOR: doctor, GUARD: guard },
        picks: { JOKER: victim, DOCTOR: other, GUARD: joker },
    });
    await k.toDay(t, 2);
    await k.expectNoNewResult(page, 2);
    // 밤 행동이 실제로 적용됨 (준비 확인): 광대가 고른 사람이 죽음
    await k.expectDeadNames(page, [victim]);
});

test('A05-E-056 8명 경비원 사람: 결과 창의 확인을 누르면 창이 닫힘 @game', async ({ user, table }) => {
    const { page, target } = await guardInvestigates(table, user, { players: 8, targetRole: 'JOKER' });
    await k.expectRoleResult(page, 'INVESTIGATE', target, 'JOKER');
    await k.confirmResult(page);
    // 닫힌 뒤 다시 안 뜸: 지금까지 뜬 결과 창은 그 한 번
    await k.expectNoNewResult(page, 2, 1);
});

test('A05-E-057 5명 광대 사람 암살 성공 → 결과 창 없음 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 4, me: 'JOKER', botRoles: ['CITIZEN'] });
    const victim = t.bots[0];
    await k.playNight({ t, page, me: 'JOKER', picks: { JOKER: victim } });
    await k.toDay(t, 2);
    await k.expectNoNewResult(page, 2);
    await k.expectDeadNames(page, [victim]);
});

test('A05-E-163 8명 경비원 사람이 조사한 시민이 그 밤 암살돼도 결과 창이 뜸 @game', async ({ user, table }) => {
    const { t, page } = await k.open(table, user, { bots: 7, me: 'GUARD', botRoles: ['JOKER', 'CITIZEN'] });
    const [joker, victim] = t.bots;
    await k.playNight({ t, page, me: 'GUARD', who: { JOKER: joker }, picks: { JOKER: victim, GUARD: victim } });
    await k.toDay(t, 2);
    await k.expectRoleResult(page, 'INVESTIGATE', victim, 'CITIZEN');
    await k.expectDead(page, victim);
});

test('A05-E-176 10명 마녀사냥꾼 사람이 지난밤(둘째 밤) 암살된 사람을 셋째 밤에 확인 → 결과 창에 그 사람 직업 @game', async ({ user, table }) => {
    test.setTimeout(240_000);
    const { t, page } = await k.open(table, user, { bots: 9, me: 'WITCH_HUNTER', botRoles: ['JOKER', 'CITIZEN'] });
    const [joker, victim] = t.bots;
    // 둘째 밤: 광대 봇이 시민을 암살 (나는 안 고름)
    await k.playNight({ t, page, me: 'WITCH_HUNTER', night: 2, who: { JOKER: joker }, picks: { JOKER: victim } });
    await k.toDay(t, 3);
    await k.dayShown(page, 3);
    await k.expectDead(page, victim);
    // 셋째 밤: 그 사람을 확인
    await k.playNight({ t, page, me: 'WITCH_HUNTER', night: 3, picks: { WITCH_HUNTER: victim } });
    await k.toDay(t, 4);
    await k.expectRoleResult(page, 'CONFIRM', victim, 'CITIZEN');
});
