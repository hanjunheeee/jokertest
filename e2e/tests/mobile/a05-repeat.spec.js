'use strict';

// 모바일 연달아 고르기 시험: 의사가 둘째 밤에도 자기를 지킴, 경비원이 같은 사람을 두 밤 조사, 광대가 어젯밤 살아난 사람을 다시 노림
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-145~147 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/mobile/a05-repeat.spec.js
const { test, expect } = require('../../helpers/fixtures');
const kit = require('./_a05a-kit');

const { night, uuidOf, nickOf } = kit;

test('A05-E-145 모바일 7명 의사 사람이 둘째 밤에도 자기를 보호: 받아지고, 광대 봇이 의사를 노려도 삶 @game @smoke', async ({ user, table }) => {
    const g = await kit.seat(table, { humans: [user], bots: 6, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    const page = user.page;
    const [joker] = g.bots.JOKER;
    // 첫 밤: 내 카드 보호 (광대 봇은 건너뜀)
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, { DOCTOR: () => kit.pickNight(page, nickOf(user), 'DOCTOR') });
    await kit.expectDeadCount(page, 2, 0);
    // 둘째 밤: 광대 봇이 나를 노림 → 또 내 카드 보호 (받아졌는지는 playNight가 서버 알림으로 봄)
    await kit.toNight(g.t, 2);
    await kit.playNight(g.t, {
        JOKER: () => kit.botPick(g.t, joker, uuidOf(user)),
        DOCTOR: () => kit.pickNight(page, nickOf(user), 'DOCTOR'),
    });
    await kit.expectDeadCount(page, 3, 0);
    await kit.expectCardStatus(page, nickOf(user), 'alive');
});

test('A05-E-146 모바일 8명 경비원 사람이 두 밤 연달아 같은 사람을 조사: 둘째 밤에도 결과 창이 다시 뜸 @game', async ({ user, table }) => {
    const g = await kit.seat(table, { humans: [user], bots: 7, humanRoles: ['GUARD'], botRoles: ['JOKER'] });
    const page = user.page;
    const [target] = g.bots.CITIZEN;
    for (const dayIndex of [1, 2]) {
        await kit.toNight(g.t, dayIndex);
        await kit.playNight(g.t, { GUARD: () => kit.pickNight(page, nickOf(target), 'GUARD') });
        await kit.expectRoleResult(page, nickOf(target), 'CITIZEN');
        // 밤마다 결과 창이 새로 한 번씩 뜸
        expect((await night.readUi(page)).privateResults).toHaveLength(dayIndex);
        await kit.closeResult(page);
    }
});

test('A05-E-147 모바일 7명 광대 사람이 어젯밤 의사가 살린 사람을 둘째 밤 다시 노림(의사 봇은 딴 사람): 이번엔 죽음 @game', async ({ user, table }) => {
    const g = await kit.seat(table, { humans: [user], bots: 6, humanRoles: ['JOKER'], botRoles: ['DOCTOR'] });
    const page = user.page;
    const [doctor] = g.bots.DOCTOR;
    const [target, other] = g.bots.CITIZEN;
    // 첫 밤: 의사 봇이 같은 사람을 지켜 살아남 → 광대 화면엔 암살 실패 글
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, {
        JOKER: () => kit.pickNight(page, nickOf(target), 'JOKER'),
        DOCTOR: () => kit.botPick(g.t, doctor, uuidOf(target)),
    });
    await kit.expectResult(page, [kit.ASSASSIN_FAILED_TEXT]);
    await kit.closeResult(page);
    await kit.expectCardStatus(page, nickOf(target), 'alive');
    // 둘째 밤: 같은 사람을 다시 암살 (막는 표시 없이 받아짐), 의사 봇은 딴 사람
    await kit.toNight(g.t, 2);
    await kit.playNight(g.t, {
        JOKER: () => kit.pickNight(page, nickOf(target), 'JOKER'),
        DOCTOR: () => kit.botPick(g.t, doctor, uuidOf(other)),
    });
    await kit.expectDeadShown(page, nickOf(target));
});
