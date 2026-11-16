'use strict';

// 같은 직업 사람 2명이 한 밤에 고르는 시험(어려움): 광대·의사·경비원·마녀사냥꾼 사람 둘이 같은 대상이면 되고(사망·보호·결과 창), 갈리면 안 됨
// 목록 시험목록/A05a-밤-차례-능력.md A05-H-001~008 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a05-night-hard.spec.js
const { test } = require('../../helpers/fixtures');
const kit = require('../mobile/_a05a-kit');

const { night, uuidOf, nickOf } = kit;

// 같은 직업 사람 둘 + 봇으로 판 차리기 → { g, a, b } (a·b는 그 두 사람)
async function seatPair({ user, players, table }, { role, total, settings, botRoles = [] }) {
    const b = await players.add();
    const g = await kit.seat(table, { humans: [user, b], bots: total - 2, humanRoles: [role, role], botRoles, settings });
    return { g, a: user, b };
}

// 광대 사람 2명 (사람 2 + 봇 5 = 7명 광대2, 의사 봇은 아무도 안 지킴)
for (const c of [
    { no: 'A05-H-001', same: true, name: '같은 시민', outcome: '낮에 두 화면 모두 그 시민 사망', tag: ' @smoke' },
    { no: 'A05-H-002', same: false, name: '서로 다른 시민', outcome: '아무도 안 죽고 두 광대 화면에 결과 창 없음', tag: '' },
]) {
    test(`${c.no} 7명 광대 사람 2명이 ${c.name}을 고름: ${c.outcome} @game @hard${c.tag}`, async ({ user, players, table }) => {
        test.setTimeout(240_000);
        const { g, a, b } = await seatPair({ user, players, table }, { role: 'JOKER', total: 7, settings: { jokerCount: 2 } });
        const [first, second] = g.bots.CITIZEN;
        await kit.toNight(g.t, 1);
        await kit.playNight(g.t, {
            JOKER: async () => {
                await kit.pickNight(a.page, nickOf(first), 'JOKER');
                await kit.pickNight(b.page, nickOf(c.same ? first : second), 'JOKER');
            },
        });
        for (const h of [a, b]) {
            if (c.same) {
                await kit.expectDeadShown(h.page, nickOf(first));
            } else {
                await kit.expectDeadCount(h.page, 2, 0);
                await kit.expectNoResult(h.page, 2);
            }
        }
    });
}

// 의사 사람 2명 (사람 2 + 봇 6 = 8명 직접{광대1·의사2}), 광대 봇이 시민 하나를 노림
for (const c of [
    { no: 'A05-H-003', same: true, name: '둘 다 광대가 노린 시민을 보호', outcome: '그 시민이 삶' },
    { no: 'A05-H-004', same: false, name: '한 명만 그 시민을 보호(다른 한 명은 딴 사람)', outcome: '그 시민 사망' },
]) {
    test(`${c.no} 8명 의사 사람 2명이 ${c.name}: ${c.outcome} @game @hard`, async ({ user, players, table }) => {
        test.setTimeout(240_000);
        const { g, a, b } = await seatPair({ user, players, table }, {
            role: 'DOCTOR', total: 8, settings: night.custom({ JOKER: 1, DOCTOR: 2 }), botRoles: ['JOKER'],
        });
        const [joker] = g.bots.JOKER;
        const [target, other] = g.bots.CITIZEN;
        await kit.toNight(g.t, 1);
        await kit.playNight(g.t, {
            JOKER: () => kit.botPick(g.t, joker, uuidOf(target)),
            DOCTOR: async () => {
                await kit.pickNight(a.page, nickOf(target), 'DOCTOR');
                await kit.pickNight(b.page, nickOf(c.same ? target : other), 'DOCTOR');
            },
        });
        for (const h of [a, b]) {
            if (c.same) {
                await kit.expectDeadCount(h.page, 2, 0);
                await kit.expectCardStatus(h.page, nickOf(target), 'alive');
            } else {
                await kit.expectDeadShown(h.page, nickOf(target));
            }
        }
    });
}

// 경비원 사람 2명 (8명 직접{광대1·경비원2})
for (const c of [
    { no: 'A05-H-005', same: true, name: '둘 다 광대를 조사', outcome: '두 화면 모두 결과 창' },
    { no: 'A05-H-006', same: false, name: '한 명은 광대·한 명은 시민을 조사', outcome: '두 화면 모두 결과 창 없음' },
]) {
    test(`${c.no} 8명 경비원 사람 2명이 ${c.name}: ${c.outcome} @game @hard`, async ({ user, players, table }) => {
        test.setTimeout(240_000);
        const { g, a, b } = await seatPair({ user, players, table }, {
            role: 'GUARD', total: 8, settings: night.custom({ JOKER: 1, GUARD: 2 }), botRoles: ['JOKER'],
        });
        const [joker] = g.bots.JOKER;
        const [citizen] = g.bots.CITIZEN;
        await kit.toNight(g.t, 1);
        await kit.playNight(g.t, {
            GUARD: async () => {
                await kit.pickNight(a.page, nickOf(joker), 'GUARD');
                await kit.pickNight(b.page, nickOf(c.same ? joker : citizen), 'GUARD');
            },
        });
        for (const h of [a, b]) {
            if (c.same) {
                await kit.expectRoleResult(h.page, nickOf(joker), 'JOKER');
            } else {
                await kit.expectNoResult(h.page, 2);
            }
        }
    });
}

// 마녀사냥꾼 사람 2명 (10명 직접{광대1·마녀사냥꾼2}, 둘째 밤): 시민 X는 첫날 처형, 시민 Y는 첫 밤 암살
for (const c of [
    { no: 'A05-H-007', same: true, name: '둘 다 처형된 사람을 확인', outcome: '두 화면 모두 결과 창' },
    { no: 'A05-H-008', same: false, name: '한 명은 처형된 사람·한 명은 암살된 사람을 확인', outcome: '두 화면 모두 결과 창 없음' },
]) {
    test(`${c.no} 10명 마녀사냥꾼 사람 2명이 둘째 밤 ${c.name}: ${c.outcome} @game @hard`, async ({ user, players, table }) => {
        test.setTimeout(300_000);
        const { g, a, b } = await seatPair({ user, players, table }, {
            role: 'WITCH_HUNTER', total: 10, settings: night.custom({ JOKER: 1, WITCH_HUNTER: 2 }), botRoles: ['JOKER'],
        });
        const [joker] = g.bots.JOKER;
        const [executed, killed] = g.bots.CITIZEN;
        await kit.executeByBots(g.t, uuidOf(executed));
        // 첫 밤: 광대 봇이 시민 Y 암살 (마녀사냥꾼은 첫 밤 차례 없음) → 둘째 밤
        await kit.playNight(g.t, { JOKER: () => kit.botPick(g.t, joker, uuidOf(killed)) });
        await kit.toNight(g.t, 2);
        await kit.playNight(g.t, {
            WITCH_HUNTER: async () => {
                await kit.pickNight(a.page, nickOf(executed), 'WITCH_HUNTER');
                await kit.pickNight(b.page, nickOf(c.same ? executed : killed), 'WITCH_HUNTER');
            },
        });
        for (const h of [a, b]) {
            if (c.same) {
                await kit.expectRoleResult(h.page, nickOf(executed), 'CITIZEN');
            } else {
                await kit.expectNoResult(h.page, 3);
            }
        }
    });
}
