'use strict';

// 모바일 1일 밤 새로고침 브라우저 시험 — 새로고침 뒤 "내 역할 보기" 창에 같은 직업 동료가 그대로 남나
// 목록 A02-판시작-역할.md 번호 A02-E-163~166 (밤까지는 손잡이로 넘김)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { ROLE_LABELS, closeOverlays } = require('../../helpers/ui');
const { talk } = require('./_talk');
const { toNight } = require('../ingame/b-night/_night');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

// 역할 창 열린 채로 받기 — 안 떠 있으면 위 줄 "내 역할 보기"로 엶 (밤 안내 창이 막으면 닫으면서)
async function openReveal(page) {
    const dialog = revealDialog(page);
    await expect(async () => {
        if (await dialog.isVisible().catch(() => false)) return;
        await closeOverlays(page, { names: ['단계 전환 안내', '밤 역할 안내', '알림', '밤 조사 결과'], rounds: 2 });
        await page.getByRole('button', { name: '내 역할 보기', exact: true }).click({ timeout: 1500 });
        await expect(dialog).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    return dialog;
}

// 번호 · 짝 직업 · 인원 · 방 설정 (PC 줄 A02-E-074~081과 같은 짝)
const CASES = [
    { no: 'A02-E-163', role: 'JOKER', n: 5, settings: { jokerCount: 2 } },
    { no: 'A02-E-164', role: 'DOCTOR', n: 7, settings: customRoleSettings({ JOKER: 1, DOCTOR: 2 }) },
    { no: 'A02-E-165', role: 'GUARD', n: 8, settings: customRoleSettings({ JOKER: 1, GUARD: 2 }) },
    { no: 'A02-E-166', role: 'WITCH_HUNTER', n: 10, settings: customRoleSettings({ JOKER: 1, WITCH_HUNTER: 2 }) },
];

CASES.forEach((c, i) => {
    const label = ROLE_LABELS[c.role];
    const tags = ['@game', ...(i === 0 ? ['@smoke'] : [])].join(' ');
    test(`${c.no} 모바일 ${label} 2명 ${c.n}명 판 1일 밤 새로고침 → "동료 ${label}" + 상대 닉네임 그대로 ${tags}`, async ({ user, table }) => {
        const me = user.account.uuid;
        const page = user.page;
        const t = await table.setup({
            humans: [user],
            bots: c.n - 1,
            settings: c.settings,
            roles: ({ bots }) => ({ [me]: c.role, [bots[0].account.uuid]: c.role }),
        });
        const s = await t.state();
        expect(s.players.find((p) => p.uuid === me)?.role, '미리 정한 내 직업').toBe(c.role);
        const partner = s.players.find((p) => p.uuid !== me && p.role === c.role);
        expect(partner, '같은 직업 상대').toBeTruthy();

        // 1일 밤 (낮은 아무도 안 찍어 재판 없이 밤)
        await toNight(t, { dayIndex: 1 });
        await expect(talk.phaseLine(page)).toContainText('밤', { timeout: 15_000 });

        await page.reload();
        await expect(page).toHaveURL(/\/ingame/);
        await expect(talk.layout(page)).toBeVisible({ timeout: 20_000 });
        // 새로고침 뒤에도 같은 밤
        await expect(talk.phaseLine(page)).toContainText('밤', { timeout: 15_000 });

        const dialog = await openReveal(page);
        await expectReadable(dialog.getByText(`동료 ${label}`, { exact: true }));
        await expect(dialog.getByRole('listitem')).toHaveText([partner.nickname]);
        await expectReadable(dialog.getByRole('listitem').filter({ hasText: partner.nickname }));
    });
});
