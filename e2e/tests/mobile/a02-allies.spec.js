'use strict';

// 모바일 역할 확인 창의 같은 직업 동료 브라우저 시험 — 동료 줄이 보이나·없어야 할 때 없나·10명 짝 판에서 남의 직업이 안 새나(띠 카드의 "동료" 표시는 같은 직업 상대 한 장만)
// 목록 A02-판시작-역할.md 번호 A02-E-135~157 (사파리도: E-135·E-147·E-153)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { customRoleSettings } = require('../../helpers/game');
const { ROLE_LABELS, closeOverlays } = require('../../helpers/ui');
const { openRoster, closeRoster, rosterRowOf } = require('./_talk');

const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
// 판 카드·띠에 나오면 안 되는 직업 글
const ROLE_WORDS = /광대|의사|경비원|마녀사냥꾼|귀족|시민/; // 시민 직업 화면 이름 "귀족"과 옛 이름 "시민" 둘 다

// 역할 창 열린 채로 받기 — 10초에 저절로 닫혔으면 위 줄 "내 역할 보기"로 다시 엶
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

/**
 * 사람 1 + 봇 n-1 판: 사람 직업 + (짝이면) 첫 봇도 같은 직업으로 정함, 사람 직업은 서버 값으로 확인
 * 짝 상대는 서버 값에서 찾음 (봇 예약이 가끔 다른 봇으로 맞바뀌어도 시험 뜻은 같음)
 * @returns {Promise<{ t, partner: {uuid,nickname}|null }>}
 */
async function openGame(table, user, { n, role, settings = {}, pair = false }) {
    const me = user.account.uuid;
    const t = await table.setup({
        humans: [user],
        bots: n - 1,
        settings,
        roles: ({ bots }) => ({ [me]: role, ...(pair ? { [bots[0].account.uuid]: role } : {}) }),
    });
    const s = await t.state();
    expect(s.players.find((p) => p.uuid === me)?.role, '미리 정한 내 직업').toBe(role);
    const partner = s.players.find((p) => p.uuid !== me && p.role === role) ?? null;
    return { t, partner };
}

// 직업마다 짝 판 방 설정 (광대 2는 자동 그대로, 나머지는 직접 지정)
const PAIR_SETTINGS = {
    JOKER: { jokerCount: 2 },
    DOCTOR: customRoleSettings({ JOKER: 1, DOCTOR: 2 }),
    GUARD: customRoleSettings({ JOKER: 1, GUARD: 2 }),
    WITCH_HUNTER: customRoleSettings({ JOKER: 1, WITCH_HUNTER: 2 }),
};

// A02-E-135~146 동료 줄 + 봇 닉네임 (직업 4 × 인원 3)
const PAIR_CASES = [
    ['A02-E-135', 'JOKER', 5], ['A02-E-136', 'JOKER', 7], ['A02-E-137', 'JOKER', 10],
    ['A02-E-138', 'DOCTOR', 6], ['A02-E-139', 'DOCTOR', 8], ['A02-E-140', 'DOCTOR', 10],
    ['A02-E-141', 'GUARD', 5], ['A02-E-142', 'GUARD', 8], ['A02-E-143', 'GUARD', 10],
    ['A02-E-144', 'WITCH_HUNTER', 6], ['A02-E-145', 'WITCH_HUNTER', 9], ['A02-E-146', 'WITCH_HUNTER', 10],
];

PAIR_CASES.forEach(([no, role, n], i) => {
    const label = ROLE_LABELS[role];
    const tags = ['@game', ...(no === 'A02-E-135' ? ['@safari'] : []), ...(i === 0 ? ['@smoke'] : [])].join(' ');
    test(`${no} 모바일 ${label} 2명 ${n}명 판 → 창에 "동료 ${label}" + 봇 닉네임 읽힘 ${tags}`, async ({ user, table }) => {
        const { partner } = await openGame(table, user, { n, role, settings: PAIR_SETTINGS[role], pair: true });
        expect(partner, `같은 직업 상대 (${label})`).not.toBeNull();
        const dialog = await openReveal(user.page);
        await expectReadable(dialog.getByText(`동료 ${label}`, { exact: true }));
        // 동료 칸엔 그 상대 한 명만
        await expect(dialog.getByRole('listitem')).toHaveText([partner.nickname]);
        await expectReadable(dialog.getByRole('listitem').filter({ hasText: partner.nickname }));
    });
});

