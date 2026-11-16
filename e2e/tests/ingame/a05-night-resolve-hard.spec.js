'use strict';

// 밤 판정 시험(어려움): 광대가 노린 사람이 밤이 끝나기 전에 스스로 나가면 그 밤엔 아무도 안 죽음
// 목록 시험목록/A05a-밤-차례-능력.md A05-H-027 — 쓰는 동안엔 안 돌림: npx playwright test --list tests/ingame/a05-night-resolve-hard.spec.js
const { test, expect } = require('../../helpers/fixtures');
const kit = require('../mobile/_a05a-kit');

const { night, uuidOf, nickOf } = kit;

// 판 화면 "게임 나가기" → 브라우저 확인 창 받기 → 판 화면을 떠날 때까지
async function leaveGameUi(page) {
    page.once('dialog', (dialog) => { dialog.accept().catch(() => {}); });
    await expect(async () => {
        await kit.clearBlockers(page);
        await page.getByRole('button', { name: '게임 나가기', exact: true }).click({ timeout: 1500 });
    }).toPass({ timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/ingame/, { timeout: 20_000 });
}

test('A05-H-027 6명 시민 사람 2명: 광대 봇이 노린 사람이 의사 차례 중 스스로 나감 → 남은 사람 화면 낮에 밤 사망 없음 @game @hard @smoke', async ({ user, players, table }) => {
    test.setTimeout(240_000);
    const target = user;
    const watcher = await players.add();
    const g = await kit.seat(table, { humans: [target, watcher], bots: 4, humanRoles: ['CITIZEN', 'CITIZEN'], botRoles: ['JOKER', 'DOCTOR'] });
    const [joker] = g.bots.JOKER;
    await kit.toNight(g.t, 1);
    await kit.playNight(g.t, {
        JOKER: () => kit.botPick(g.t, joker, uuidOf(target)),
        // 의사 차례 중(밤 판정 전)에 노려진 사람이 화면으로 나감 (의사 봇은 안 고름)
        DOCTOR: kit.watch(async () => {
            await leaveGameUi(target.page);
            await kit.waitState(g.t, (s) => {
                const p = s.players.find((row) => row.uuid === uuidOf(target));
                return Boolean(p) && (p.isParticipating === false || p.alive === false);
            }, '나간 것이 판에 반영됨');
        }),
    });

    // 남은 사람 화면: 낮이 왔는데 살해 연출(영상·"살해당했습니다" 글)이 한 번도 없음
    const page = watcher.page;
    await kit.expectDayShown(page, 2);
    await kit.settleDawn(page);
    const rec = await night.readUi(page);
    expect({ kills: rec.kills, dawnMessages: rec.dawnMessages, killedReports: rec.dawnReports.filter((kind) => kind === 'KILLED') })
        .toEqual({ kills: 0, dawnMessages: [], killedReports: [] });
    // 나간 사람 말고는 사망 카드가 없음 (나간 사람 카드 표시는 A09 몫)
    await expect(page.locator(`[data-ingame-player-nickname][data-ingame-player-status="dead"]:not([data-ingame-player-nickname="${nickOf(target)}"])`)).toHaveCount(0);
    for (const bot of g.t.bots) await kit.expectCardStatus(page, nickOf(bot), 'alive');
});
