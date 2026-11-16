'use strict';

// 모바일 역할 확인 창 브라우저 시험 — 직업 × 인원마다 창에 내 닉네임·직업 이름이 사람 눈에 읽히는지
// 목록 A02-판시작-역할.md 번호 A02-E-125~134 (사파리도: E-125·E-126)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { ROLE_LABELS, closeOverlays } = require('../../helpers/ui');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

// 역할 창 열린 채로 받기 — 10초에 저절로 닫혔으면 위 줄 "내 역할 보기"로 다시 엶 (읽는 동안 닫히는 것 막기)
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

// 사람 1 + 봇 n-1 판, 사람 직업만 정하고 서버 값으로 맞았는지 확인 (나머지는 구성대로 채워짐)
async function openGame(table, user, { n, role, settings = {} }) {
    const me = user.account.uuid;
    const t = await table.setup({ humans: [user], bots: n - 1, settings, roles: { [me]: role } });
    const s = await t.state();
    expect(s.players.find((p) => p.uuid === me)?.role, '미리 정한 내 직업').toBe(role);
    return t;
}

// 번호 · 내 직업 · 인원 · 방 설정 (자동 = 광대 1, 6명부터 의사·8명부터 경비원·10명부터 마녀사냥꾼)
const CASES = [
    { no: 'A02-E-125', role: 'JOKER', n: 5, safari: true },
    { no: 'A02-E-126', role: 'JOKER', n: 10, safari: true },
    { no: 'A02-E-127', role: 'CITIZEN', n: 6 },
    { no: 'A02-E-128', role: 'CITIZEN', n: 10 },
    { no: 'A02-E-129', role: 'DOCTOR', n: 6 },
    { no: 'A02-E-130', role: 'DOCTOR', n: 10 },
    { no: 'A02-E-131', role: 'GUARD', n: 8 },
    { no: 'A02-E-132', role: 'GUARD', n: 10 },
    { no: 'A02-E-133', role: 'WITCH_HUNTER', n: 10 },
    // 7명은 자동이면 마녀사냥꾼이 없음 → 직접 지정 광대 1·마녀사냥꾼 1
    { no: 'A02-E-134', role: 'WITCH_HUNTER', n: 7, settings: customRoleSettings({ JOKER: 1, WITCH_HUNTER: 1 }), custom: true },
];

CASES.forEach((c, i) => {
    const how = c.custom ? '직접' : '자동';
    const tags = ['@game', ...(c.safari ? ['@safari'] : []), ...(i === 0 ? ['@smoke'] : [])].join(' ');
    test(`${c.no} 모바일 ${ROLE_LABELS[c.role]} ${c.n}명(${how}) → 역할 창에 닉네임·"${ROLE_LABELS[c.role]}" 읽힘 ${tags}`, async ({ user, table }) => {
        await openGame(table, user, { n: c.n, role: c.role, settings: c.settings });
        const page = user.page;
        // 시작하면 창이 저절로 뜸 (다시 열기 전에 먼저 봄)
        await expect(revealDialog(page)).toBeVisible({ timeout: 20_000 });
        const dialog = await openReveal(page);
        await expect(page.locator(`[data-ingame-role-reveal="${c.role}"]`)).toHaveCount(1);
        await expectReadable(dialog.getByText(user.account.nickname, { exact: true }));
        await expectReadable(dialog.getByText(ROLE_LABELS[c.role], { exact: true }));
    });
});
