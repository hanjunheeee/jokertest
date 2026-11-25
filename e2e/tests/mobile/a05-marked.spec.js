'use strict';

// 모바일 "광대에게 찍힌 사람의 그 밤 능력" 시험: 찍힌 경비원·마녀사냥꾼은 못 살아나면 결과 없음·살아나면 결과, 찍힌 의사의 선택은 적용, 의사는 밤 중에 찍힌 줄 모름
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-134~140 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/mobile/a05-marked.spec.js
const { test, expect } = require('../../helpers/fixtures');
const kit = require('./_a05a-kit');

const { night, uuidOf, nickOf } = kit;

test('A05-E-134 모바일 5명 직접{광대1·경비원1} 찍힌 경비원 사람, 의사 없음: 결과 창 안 뜨고 낮에 내 카드 사망 @game @smoke', async ({ user, table }) => {
    const g = await kit.seat(table, { humans: [user], bots: 4, humanRoles: ['GUARD'], botRoles: ['JOKER'], settings: night.custom({ JOKER: 1, GUARD: 1 }) });
    const page = user.page;
    const [joker] = g.bots.JOKER;
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, {
        JOKER: () => kit.botPick(g.t, joker, uuidOf(user)),
        GUARD: () => kit.pickNight(page, nickOf(joker), 'GUARD'),
    });
    await kit.expectNoResult(page, 2);
    await kit.expectDeadShown(page, nickOf(user));
});

test('A05-E-135 모바일 6명 직접{광대1·의사1·경비원1} 찍힌 경비원 사람을 의사 봇이 살림: 결과 창 뜨고 낮에 살아 있음 @game', async ({ user, table }) => {
    const g = await kit.seat(table, {
        humans: [user], bots: 5, humanRoles: ['GUARD'], botRoles: ['JOKER', 'DOCTOR'], settings: night.custom({ JOKER: 1, DOCTOR: 1, GUARD: 1 }),
    });
    const page = user.page;
    const [joker] = g.bots.JOKER;
    const [doctor] = g.bots.DOCTOR;
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, {
        JOKER: () => kit.botPick(g.t, joker, uuidOf(user)),
        DOCTOR: () => kit.botPick(g.t, doctor, uuidOf(user)),
        GUARD: () => kit.pickNight(page, nickOf(joker), 'GUARD'),
    });
    await kit.expectRoleResult(page, nickOf(joker), 'JOKER');
    await kit.closeResult(page);
    await kit.expectDeadCount(page, 2, 0);
    await kit.expectCardStatus(page, nickOf(user), 'alive');
});

test('A05-E-136 모바일 6명 직접{광대1·마녀사냥꾼1} 둘째 밤 찍힌 마녀사냥꾼 사람, 의사 없음: 결과 창 안 뜨고 낮에 내 카드 사망 @game', async ({ user, table }) => {
    const g = await kit.seat(table, {
        humans: [user], bots: 5, humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER'], settings: night.custom({ JOKER: 1, WITCH_HUNTER: 1 }),
    });
    const page = user.page;
    const [joker] = g.bots.JOKER;
    const [executed] = g.bots.CITIZEN;
    // 확인할 죽은 사람: 시민 봇 하나를 첫날 처형 → 둘째 밤
    await kit.executeByBots(g.t, uuidOf(executed));
    await kit.toNight(g.t, 2);
    await kit.playNight(g.t, {
        JOKER: () => kit.botPick(g.t, joker, uuidOf(user)),
        WITCH_HUNTER: () => kit.pickNight(page, nickOf(executed), 'WITCH_HUNTER'),
    });
    await kit.expectNoResult(page, 3);
    await kit.expectDeadShown(page, nickOf(user));
});

