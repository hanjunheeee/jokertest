'use strict';

// 모바일 밤 승패 시험: 밤 암살로 산 광대 수가 나머지와 같아지면 광대 승 결과 화면, 의사가 살리면 판이 이어져 낮 화면
// 목록 시험목록/A05a-밤-차례-능력.md A05-E-148~149 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/mobile/a05-night-win.spec.js
const { test, expect } = require('../../helpers/fixtures');
const kit = require('./_a05a-kit');
const { talk } = require('./_talk');

const { night, uuidOf, nickOf } = kit;

test('A05-E-148 모바일 5명 광대2 광대 사람: 첫 밤 암살로 2:2 → 결과 화면에 승리·"광대 진영 승리" 보임 @game @smoke', async ({ user, table }) => {
    const g = await kit.seat(table, { humans: [user], bots: 4, humanRoles: ['JOKER'], botRoles: ['JOKER'], settings: { jokerCount: 2 } });
    const [ally] = g.bots.JOKER;
    const [victim] = g.bots.CITIZEN;
    await kit.toNight(g.t, 1);
    // 두 광대가 같은 시민 → 광대 2 : 나머지 2
    await kit.playNight(g.t, {
        JOKER: async () => {
            await kit.botPick(g.t, ally, uuidOf(victim));
            await kit.pickNight(user.page, nickOf(victim), 'JOKER');
        },
    });
    await kit.expectResultScreen(user.page, { outcome: '승리', team: '광대 진영 승리' });
});

test('A05-E-149 모바일 5명 직접{광대2·의사1} 광대 사람: 의사 봇이 살려 판이 이어짐 → 결과 화면이 아니라 낮 화면 @game', async ({ user, table }) => {
    const g = await kit.seat(table, {
        humans: [user], bots: 4, humanRoles: ['JOKER'], botRoles: ['JOKER', 'DOCTOR'], settings: night.custom({ JOKER: 2, DOCTOR: 1 }),
    });
    const page = user.page;
    const [ally] = g.bots.JOKER;
    const [doctor] = g.bots.DOCTOR;
    const [target] = g.bots.CITIZEN;
    await kit.toNight(g.t, 1);
    const { after } = await kit.playNight(g.t, {
        JOKER: async () => {
            await kit.botPick(g.t, ally, uuidOf(target));
            await kit.pickNight(page, nickOf(target), 'JOKER');
        },
        DOCTOR: () => kit.botPick(g.t, doctor, uuidOf(target)),
    });
    // 아무도 안 죽어 광대 2 : 나머지 3 그대로 → 둘째 날 낮
    expect(after.phase).toBe('DAY');
    await kit.expectDeadCount(page, 2, 0);
    await expect(talk.phaseLine(page)).toContainText('낮');
    await expect(page).toHaveURL(/\/ingame/);
    await expect(page.getByText(/^(승리|패배)$/)).toHaveCount(0);
});
