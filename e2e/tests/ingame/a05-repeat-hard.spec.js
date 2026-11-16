'use strict';

// 연달아 고르기 시험(어려움, 여러 날): 의사가 세 밤 자기 보호, 경비원이 두 밤 같은 사람 조사, 광대가 어젯밤 살아난 사람을 다시 노림, 세 밤 결과 창이 그 밤 것만
// 목록 시험목록/A05a-밤-차례-능력.md A05-H-014·015·028·029 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a05-repeat-hard.spec.js
const { test, expect } = require('../../helpers/fixtures');
const kit = require('../mobile/_a05a-kit');

const { night, uuidOf, nickOf } = kit;

test('A05-H-014 7명 의사 사람이 세 밤 연달아 자기를 보호: 매 밤 받아지고, 셋째 밤 광대 봇이 의사를 노려도 삶 @game @hard @smoke', async ({ user, table }) => {
    test.setTimeout(300_000);
    const g = await kit.seat(table, { humans: [user], bots: 6, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    const page = user.page;
    const [joker] = g.bots.JOKER;
    for (const dayIndex of [1, 2, 3]) {
        await kit.toNight(g.t, dayIndex);
        await kit.playNight(g.t, {
            // 광대 봇은 첫 밤·둘째 밤엔 안 고르고 셋째 밤에 의사를 노림
            ...(dayIndex === 3 ? { JOKER: () => kit.botPick(g.t, joker, uuidOf(user)) } : {}),
            // 매 밤 내 카드에 보호가 다시 켜져 있고 받아짐 (받아졌는지는 playNight가 서버 알림으로 봄)
            DOCTOR: () => kit.pickNight(page, nickOf(user), 'DOCTOR'),
        });
        await kit.expectDeadCount(page, dayIndex + 1, 0);
    }
    await kit.expectCardStatus(page, nickOf(user), 'alive');
});

test('A05-H-015 8명 경비원 사람이 두 밤 연달아 같은 사람을 조사: 두 밤 다 결과 창 @game @hard', async ({ user, table }) => {
    test.setTimeout(240_000);
    const g = await kit.seat(table, { humans: [user], bots: 7, humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    const page = user.page;
    const [target] = g.bots.CITIZEN;
    for (const dayIndex of [1, 2]) {
        await kit.toNight(g.t, dayIndex);
        await kit.playNight(g.t, { GUARD: () => kit.pickNight(page, nickOf(target), 'GUARD') });
        await kit.expectRoleResult(page, nickOf(target), 'CITIZEN');
        expect((await night.readUi(page)).privateResults).toHaveLength(dayIndex);
        await kit.closeResult(page);
    }
});

test('A05-H-028 7명 광대·의사 사람 2명: 첫 밤 의사가 살린 사람을 둘째 밤 광대가 다시 노리고 의사는 딴 사람 → 사망 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(300_000);
    const joker = user;
    const doctor = await players.add();
    const g = await kit.seat(table, { humans: [joker, doctor], bots: 5, humanRoles: ['JOKER', 'DOCTOR'] });
    const [target, other] = g.bots.CITIZEN;
    // 첫 밤: 광대와 의사가 같은 사람 → 살아남, 광대 화면엔 암살 실패 글
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, {
        JOKER: () => kit.pickNight(joker.page, nickOf(target), 'JOKER'),
        DOCTOR: () => kit.pickNight(doctor.page, nickOf(target), 'DOCTOR'),
    });
    await kit.expectResult(joker.page, [kit.ASSASSIN_FAILED_TEXT]);
    await kit.closeResult(joker.page);
    for (const h of [joker, doctor]) await kit.expectDeadCount(h.page, 2, 0);
    // 둘째 밤: 광대는 같은 사람을 다시, 의사는 딴 사람 → 이번엔 죽음
    await kit.toNight(g.t, 2);
    await kit.playNight(g.t, {
        JOKER: () => kit.pickNight(joker.page, nickOf(target), 'JOKER'),
        DOCTOR: () => kit.pickNight(doctor.page, nickOf(other), 'DOCTOR'),
    });
    for (const h of [joker, doctor]) await kit.expectDeadShown(h.page, nickOf(target));
});

test('A05-H-029 10명 경비원 사람이 셋째 밤까지 매 밤 다른 사람을 조사: 결과 창은 그 밤 것만, 지난 결과 창은 다시 안 뜸 @game @hard', async ({ user, table }) => {
    test.setTimeout(300_000);
    const g = await kit.seat(table, { humans: [user], bots: 9, humanRoles: ['GUARD'], botRoles: ['JOKER', 'DOCTOR'] });
    const page = user.page;
    // 밤마다 조사할 사람: 시민 → 광대 → 의사
    const picks = [
        { bot: g.bots.CITIZEN[0], role: 'CITIZEN' },
        { bot: g.bots.JOKER[0], role: 'JOKER' },
        { bot: g.bots.DOCTOR[0], role: 'DOCTOR' },
    ];
    for (const [i, { bot, role }] of picks.entries()) {
        await kit.toNight(g.t, i + 1);
        await kit.playNight(g.t, { GUARD: () => kit.pickNight(page, nickOf(bot), 'GUARD') });
        const dialog = await kit.expectRoleResult(page, nickOf(bot), role);
        // 그 밤 결과만: 앞선 밤에 조사한 사람 닉네임은 창에 없음
        for (const earlier of picks.slice(0, i)) await expect(dialog).not.toContainText(nickOf(earlier.bot));
        // 결과 창은 밤마다 딱 한 번씩 새로 뜸 (닫은 지난 창이 낮·다음 밤 사이에 다시 뜨면 수가 늘어남)
        expect((await night.readUi(page)).privateResults).toHaveLength(i + 1);
        await kit.closeResult(page);
    }
    await expect(kit.resultDialog(page)).toHaveCount(0);
});
