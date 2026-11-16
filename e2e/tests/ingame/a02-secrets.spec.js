'use strict';

// 남의 직업이 안 새는지 브라우저 시험 (PC) — 직업마다 2명인 짝 판에서 역할 창 동료 줄엔 같은 직업 상대만, 다른 사람 카드엔 "동료"·직업 글 없음
// 목록 A02-판시작-역할.md 번호 A02-E-057~065 — 창은 판이 열리자마자 보고, 카드는 첫 낮(손잡이로 감)에 봄
const { test, expect, ui } = require('../../helpers/fixtures');
const night = require('./b-night/_night');
const day = require('./a-day/_lib');

const ROLE_NAME = ui.ROLE_LABELS;
const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });

// 짝 판 구성 (시민은 남는 자리)
const PAIRS_10 = { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2, CITIZEN: 2 };
const PAIRS_8 = { JOKER: 2, DOCTOR: 2, GUARD: 2, WITCH_HUNTER: 2, CITIZEN: 0 };

// 봇 직업 줄: 사람 직업 하나 빼고 펼침, 같은 직업 봇이 맨 앞(= 동료는 t.bots[0])
function botRolesFor(counts, humanRole) {
    const left = { ...counts, [humanRole]: counts[humanRole] - 1 };
    const order = [...new Set([humanRole, 'JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'])];
    return order.flatMap((role) => Array(left[role]).fill(role));
}

// 첫 낮까지 손잡이로: 역할 창 닫기(10초가 지나 이미 닫혔으면 그냥 감) → 첫 낮 → "낮이 되었습니다" 닫기
async function toFirstDay(t, page) {
    await night.closeRoleReveal(page);
    await t.advanceUntil('DAY');
    await day.closeNotice(page, '낮이 되었습니다');
}

/**
 * 짝 판 하나 보기
 * 1) 역할 창: 동료 줄 = 같은 직업 상대만 (시민은 동료 줄 없음), 창 어디에도 다른 사람 닉네임 없음
 * 2) 첫 낮 판 카드: 상대 말고 다른 카드에 "동료"·직업 이름 글 없음
 */
async function checkPairTable(table, user, { n, counts, role }) {
    const settings = night.custom({ JOKER: counts.JOKER, DOCTOR: counts.DOCTOR, GUARD: counts.GUARD, WITCH_HUNTER: counts.WITCH_HUNTER });
    const t = await night.setup(table, { humans: [user], bots: n - 1, settings, humanRoles: [role], botRoles: botRolesFor(counts, role) });
    const page = user.page;
    // 시민은 같은 직업이 있어도 동료로 안 보임 (결정 "누가 보나")
    const partner = role === 'CITIZEN' ? null : t.bots[0];
    const others = t.bots.filter((b) => b !== partner).map((b) => b.nickname);

    const dialog = revealDialog(page);
    await expect(dialog.getByText(ROLE_NAME[role], { exact: true })).toBeVisible({ timeout: 20_000 });
    if (partner) {
        await expect(dialog.getByText(`동료 ${ROLE_NAME[role]}`, { exact: true })).toBeVisible();
        await expect(dialog.getByRole('listitem')).toHaveText([partner.nickname]);
    } else {
        await expect(dialog.getByText(/동료/)).toHaveCount(0);
    }
    const dialogText = await dialog.innerText();
    for (const nick of others) expect(dialogText, `역할 창에 ${nick} 이름`).not.toContain(nick);

    // 카드는 창이 덮지 않는 첫 낮에 봄
    await toFirstDay(t, page);
    await expect(page.locator('[data-ingame-player-nickname]')).toHaveCount(n);
    for (const nick of others) {
        const cardText = await night.cardStatus(page, nick).innerText();
        expect(cardText, `${nick} 카드에 "동료"`).not.toContain('동료');
        for (const name of Object.values(ROLE_NAME)) expect(cardText, `${nick} 카드에 직업 글 "${name}"`).not.toContain(name);
    }
}

// A02-E-057~061: 10명 J2D2G2W2C2, 사람 직업 다섯
const CASES_10 = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'].map((role, i) => ({ no: 57 + i, role }));
for (const c of CASES_10) {
    const id = `A02-E-${String(c.no).padStart(3, '0')}`;
    const smoke = c.no === 57 ? ' @smoke' : '';
    test(`${id} 10명 J2D2G2W2C2 사람 ${ROLE_NAME[c.role]}: 같은 직업 상대 말고 "동료"로 안 나옴, 다른 카드에 직업 글 없음 @game${smoke}`, async ({ user, table }) => {
        test.setTimeout(180_000);
        await checkPairTable(table, user, { n: 10, counts: PAIRS_10, role: c.role });
    });
}

// A02-E-062~065: 8명 J2D2G2W2(시민 0), 사람 직업 넷
const CASES_8 = ['JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER'].map((role, i) => ({ no: 62 + i, role }));
for (const c of CASES_8) {
    const id = `A02-E-${String(c.no).padStart(3, '0')}`;
    test(`${id} 8명 J2D2G2W2 사람 ${ROLE_NAME[c.role]}: 같은 직업 상대 말고 "동료"로 안 나옴, 다른 카드에 직업 글 없음 @game`, async ({ user, table }) => {
        test.setTimeout(180_000);
        await checkPairTable(table, user, { n: 8, counts: PAIRS_8, role: c.role });
    });
}
