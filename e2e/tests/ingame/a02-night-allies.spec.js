'use strict';

// 밤 대상 고르기의 동료 브라우저 시험 (PC) — 1일 밤 내 차례에 동료 의사·경비원은 고를 수 있고, 동료 광대는 못 고름
// 목록 A02-판시작-역할.md 번호 A02-E-066~073 — 첫 밤 내 차례까지는 손잡이로 감 (밤 시간 규칙은 안 봄)
const { test, expect, ui } = require('../../helpers/fixtures');
const night = require('./b-night/_night');

const ROLE_NAME = ui.ROLE_LABELS;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cardMenu = (page) => page.getByRole('menu', { name: '플레이어 행동' });

/**
 * 직업 수 구성 (결정 "구성 칸": 자동은 6명부터 의사·8명부터 경비원·10명부터 마녀사냥꾼, 직접은 준 것만, 남는 자리 시민)
 * @example countsOf(7, { jokers: 2 }) // { JOKER: 2, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 4 }
 */
function countsOf(n, { jokers = 1, custom = null } = {}) {
    const c = custom
        ? { JOKER: 0, DOCTOR: 0, GUARD: 0, WITCH_HUNTER: 0, ...custom }
        : { JOKER: jokers, DOCTOR: n >= 6 ? 1 : 0, GUARD: n >= 8 ? 1 : 0, WITCH_HUNTER: n >= 10 ? 1 : 0 };
    c.CITIZEN = n - c.JOKER - c.DOCTOR - c.GUARD - c.WITCH_HUNTER;
    return c;
}

// 봇 직업 줄: 사람 직업 하나 빼고 펼침, 같은 직업 봇이 맨 앞(= 동료는 t.bots[0])
function botRolesFor(counts, humanRole) {
    const left = { ...counts, [humanRole]: counts[humanRole] - 1 };
    const order = [...new Set([humanRole, 'JOKER', 'DOCTOR', 'GUARD', 'WITCH_HUNTER', 'CITIZEN'])];
    return order.flatMap((role) => Array(left[role]).fill(role));
}

/**
 * 같은 직업 2명 판 차리고 1일 밤 사람 차례까지 → { t, partner, citizen }
 * 낮엔 아무도 안 냄 → 모두 기권이라 재판 없이 밤 (봇은 행동 안 함)
 */
async function toMyNightTurn(table, user, { n, role, jokers = 1, custom = null }) {
    const counts = countsOf(n, { jokers, custom });
    const settings = custom ? night.custom(custom) : { jokerCount: jokers };
    const botRoles = botRolesFor(counts, role);
    const t = await night.setup(table, { humans: [user], bots: n - 1, settings, humanRoles: [role], botRoles });
    await night.toTurn(t, role, { dayIndex: 1 });
    const citizen = t.bots[botRoles.indexOf('CITIZEN')];
    return { t, partner: t.bots[0], citizen };
}

// 이름이 "닉네임 · 동료 의사"인 밤 대상 단추 (카드 메뉴 단추 또는 다른 대상 단추)
function allyTarget(page, nickname, role) {
    const name = new RegExp(escapeRe(`${nickname} · 동료 ${ROLE_NAME[role]}`));
    return page.getByRole('menuitem', { name }).or(page.getByRole('button', { name }));
}

// 동료 카드 메뉴를 열면 "닉네임 · 동료 ○○" 단추가 눌러짐
async function expectAllyPickable(page, partner, role) {
    await night.openCardMenu(page, partner.nickname);
    await expect(allyTarget(page, partner.nickname, role).first()).toBeEnabled();
}

// 광대 대조: 시민 카드엔 암살 단추가 눌러짐 (화면이 통째로 막혀 아무것도 못 누르는 것과 가르기) → 메뉴 닫음
async function expectCanAttackCitizen(page, citizen) {
    const menu = await night.openCardMenu(page, citizen.nickname);
    await expect(menu.getByRole('menuitem', { name: /암살/ })).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(cardMenu(page)).toBeHidden();
}

// 10명 판 + 밤까지 단계 넘기기라 2분을 넘을 수 있음 → 시험마다 이 안에서만 늘림
const LONG_MS = 240_000;

