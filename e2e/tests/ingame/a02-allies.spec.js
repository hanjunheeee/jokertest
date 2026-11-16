'use strict';

// 같은 직업 동료 줄 브라우저 시험 (PC) — 같은 직업 봇이 하나 있으면 역할 창에 "동료 ○○" + 봇 닉네임이 읽히고, 혼자·시민이면 "동료" 글 없음
// 목록 A02-판시작-역할.md 번호 A02-E-027~056 — 창은 10초 뒤 저절로 닫혀서 판이 열리자마자 봄 (손잡이 안 씀)
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const night = require('./b-night/_night');

const ROLE_NAME = ui.ROLE_LABELS;
const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

/**
 * 직업 수 구성 (결정 "구성 칸": 자동은 6명부터 의사·8명부터 경비원·10명부터 마녀사냥꾼, 직접은 준 것만, 남는 자리 시민)
 * @example countsOf(5, { custom: { JOKER: 1, DOCTOR: 2 } }) // { JOKER: 1, DOCTOR: 2, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 2 }
 */
function countsOf(n, { jokers = 1, custom = null } = {}) {
    const c = custom
        ? { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...custom }
        : { JOKER: jokers, DOCTOR: n >= 6 ? 1 : 0, GUARD: n >= 8 ? 1 : 0, WITCH_HUNTER: n >= 10 ? 1 : 0 };
    c.CITIZEN = n - c.JOKER - c.DOCTOR - c.GUARD - c.WITCH_HUNTER;
    return c;
}

// 봇 직업 줄: 사람 직업 하나 빼고 펼침, 같은 직업 봇이 맨 앞(= 동료는 t.bots[0]) → 예: (J2C3, 'JOKER') → ['JOKER','CITIZEN','CITIZEN','CITIZEN']
function botRolesFor(counts, humanRole) {
    const left = { ...counts, [humanRole]: counts[humanRole] - 1 };
    const order = [...new Set([humanRole, 'JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'])];
    return order.flatMap((role) => Array(left[role]).fill(role));
}

// n명 판 차리고 직업 고정 (서버 역할을 읽어 맞았는지까지 _night.setup이 봄)
async function openTable(table, user, { n, role, jokers = 1, custom = null }) {
    const counts = countsOf(n, { jokers, custom });
    const settings = custom ? night.custom(custom) : { jokerCount: jokers };
    return night.setup(table, { humans: [user], bots: n - 1, settings, humanRoles: [role], botRoles: botRolesFor(counts, role) });
}

// 같은 직업 2명 판: 광대는 자동·광대 2, 나머지는 직접 J1 + 그 직업 2
const PAIR_SETUP = {
    JOKER: { jokers: 2 },
    DOCTOR: { custom: { JOKER: 1, DOCTOR: 2 } },
    GUARD: { custom: { JOKER: 1, GUARD: 2 } },
    WITCH_HUNTER: { custom: { JOKER: 1, WITCH_HUNTER: 2 } },
};
const PAIR_CODE = { JOKER: '자동·광대 2', DOCTOR: 'J1D2', GUARD: 'J1G2', WITCH_HUNTER: 'J1W2' };

// A02-E-027~050: 직업 4 × 인원 5~10 (직업 먼저)
const PAIR_CASES = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER']
    .flatMap((role, r) => [5, 6, 7, 8, 9, 10].map((n, i) => ({ no: 27 + r * 6 + i, role, n })));

for (const c of PAIR_CASES) {
    const id = `A02-E-${String(c.no).padStart(3, '0')}`;
    const smoke = c.no === 27 ? ' @smoke' : '';
    test(`${id} ${ROLE_NAME[c.role]} 2명 ${c.n}명(${PAIR_CODE[c.role]}): 창에 "동료 ${ROLE_NAME[c.role]}" + 같은 직업 봇 닉네임이 읽힘 @game${smoke}`, async ({ user, table }) => {
        const t = await openTable(table, user, { n: c.n, role: c.role, ...PAIR_SETUP[c.role] });
        const partner = t.bots[0];
        const dialog = revealDialog(user.page);
        await expect(dialog).toBeVisible({ timeout: 20_000 });
        await expectReadable(dialog.getByText(`동료 ${ROLE_NAME[c.role]}`, { exact: true }));
        await expectReadable(dialog.getByText(partner.nickname, { exact: true }));
        // 동료 줄엔 같은 직업 봇 하나만 (다른 사람 이름이 섞이지 않음)
        await expect(dialog.getByRole('listitem')).toHaveText([partner.nickname]);
    });
}

// A02-E-051~056: 동료 줄 없음 — 직업 1명(자동) 넷 + 시민 둘
const SOLO_CASES = [
    { no: 51, role: 'JOKER', n: 5 },
    { no: 52, role: 'DOCTOR', n: 6 },
    { no: 53, role: 'GUARD', n: 8 },
    { no: 54, role: 'WITCH_HUNTER', n: 10 },
    { no: 55, role: 'CITIZEN', n: 5 },
    { no: 56, role: 'CITIZEN', n: 10 },
];

for (const c of SOLO_CASES) {
    const id = `A02-E-${String(c.no).padStart(3, '0')}`;
    const who = c.role === 'CITIZEN' ? '시민' : `${ROLE_NAME[c.role]} 1명`;
    test(`${id} ${who} ${c.n}명(자동): 창에 "동료" 글 없음 @game`, async ({ user, table }) => {
        await openTable(table, user, { n: c.n, role: c.role });
        const dialog = revealDialog(user.page);
        // 창 글이 다 그려진 뒤에 봄 (안 그려져서 "없음"이 맞는 것 막기)
        await expectReadable(dialog.getByText(ROLE_NAME[c.role], { exact: true }));
        await expect(dialog.getByText(user.account.nickname, { exact: true })).toBeVisible();
        await expect(dialog.getByText(/동료/)).toHaveCount(0);
        await expect(dialog.getByRole('listitem')).toHaveCount(0);
    });
}