test('A05-E-137 모바일 7명 직접{광대1·의사1·마녀사냥꾼1} 둘째 밤 찍힌 마녀사냥꾼 사람을 의사 봇이 살림: 결과 창 뜸 @game', async ({ user, table }) => {
    const g = await kit.seat(table, {
        humans: [user], bots: 6, humanRoles: ['WITCH_HUNTER'], botRoles: ['JOKER', 'DOCTOR'], settings: night.custom({ JOKER: 1, DOCTOR: 1, WITCH_HUNTER: 1 }),
    });
    const page = user.page;
    const [joker] = g.bots.JOKER;
    const [doctor] = g.bots.DOCTOR;
    const [executed] = g.bots.CITIZEN;
    await kit.executeByBots(g.t, uuidOf(executed));
    await kit.toNight(g.t, 2);
    await kit.playNight(g.t, {
        JOKER: () => kit.botPick(g.t, joker, uuidOf(user)),
        DOCTOR: () => kit.botPick(g.t, doctor, uuidOf(user)),
        WITCH_HUNTER: () => kit.pickNight(page, nickOf(executed), 'WITCH_HUNTER'),
    });
    await kit.expectRoleResult(page, nickOf(executed), 'CITIZEN');
    await kit.expectCardStatus(page, nickOf(user), 'alive');
});

// 찍힌 의사 사람: 자기를 지키면 삶, 딴 사람을 지키면 죽음 (6명 자동 구성: 광대 1·의사 1)
for (const c of [
    { no: 'A05-E-138', pick: 'self', name: '자기를 보호', outcome: '낮에 살아 있음' },
    { no: 'A05-E-139', pick: 'other', name: '딴 사람을 보호', outcome: '낮에 내 카드 사망' },
]) {
    test(`${c.no} 모바일 6명 찍힌 의사 사람이 ${c.name}: ${c.outcome} @game`, async ({ user, table }) => {
        const g = await kit.seat(table, { humans: [user], bots: 5, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
        const page = user.page;
        const [joker] = g.bots.JOKER;
        const [other] = g.bots.CITIZEN;
        await kit.toNight(g.t, 1);
        await kit.playNight(g.t, {
            JOKER: () => kit.botPick(g.t, joker, uuidOf(user)),
            DOCTOR: () => kit.pickNight(page, c.pick === 'self' ? nickOf(user) : nickOf(other), 'DOCTOR'),
        });
        if (c.pick === 'self') {
            await kit.expectDeadCount(page, 2, 0);
            await kit.expectCardStatus(page, nickOf(user), 'alive');
        } else {
            await kit.expectDeadShown(page, nickOf(user));
        }
    });
}

test('A05-E-140 모바일 6명 광대 봇이 의사 사람을 노린 밤: 의사 차례 화면에 암살 영상·찍혔다는 글·결과 창 없음 @game', async ({ user, table }) => {
    const g = await kit.seat(table, { humans: [user], bots: 5, humanRoles: ['DOCTOR'], botRoles: ['JOKER'] });
    const page = user.page;
    const [joker] = g.bots.JOKER;
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, {
        JOKER: () => kit.botPick(g.t, joker, uuidOf(user)),
        // 의사 사람은 보기만 하고 안 고름
        DOCTOR: kit.watch(async () => {
            // 내 차례가 켜진 뒤(광대는 이미 나를 골랐음)에도 찍힌 흔적이 화면에 없음 → 모르는 채 고르게 됨
            await kit.expectMyTurn(page);
            await expect(page.locator('[data-ingame-night-success-kill], [data-ingame-dawn-report], [data-ingame-dawn-report-message]')).toHaveCount(0);
            await expect(kit.resultDialog(page)).toHaveCount(0);
            await expect(page.getByRole('dialog').filter({ hasText: /암살|살해|지목|공격/ })).toHaveCount(0);
            // 세로 카톡형엔 카드 판이 없음 → 직업 행동 목록의 내 줄에 "사망" 표시 없음
            await kit.expectCardStatus(page, nickOf(user), 'alive', { timeout: 10_000 });
            // 밤이 시작된 뒤 지금까지 영상·낮 시작 글·결과 창이 한 번도 안 떴음 (화면 기록)
            const rec = await night.readUi(page);
            expect({ kills: rec.kills, videos: rec.videos, dawnMessages: rec.dawnMessages, privateResults: rec.privateResults })
                .toEqual({ kills: 0, videos: [], dawnMessages: [], privateResults: [] });
        }),
    });
});
