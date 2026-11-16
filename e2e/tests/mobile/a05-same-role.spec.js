'use strict';

// 모바일 같은 직업 2명 시험: 사람 하나 + 같은 직업 봇 하나가 같은 대상을 고르면 되고(죽음·결과 창), 갈리면 안 됨(아무도 안 죽음·결과 없음)
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-141~144 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/mobile/a05-same-role.spec.js
const { test } = require('../../helpers/fixtures');
const kit = require('./_a05a-kit');

const { night, uuidOf, nickOf } = kit;

// 광대 사람 + 광대 봇 (7명 광대2: 의사 봇은 아무도 안 지킴)
for (const c of [
    { no: 'A05-E-141', same: true, name: '같은 시민', outcome: '낮에 그 시민 사망', tag: ' @smoke' },
    { no: 'A05-E-142', same: false, name: '서로 다른 시민', outcome: '아무도 안 죽음', tag: '' },
]) {
    test(`${c.no} 모바일 7명 광대2 광대 사람과 광대 봇이 ${c.name}을 고름: ${c.outcome} @game${c.tag}`, async ({ user, table }) => {
        const g = await kit.seat(table, { humans: [user], bots: 6, humanRoles: ['JOKER'], botRoles: ['JOKER', 'DOCTOR'], settings: { jokerCount: 2 } });
        const page = user.page;
        const [ally] = g.bots.JOKER;
        const [mine, other] = g.bots.CITIZEN;
        await kit.toNight(g.t, 1);
        await kit.playNight(g.t, {
            JOKER: async () => {
                await kit.botPick(g.t, ally, uuidOf(c.same ? mine : other));
                await kit.pickNight(page, nickOf(mine), 'JOKER');
            },
        });
        if (c.same) {
            await kit.expectDeadShown(page, nickOf(mine));
        } else {
            await kit.expectDeadCount(page, 2, 0);
        }
    });
}

// 경비원 사람 + 경비원 봇 (8명 직접{광대1·경비원2})
for (const c of [
    { no: 'A05-E-143', same: true, name: '둘 다 광대를 조사', outcome: '결과 창 뜸' },
    { no: 'A05-E-144', same: false, name: '사람은 광대·봇은 시민을 조사', outcome: '결과 창 없음' },
]) {
    test(`${c.no} 모바일 8명 직접{광대1·경비원2} 경비원 사람과 경비원 봇이 ${c.name}: ${c.outcome} @game`, async ({ user, table }) => {
        const g = await kit.seat(table, {
            humans: [user], bots: 7, humanRoles: ['GUARD'], botRoles: ['JOKER', 'GUARD'], settings: night.custom({ JOKER: 1, GUARD: 2 }),
        });
        const page = user.page;
        const [joker] = g.bots.JOKER;
        const [ally] = g.bots.GUARD;
        const [citizen] = g.bots.CITIZEN;
        await kit.toNight(g.t, 1);
        await kit.playNight(g.t, {
            GUARD: async () => {
                await kit.botPick(g.t, ally, uuidOf(c.same ? joker : citizen));
                await kit.pickNight(page, nickOf(joker), 'GUARD');
            },
        });
        if (c.same) {
            await kit.expectRoleResult(page, nickOf(joker), 'JOKER');
        } else {
            await kit.expectNoResult(page, 2);
        }
    });
}
