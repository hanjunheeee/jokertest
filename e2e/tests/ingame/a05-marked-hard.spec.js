'use strict';

// "광대에게 찍힌 사람의 그 밤 능력" 시험(어려움): 사람 여럿이 한 밤에 얽힘 — 찍힌 경비원이 살아나면 결과·못 살아나면 없음, 찍힌 의사의 선택은 적용, 찍혀 죽을 경비원의 선택은 셈에서 빠짐
// 목록 시험목록/A05a-밤-차례-능력.md A05-H-009~012·020~023 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a05-marked-hard.spec.js
const { test } = require('../../helpers/fixtures');
const kit = require('../mobile/_a05a-kit');

const { night, uuidOf, nickOf } = kit;

// 광대·의사·경비원 사람 3명 (8명 자동 구성, 봇 5명은 시민): 광대가 경비원을 노리고 경비원은 광대를 조사
for (const c of [
    { no: 'A05-H-009', saved: true, name: '의사도 경비원을 보호', outcome: '경비원 화면에 결과 창, 낮에 경비원 삶', tag: ' @smoke' },
    { no: 'A05-H-010', saved: false, name: '의사는 딴 사람을 보호', outcome: '경비원 화면에 결과 창 없음, 경비원 사망', tag: '' },
]) {
    test(`${c.no} 8명 광대·의사·경비원 사람 3명, 광대→경비원·${c.name}: ${c.outcome} @game @hard${c.tag}`, async ({ user, players, table }) => {
        test.setTimeout(300_000);
        const joker = user;
        const doctor = await players.add();
        const guard = await players.add();
        const g = await kit.seat(table, { humans: [joker, doctor, guard], bots: 5, humanRoles: ['JOKER', 'DOCTOR', 'GUARD'] });
        const [citizen] = g.bots.CITIZEN;
        await kit.toNight(g.t, 1);
        await kit.playNight(g.t, {
            JOKER: () => kit.pickNight(joker.page, nickOf(guard), 'JOKER'),
            DOCTOR: () => kit.pickNight(doctor.page, nickOf(c.saved ? guard : citizen), 'DOCTOR'),
            GUARD: () => kit.pickNight(guard.page, nickOf(joker), 'GUARD'),
        });
        if (c.saved) {
            await kit.expectRoleResult(guard.page, nickOf(joker), 'JOKER');
            for (const h of [joker, doctor, guard]) await kit.expectDeadCount(h.page, 2, 0);
        } else {
            await kit.expectNoResult(guard.page, 2);
            await kit.expectDeadShown(guard.page, nickOf(guard));
            for (const h of [joker, doctor]) await kit.expectCardStatus(h.page, nickOf(guard), 'dead');
        }
    });
}

// 광대 사람이 의사 사람을 노림 (6명 자동 구성: 사람 2 + 시민 봇 4)
for (const c of [
    { no: 'A05-H-011', self: true, name: '의사가 자기를 보호', outcome: '의사 삶, 광대 화면에 암살 실패 글' },
    { no: 'A05-H-012', self: false, name: '의사가 딴 사람을 보호', outcome: '의사 사망, 광대 화면에 결과 창 없음' },
]) {
    test(`${c.no} 6명 광대 사람→의사 사람, ${c.name}: ${c.outcome} @game @hard`, async ({ user, players, table }) => {
        test.setTimeout(240_000);
        const joker = user;
        const doctor = await players.add();
        const g = await kit.seat(table, { humans: [joker, doctor], bots: 4, humanRoles: ['JOKER', 'DOCTOR'] });
        const [citizen] = g.bots.CITIZEN;
        await kit.toNight(g.t, 1);
        await kit.playNight(g.t, {
            JOKER: () => kit.pickNight(joker.page, nickOf(doctor), 'JOKER'),
            DOCTOR: () => kit.pickNight(doctor.page, nickOf(c.self ? doctor : citizen), 'DOCTOR'),
        });
        if (c.self) {
            await kit.expectResult(joker.page, [kit.ASSASSIN_FAILED_TEXT]);
            await kit.expectDeadCount(doctor.page, 2, 0);
            await kit.expectCardStatus(doctor.page, nickOf(doctor), 'alive');
        } else {
            await kit.expectNoResult(joker.page, 2);
            await kit.expectDeadShown(doctor.page, nickOf(doctor));
            await kit.expectCardStatus(joker.page, nickOf(doctor), 'dead');
        }
    });
}

