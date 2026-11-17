'use strict';

// 바 묶음 장면 (판 안, 5명 이상) — 지금은 증명용 바-01 하나, 바 묶음 맡은 사람이 chain '바-판'으로 이어 씀
// run.js가 읽음 — 앉히기는 미리, 판 시작은 보여 줄 때(역할 창이 진짜로 뜨게), 판 굴리기는 e2e Table 그대로
const { fromE2e, e2eRequire } = require('../lib/paths');
const { seat, start, customRoleSettings } = require('../lib/table');

const { expect } = e2eRequire('@playwright/test');
const ui = fromE2e('helpers/ui');

const roleDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

// 역할 창은 10초 뒤 저절로 닫힘(서버도 10초 뒤 첫 낮) → 닫히면 "내 역할 보기" 단추로 다시 열어 둠 (사람이 연 창은 안 닫힘)
async function keepRoleOpen(page) {
    await expect(roleDialog(page)).toBeHidden({ timeout: 30_000 });
    for (let i = 0; i < 5; i += 1) {
        await ui.closeOverlays(page, { names: ['단계 전환 안내'], keepWatching: false });
        if (!(await roleDialog(page).isVisible().catch(() => false))) {
            await page.getByRole('button', { name: '내 역할 보기', exact: true }).click({ timeout: 3000 }).catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 700));
    }
}

module.exports = [
    {
        id: '바-01',
        chain: '바-판',
        async prepare(s) {
            const humans = [
                await s.person({ label: '나 (광대)' }),
                await s.person({ label: '광대 동료' }),
                await s.person({ label: '의사' }),
                await s.person({ label: '귀족' }),
            ];
            const uuid = (p) => p.account.uuid;
            // 5명 판: 사람 넷 + 봇 방장 하나, 광대 둘(동료 표시 보려고)·의사 하나·귀족 둘
            s.state.seated = await seat(s, {
                humans,
                bots: 1,
                settings: customRoleSettings({ JOKER: 2, DOCTOR: 1 }),
                roles: ({ bots }) => ({
                    [uuid(humans[0])]: 'JOKER', [uuid(humans[1])]: 'JOKER', [uuid(humans[2])]: 'DOCTOR',
                    [uuid(humans[3])]: 'CITIZEN', [bots[0].account.uuid]: 'CITIZEN',
                }),
            });
            s.note('큰 창 = 나(광대, 동료 있음), 작은 창 = 광대 동료·의사·귀족, 봇 1(귀족·방장)');
            s.note('역할 창은 10초 뒤 저절로 닫힘 → 도구가 "내 역할 보기"로 다시 열어 둠 (같은 창)');
        },
        async show(s) {
            const t = await start(s.state.seated);
            s.state.table = t;
            s.keep(() => t.stopBots().catch(() => {}));
            await expect(roleDialog(s.main)).toBeVisible({ timeout: 20_000 });
            for (const p of s.people) s.background(keepRoleOpen(p.page));
        },
        still: (s) => roleDialog(s.main).isVisible(),
    },
];
