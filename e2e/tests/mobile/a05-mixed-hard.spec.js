'use strict';

// PC·모바일 섞인 판 밤 시험(어려움): PC 광대 사람과 모바일 경비원 사람이 한 밤에 각자 고르고 각자 화면에서 결과를 봄
// 목록 시험목록/A05a-밤-차례-능력.md A05-H-026 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/mobile/a05-mixed-hard.spec.js
const { test } = require('../../helpers/fixtures');
const kit = require('./_a05a-kit');

const { nickOf } = kit;

test('A05-H-026 8명 PC 광대 사람 + 모바일 경비원 사람: 광대 화면은 결과 창 없음(암살 성공), 경비원 화면은 결과 창 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    // 이 파일은 모바일 프로젝트에서 돎 → user는 폰 화면, PC 사람은 따로 엶
    const pc = await players.add({ mobile: false });
    const phone = user;
    const g = await kit.seat(table, { humans: [pc, phone], bots: 6, humanRoles: ['JOKER', 'GUARD'], botRoles: ['DOCTOR'] });
    const [victim] = g.bots.CITIZEN;
    await kit.toNight(g.t, 1);
    // 광대(PC)는 시민을 암살, 의사 봇은 건너뜀, 경비원(폰)은 광대 사람을 조사
    await kit.playNight(g.t, {
        JOKER: () => kit.pickNight(pc.page, nickOf(victim), 'JOKER'),
        GUARD: () => kit.pickNight(phone.page, nickOf(pc), 'GUARD'),
    });
    // 경비원(폰): 결과 창에 광대 사람 닉네임과 "광대"
    await kit.expectRoleResult(phone.page, nickOf(pc), 'JOKER');
    await kit.closeResult(phone.page);
    // 광대(PC): 성공한 암살은 개인 결과가 없음, 두 화면 다 그 시민 카드가 사망
    await kit.expectNoResult(pc.page, 2);
    await kit.expectDeadShown(pc.page, nickOf(victim));
    await kit.expectDeadShown(phone.page, nickOf(victim));
});