// A02-E-147~152 혼자인 직업·시민 → "동료" 글 없음 (자동 구성)
const SOLO_CASES = [
    ['A02-E-147', 'JOKER', 5], ['A02-E-148', 'DOCTOR', 6], ['A02-E-149', 'GUARD', 8],
    ['A02-E-150', 'WITCH_HUNTER', 10], ['A02-E-151', 'CITIZEN', 5], ['A02-E-152', 'CITIZEN', 10],
];

SOLO_CASES.forEach(([no, role, n]) => {
    const label = ROLE_LABELS[role];
    const tags = ['@game', ...(no === 'A02-E-147' ? ['@safari'] : [])].join(' ');
    test(`${no} 모바일 ${label} 1명(${n}명 자동) → 창에 "동료" 글 없음 ${tags}`, async ({ user, table }) => {
        await openGame(table, user, { n, role });
        const dialog = await openReveal(user.page);
        // 내 창이 맞는지 먼저 (직업 이름), 그다음 동료 글 없음
        await expect(dialog.getByText(label, { exact: true })).toBeVisible();
        await expect(dialog).not.toContainText('동료');
        await expect(dialog.getByRole('listitem')).toHaveCount(0);
    });
});

// A02-E-153~157 10명 짝 판(광대·의사·경비원·마녀사냥꾼·시민 2명씩), 사람 직업 다섯 가지
const FULL_PAIR = customRoleSettings({ JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2 });
const SECRET_CASES = [
    ['A02-E-153', 'JOKER'], ['A02-E-154', 'DOCTOR'], ['A02-E-155', 'GUARD'], ['A02-E-156', 'WITCH_HUNTER'], ['A02-E-157', 'CITIZEN'],
];

SECRET_CASES.forEach(([no, role]) => {
    const label = ROLE_LABELS[role];
    const tags = ['@game', ...(no === 'A02-E-153' ? ['@safari'] : [])].join(' ');
    test(`${no} 모바일 10명 짝 판 ${label} → 같은 직업 상대 말고 "동료" 없음, 띠 카드에 직업 글 없음 ${tags}`, async ({ user, table }) => {
        const { partner } = await openGame(table, user, { n: 10, role, settings: FULL_PAIR, pair: true });
        const dialog = await openReveal(user.page);
        if (role === 'CITIZEN') {
            // 시민끼리는 안 보임 (결정 "누가 보나")
            await expect(dialog.getByText(label, { exact: true })).toBeVisible();
            await expect(dialog).not.toContainText('동료');
        } else {
            await expect(dialog.getByText(`동료 ${label}`, { exact: true })).toBeVisible();
            await expect(dialog.getByRole('listitem')).toHaveText([partner.nickname]);
        }
        // 세로 카톡형엔 카드 띠가 없음 → 플레이어 목록 시트 10줄: 같은 직업 상대 한 줄에만 "동료 ○○" 표시, 나머지는 닉네임만 — 시민은 표시가 하나도 없음
        const roster = await openRoster(user.page);
        const badges = roster.locator('[data-ingame-ally-badge]');
        await expect(roster.locator('li[data-roster-player]')).toHaveCount(10);
        if (role === 'CITIZEN') {
            await expect(rosterRowOf(user.page, partner.nickname)).toHaveCount(1);
            await expect(badges).toHaveCount(0);
        } else {
            await expect(badges).toHaveCount(1);
            await expect(badges).toHaveAttribute('data-ingame-ally-badge', `동료 ${label}`);
            await expect(rosterRowOf(user.page, partner.nickname).locator('[data-ingame-ally-badge]')).toHaveCount(1);
        }
        // 동료 표시 말고는 눈에 보이는 글에 직업 이름이 없음 (남의 직업이 새지 않음)
        const rosterText = await roster.locator('ul').evaluate((ul) => {
            const copy = ul.cloneNode(true);
            for (const b of copy.querySelectorAll('[data-ingame-ally-badge]')) b.remove();
            return copy.innerText;
        });
        expect(rosterText).not.toMatch(ROLE_WORDS);
        await closeRoster(user.page);
    });
});