// A02-E-066~067: 의사 2 판 6명 / 10명 (직접 J1D2)
for (const [no, n] of [[66, 6], [67, 10]]) {
    const smoke = no === 66 ? ' @smoke' : '';
    test(`A02-E-0${no} 의사 2 판 ${n}명, 1일 밤: 대상 "봇 · 동료 의사" 단추 눌러짐 @game${smoke}`, async ({ user, table }) => {
        test.setTimeout(LONG_MS);
        const { partner } = await toMyNightTurn(table, user, { n, role: 'DOCTOR', custom: { JOKER: 1, DOCTOR: 2 } });
        await expectAllyPickable(user.page, partner, 'DOCTOR');
    });
}

// A02-E-068~069: 경비원 2 판 8명 / 10명 (직접 J1G2)
for (const [no, n] of [[68, 8], [69, 10]]) {
    test(`A02-E-0${no} 경비원 2 판 ${n}명, 1일 밤: 대상 "봇 · 동료 경비원" 단추 눌러짐 @game`, async ({ user, table }) => {
        test.setTimeout(LONG_MS);
        const { partner } = await toMyNightTurn(table, user, { n, role: 'GUARD', custom: { JOKER: 1, GUARD: 2 } });
        await expectAllyPickable(user.page, partner, 'GUARD');
    });
}

// A02-E-070~071: 광대 2 판 5명 / 10명 (자동·광대 2) — 동료 광대 대상은 꺼짐(또는 아예 없음)
for (const [no, n] of [[70, 5], [71, 10]]) {
    test(`A02-E-0${no} 광대 2 판 ${n}명, 1일 밤: "봇 · 동료 광대" 단추 꺼짐 @game`, async ({ user, table }) => {
        test.setTimeout(LONG_MS);
        const page = user.page;
        const { partner, citizen } = await toMyNightTurn(table, user, { n, role: 'JOKER', jokers: 2 });
        await expectCanAttackCitizen(page, citizen);
        // 동료 카드를 누름 → 메뉴가 뜨면 암살·동료 대상 단추가 다 꺼져 있어야 함
        await night.cardButton(page, partner.nickname).click();
        const items = cardMenu(page).getByRole('menuitem', { name: /암살|동료 광대/ });
        const named = allyTarget(page, partner.nickname, 'JOKER');
        for (const loc of [items, named]) {
            const count = await loc.count();
            for (let i = 0; i < count; i += 1) await expect(loc.nth(i)).toBeDisabled();
        }
    });
}

// A02-E-072: 광대 2 판 7명 (자동·광대 2), 동료 카드 누름 → 밤 항목 없음
test('A02-E-072 광대 2 판 7명 밤, 동료 광대 카드 누름 → 밤 항목 없음 @game', async ({ user, table }) => {
    test.setTimeout(LONG_MS);
    const page = user.page;
    const { partner, citizen } = await toMyNightTurn(table, user, { n: 7, role: 'JOKER', jokers: 2 });
    await expectCanAttackCitizen(page, citizen);
    await night.expectNoCardMenu(page, partner.nickname);
});

// A02-E-073: 의사 2 판 7명 (직접 J1D2), 동료 의사를 고름 → 거절 글 없이 고른 표시(다시 열면 "취소하기")
test('A02-E-073 의사 2 판 7명 밤, 동료 의사를 고름 → 거절 글 없이 고른 표시 @game', async ({ user, table }) => {
    test.setTimeout(LONG_MS);
    const page = user.page;
    const { partner } = await toMyNightTurn(table, user, { n: 7, role: 'DOCTOR', custom: { JOKER: 1, DOCTOR: 2 } });
    const menu = await night.openCardMenu(page, partner.nickname);
    // 밤 행동 단추 (취소 단추 말고 눌러지는 것)
    const pick = menu.getByRole('menuitem').filter({ hasNotText: /취소/ }).first();
    await expect(pick).toBeEnabled();
    await pick.click();
    await expect(cardMenu(page)).toBeHidden();
    // 서버가 받으면 다시 연 메뉴가 "취소하기"로 바뀜 (= 고른 표시)
    const again = await night.openCardMenu(page, partner.nickname);
    await expect(again.getByRole('menuitem', { name: /취소하기/ })).toBeVisible();
    await expect(page.getByText('동료 광대는 고를 수 없습니다.')).toHaveCount(0);
    await expect(page.getByText('제출하지 못했습니다.')).toHaveCount(0);
});
