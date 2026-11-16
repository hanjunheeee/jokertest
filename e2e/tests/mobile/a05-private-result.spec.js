'use strict';

// 모바일 밤 개인 결과 창 시험: 경비원 조사·마녀사냥꾼 확인 결과 창에 닉네임·직업 이름, 광대 암살 실패 글, 확인 누르면 닫힘, 시민은 창 없음
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-121~133 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/mobile/a05-private-result.spec.js
const { test, expect } = require('../../helpers/fixtures');
const kit = require('./_a05a-kit');

const { night, ROLE_NAMES, uuidOf, nickOf } = kit;

// 경비원 사람이 조사한 봇의 직업 5가지 (E-121·122는 사파리에서도)
// 동료 경비원은 광대 봇이 그 동료를 노리는 밤에 조사: 죽을 동료의 선택은 셈에서 빠져 내 조사만 남음 (결정 "광대에게 지목된 사람의 그 밤 능력")
const GUARD_CASES = [
    { no: 'A05-E-121', target: 'JOKER', total: 8, settings: {}, tag: ' @safari @smoke' },
    { no: 'A05-E-122', target: 'CITIZEN', total: 8, settings: {}, tag: ' @safari' },
    { no: 'A05-E-123', target: 'DOCTOR', total: 8, settings: {}, tag: '' },
    { no: 'A05-E-124', target: 'GUARD', total: 8, settings: night.custom({ JOKER: 1, GUARD: 2 }), tag: '' },
    { no: 'A05-E-125', target: 'WITCH_HUNTER', total: 10, settings: {}, tag: '' },
];

for (const c of GUARD_CASES) {
    test(`${c.no} 모바일 ${c.total}명 경비원 사람이 ${ROLE_NAMES[c.target]} 봇 조사: 결과 창에 닉네임과 "${ROLE_NAMES[c.target]}" 보임 @game${c.tag}`, async ({ user, table }) => {
        const botRoles = c.target === 'CITIZEN' ? ['JOKER'] : ['JOKER', c.target];
        const g = await kit.seat(table, { humans: [user], bots: c.total - 1, humanRoles: ['GUARD'], botRoles, settings: c.settings });
        const page = user.page;
        const [joker] = g.bots.JOKER;
        const [target] = g.bots[c.target];
        const [bystander] = g.bots.CITIZEN.filter((bot) => bot !== target);
        await kit.toNight(g.t, 1);
        await kit.playNight(g.t, {
            ...(c.target === 'GUARD' ? { JOKER: () => kit.botPick(g.t, joker, uuidOf(target)) } : {}),
            GUARD: async () => {
                // 찍힌 동료 경비원 봇은 다른 사람(시민)을 고름 → 갈려도 그 선택은 안 셈
                if (c.target === 'GUARD') await kit.botPick(g.t, target, uuidOf(bystander));
                await kit.pickNight(page, nickOf(target), 'GUARD');
            },
        });
        await kit.expectRoleResult(page, nickOf(target), c.target);
    });
}

// 마녀사냥꾼 사람이 둘째 밤에 확인한 죽은 봇의 직업 5가지 (그 봇을 첫날 봇 표로 처형)
// 광대는 2명 판(하나 처형돼도 판이 이어짐), 마녀사냥꾼은 2명 판의 동료
const HUNTER_CASES = [
    { no: 'A05-E-126', dead: 'JOKER', settings: { jokerCount: 2 } },
    { no: 'A05-E-127', dead: 'CITIZEN', settings: {} },
    { no: 'A05-E-128', dead: 'DOCTOR', settings: {} },
    { no: 'A05-E-129', dead: 'GUARD', settings: {} },
    { no: 'A05-E-130', dead: 'WITCH_HUNTER', settings: night.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 2 }) },
];

for (const c of HUNTER_CASES) {
    test(`${c.no} 모바일 10명 마녀사냥꾼 사람이 둘째 밤 처형된 ${ROLE_NAMES[c.dead]} 확인: 결과 창에 닉네임과 "${ROLE_NAMES[c.dead]}" 보임 @game`, async ({ user, table }) => {
        const botRoles = c.dead === 'CITIZEN' ? ['JOKER'] : ['JOKER', c.dead];
        const g = await kit.seat(table, { humans: [user], bots: 9, humanRoles: ['WITCH_HUNTER'], botRoles, settings: c.settings });
        const page = user.page;
        const [victim] = g.bots[c.dead];
        await kit.executeByBots(g.t, uuidOf(victim));
        await kit.toNight(g.t, 2);
        await kit.playNight(g.t, { WITCH_HUNTER: () => kit.pickNight(page, nickOf(victim), 'WITCH_HUNTER') });
        await kit.expectRoleResult(page, nickOf(victim), c.dead);
    });
}

test('A05-E-131 모바일 6명 광대 사람: 의사 봇이 같은 사람을 지키면 "이번 밤의 암살이 실패했습니다." 보임 @game @safari', async ({ user, table }) => {
    const g = await kit.seat(table, { humans: [user], bots: 5, humanRoles: ['JOKER'], botRoles: ['DOCTOR'] });
    const [doctor] = g.bots.DOCTOR;
    const [target] = g.bots.CITIZEN;
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, {
        JOKER: () => kit.pickNight(user.page, nickOf(target), 'JOKER'),
        DOCTOR: () => kit.botPick(g.t, doctor, uuidOf(target)),
    });
    await kit.expectResult(user.page, [kit.ASSASSIN_FAILED_TEXT]);
});

test('A05-E-132 모바일 8명 경비원 사람: 결과 창에서 확인을 누르면 창이 닫힘 @game', async ({ user, table }) => {
    const g = await kit.seat(table, { humans: [user], bots: 7, humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    const page = user.page;
    const [target] = g.bots.CITIZEN;
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, { GUARD: () => kit.pickNight(page, nickOf(target), 'GUARD') });
    const dialog = await kit.expectRoleResult(page, nickOf(target), 'CITIZEN');
    await dialog.getByRole('button', { name: '확인', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    // 닫은 뒤 다시 안 뜸 (화면 기록엔 한 번만)
    expect((await night.readUi(page)).privateResults).toHaveLength(1);
});

test('A05-E-133 모바일 10명 시민 사람: 봇들이 암살·보호·조사를 한 밤이 끝나도 결과 창 없음 @game', async ({ user, table }) => {
    const g = await kit.seat(table, { humans: [user], bots: 9, humanRoles: ['CITIZEN'], botRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
    const page = user.page;
    const [joker] = g.bots.JOKER;
    const [doctor] = g.bots.DOCTOR;
    const [guard] = g.bots.GUARD;
    const [victim, saved] = g.bots.CITIZEN;
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, {
        JOKER: () => kit.botPick(g.t, joker, uuidOf(victim)),
        DOCTOR: () => kit.botPick(g.t, doctor, uuidOf(saved)),
        GUARD: () => kit.botPick(g.t, guard, uuidOf(joker)),
    });
    await kit.expectNoResult(page, 2);
    // 봇들이 정말 행동한 밤: 광대가 고른 시민 카드는 사망
    await kit.expectCardStatus(page, nickOf(victim), 'dead');
});
