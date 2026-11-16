'use strict';

// 역할 확인 창 브라우저 시험 (PC) — 사람 직업 × 인원마다 창에 닉네임·직업 이름·진영 글이 사람 눈에 읽히는지
// 목록 A02-판시작-역할.md 번호 A02-E-001~026 — 창은 10초 뒤 저절로 닫혀서 판이 열리자마자 봄 (손잡이 안 씀)
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const night = require('./b-night/_night');

// 직업 이름 화면 글 (helpers/ui.js와 같음, 마녀사냥꾼은 "귀족" 아님)
const ROLE_NAME = ui.ROLE_LABELS;
// 진영 글 (광대만 광대 진영)
const teamLabelOf = (role) => (role === 'JOKER' ? '광대 진영' : '시민 진영');
const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

/**
 * 직업 수 구성 (결정 "구성 칸")
 * - 자동: 광대 수만 정하고 6명부터 의사·8명부터 경비원·10명부터 마녀사냥꾼, 남는 자리 시민
 * - 직접: 준 것만, 남는 자리 시민
 * @example countsOf(8) // { JOKER: 1, DOCTOR: 1, GUARD: 1, WITCH_HUNTER: 0, CITIZEN: 5 }
 */
function countsOf(n, { jokers = 1, custom = null } = {}) {
    const c = custom
        ? { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...custom }
        : { JOKER: jokers, DOCTOR: n >= 6 ? 1 : 0, GUARD: n >= 8 ? 1 : 0, WITCH_HUNTER: n >= 10 ? 1 : 0 };
    c.CITIZEN = n - c.JOKER - c.DOCTOR - c.GUARD - c.WITCH_HUNTER;
    return c;
}

// 봇 직업 줄: 구성에서 사람 직업 하나 빼고 펼침, 사람과 같은 직업이 맨 앞 → 예: (J1C4, 'CITIZEN') → ['CITIZEN','CITIZEN','CITIZEN','JOKER']
function botRolesFor(counts, humanRole) {
    const left = { ...counts, [humanRole]: counts[humanRole] - 1 };
    const order = [...new Set([humanRole, 'JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'])];
    return order.flatMap((role) => Array(left[role]).fill(role));
}

// n명 판 차리고 사람 직업 고정 (서버 역할을 읽어 맞았는지까지 _night.setup이 봄)
async function openTable(table, user, { n, role, jokers = 1, custom = null }) {
    const counts = countsOf(n, { jokers, custom });
    const settings = custom ? night.custom(custom) : { jokerCount: jokers };
    return night.setup(table, { humans: [user], bots: n - 1, settings, humanRoles: [role], botRoles: botRolesFor(counts, role) });
}

// 창이 읽힘: 닉네임·직업 이름 먼저, 진영 글은 맨 끝 (창에 없으면 앞 둘은 본 뒤 실패하게)
async function expectRevealReadable(page, nickname, role) {
    const dialog = revealDialog(page);
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expectReadable(dialog.getByText(nickname, { exact: true }));
    await expectReadable(dialog.getByText(ROLE_NAME[role], { exact: true }));
    await expectReadable(dialog.getByText(teamLabelOf(role), { exact: true }));
}

// 번호 · 사람 직업 · 인원 · 구성 (직접 구성이면 custom)
const CASES = [
    ...[5, 6, 7, 8, 9, 10].map((n, i) => ({ no: 1 + i, role: 'JOKER', n })),
    ...[5, 6, 7, 8, 9, 10].map((n, i) => ({ no: 7 + i, role: 'CITIZEN', n })),
    ...[6, 7, 8, 9, 10].map((n, i) => ({ no: 13 + i, role: 'DOCTOR', n })),
    ...[8, 9, 10].map((n, i) => ({ no: 18 + i, role: 'GUARD', n })),
    { no: 21, role: 'WITCH_HUNTER', n: 10 },
    ...[5, 6, 7, 8, 9].map((n, i) => ({ no: 22 + i, role: 'WITCH_HUNTER', n, custom: { JOKER: 1, WITCH_HUNTER: 1 } })),
];

for (const c of CASES) {
    const id = `A02-E-${String(c.no).padStart(3, '0')}`;
    const how = c.custom ? '직접 J1W1' : '자동';
    const smoke = c.no === 1 ? ' @smoke' : '';
    test(`${id} ${ROLE_NAME[c.role]} ${c.n}명(${how}): 역할 창에 닉네임·직업 이름·진영이 읽힘 @game${smoke}`, async ({ user, table }) => {
        await openTable(table, user, c);
        await expectRevealReadable(user.page, user.account.nickname, c.role);
    });
}