// 경비원 사람 2명 중 A가 찍힘·의사 없음 (8명 직접{광대1·경비원2}): 죽을 A의 선택은 셈에서 빠지고 결과도 못 받음
for (const c of [
    { no: 'A05-H-020', same: true, name: '둘 다 광대를 조사', outcome: 'B 화면만 결과 창, A 사망' },
    { no: 'A05-H-021', same: false, name: 'A는 시민·B는 광대를 조사', outcome: '갈려도 B 화면에 결과 창(A 선택은 안 셈)' },
]) {
    test(`${c.no} 8명 경비원 사람 2명 중 A가 찍힘, ${c.name}: ${c.outcome} @game @hard`, async ({ user, players, table }) => {
        test.setTimeout(240_000);
        const a = user;
        const b = await players.add();
        const g = await kit.seat(table, {
            humans: [a, b], bots: 6, humanRoles: ['GUARD', 'GUARD'], botRoles: ['JOKER'], settings: night.custom({ JOKER: 1, GUARD: 2 }),
        });
        const [joker] = g.bots.JOKER;
        const [citizen] = g.bots.CITIZEN;
        await kit.toNight(g.t, 1);
        await kit.playNight(g.t, {
            JOKER: () => kit.botPick(g.t, joker, uuidOf(a)),
            GUARD: async () => {
                await kit.pickNight(a.page, nickOf(c.same ? joker : citizen), 'GUARD');
                await kit.pickNight(b.page, nickOf(joker), 'GUARD');
            },
        });
        await kit.expectRoleResult(b.page, nickOf(joker), 'JOKER');
        await kit.expectNoResult(a.page, 2);
        await kit.expectDeadShown(a.page, nickOf(a));
    });
}

test('A05-H-022 6명 직접{광대1·의사1·경비원1} 찍힌 경비원 사람을 의사 사람이 살림: 경비원 화면에 결과 창, 의사 화면엔 결과 창 없음 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const guard = user;
    const doctor = await players.add();
    const g = await kit.seat(table, {
        humans: [guard, doctor], bots: 4, humanRoles: ['GUARD', 'DOCTOR'], botRoles: ['JOKER'], settings: night.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }),
    });
    const [joker] = g.bots.JOKER;
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, {
        JOKER: () => kit.botPick(g.t, joker, uuidOf(guard)),
        DOCTOR: () => kit.pickNight(doctor.page, nickOf(guard), 'DOCTOR'),
        GUARD: () => kit.pickNight(guard.page, nickOf(joker), 'GUARD'),
    });
    await kit.expectRoleResult(guard.page, nickOf(joker), 'JOKER');
    // 살린 의사에겐 개인 결과가 없음 (모두가 보는 "의사가 살렸다" 글만)
    await kit.expectNoResult(doctor.page, 2);
    await kit.expectDeadCount(doctor.page, 2, 0);
});

test('A05-H-023 8명 직접{광대1·의사2} 의사 사람 2명 중 A가 찍힘, 둘 다 A를 보호: A 삶 @game @hard', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const a = user;
    const b = await players.add();
    const g = await kit.seat(table, {
        humans: [a, b], bots: 6, humanRoles: ['DOCTOR', 'DOCTOR'], botRoles: ['JOKER'], settings: night.custom({ JOKER: 1, DOCTOR: 2 }),
    });
    const [joker] = g.bots.JOKER;
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, {
        JOKER: () => kit.botPick(g.t, joker, uuidOf(a)),
        DOCTOR: async () => {
            // 찍힌 A는 자기 카드, B는 A 카드
            await kit.pickNight(a.page, nickOf(a), 'DOCTOR');
            await kit.pickNight(b.page, nickOf(a), 'DOCTOR');
        },
    });
    for (const h of [a, b]) {
        await kit.expectDeadCount(h.page, 2, 0);
        await kit.expectCardStatus(h.page, nickOf(a), 'alive');
    }
});
