'use strict';

// 새로고침 뒤 동료 브라우저 시험 (PC) — 1일 낮·1일 밤에 새로고침해도 "내 역할 보기" 창에 "동료 ○○" + 상대 닉네임 그대로, 역할 확인 중 새로고침은 지금 동작대로
// 목록 A02-판시작-역할.md 번호 A02-E-074~082 — 1일 낮·밤까지는 손잡이로 감, E-082는 10초를 진짜로 기다림
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { sleep } = require('../../helpers/wait');
const night = require('./b-night/_night');

const ROLE_NAME = ui.ROLE_LABELS;
const revealDialog = (page) => page.getByRole('dialog', { name: '내 역할 보기' });
const dayNotice = (page) => page.getByRole('dialog', { name: '단계 전환 안내' }).filter({ hasText: '낮이 되었습니다' });
// 진짜 시간 허용 폭 ±1.5초 (시험_계획.md 3-5)
const SLACK_MS = 1500;

/**
 * 직업 수 구성 (결정 "구성 칸": 자동은 6명부터 의사·8명부터 경비원·10명부터 마녀사냥꾼, 직접은 준 것만, 남는 자리 시민)
 * @example countsOf(6) // { JOKER: 1, DOCTOR: 1, GUARD: 0, WITCH_HUNTER: 0, CITIZEN: 4 }
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

async function openTable(table, user, { n, role, jokers = 1, custom = null }) {
    const counts = countsOf(n, { jokers, custom });
    const settings = custom ? night.custom(custom) : { jokerCount: jokers };
    return night.setup(table, { humans: [user], bots: n - 1, settings, humanRoles: [role], botRoles: botRolesFor(counts, role) });
}

// 판이 시작된 시각 (방장 봇이 game_started를 받은 때)
function startedAtOf(t) {
    const row = t.bots[0].events.find((r) => r.event === 'game_started');
    if (!row) throw new Error('방장 봇이 game_started를 못 받음');
    return row.at;
}

// 새로고침 뒤 판 카드가 다 그려질 때까지 → 떠 있는 안내 창 닫으며 "내 역할 보기" 단추로 창 다시 엶 (단계 안내가 늦게 떠 덮을 수 있어 될 때까지)
async function reloadAndReopen(page, n) {
    await page.reload();
    await expect(page.locator('[data-ingame-player-nickname]')).toHaveCount(n, { timeout: 30_000 });
    const dialog = revealDialog(page);
    await expect(async () => {
        await ui.closeOverlays(page, { names: ['단계 전환 안내', '밤 역할 안내', '알림', '밤 조사 결과'] });
        if (!(await dialog.isVisible())) await page.getByRole('button', { name: '내 역할 보기' }).click({ timeout: 1500 });
        await expect(dialog).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 25_000 });
    return dialog;
}

// 같은 직업 2명 판 (A02-E-074~081): 광대 5명(자동·광대 2) / 의사 7명(J1D2) / 경비원 8명(J1G2) / 마녀사냥꾼 10명(J1W2)
const PAIRS = [
    { role: 'JOKER', n: 5, jokers: 2, code: '자동·광대 2' },
    { role: 'DOCTOR', n: 7, custom: { JOKER: 1, DOCTOR: 2 }, code: 'J1D2' },
    { role: 'GUARD', n: 8, custom: { JOKER: 1, GUARD: 2 }, code: 'J1G2' },
    { role: 'WITCH_HUNTER', n: 10, custom: { JOKER: 1, WITCH_HUNTER: 2 }, code: 'J1W2' },
];
const WHEN = [
    { key: 'day', label: '1일 낮', go: (t) => night.toDay(t, { dayIndex: 1 }) },
    { key: 'night', label: '1일 밤', go: (t) => night.toNight(t, { dayIndex: 1 }) },
];
const CASES = PAIRS.flatMap((p, r) => WHEN.map((w, i) => ({ ...p, when: w, no: 74 + r * 2 + i })));

for (const c of CASES) {
    const id = `A02-E-${String(c.no).padStart(3, '0')}`;
    const smoke = c.no === 74 ? ' @smoke' : '';
    test(`${id} ${ROLE_NAME[c.role]} 2명 ${c.n}명(${c.code}) ${c.when.label} 새로고침 → "동료 ${ROLE_NAME[c.role]}" + 상대 닉네임 그대로 @game${smoke}`, async ({ user, table }) => {
        test.setTimeout(240_000);
        const page = user.page;
        const t = await openTable(table, user, c);
        const partner = t.bots[0];
        await night.closeRoleReveal(page);
        const s = await c.when.go(t);
        expect(s.dayIndex).toBe(1);
        const dialog = await reloadAndReopen(page, c.n);
        await expectReadable(dialog.getByText(`동료 ${ROLE_NAME[c.role]}`, { exact: true }));
        await expectReadable(dialog.getByText(partner.nickname, { exact: true }));
        await expect(dialog.getByRole('listitem')).toHaveText([partner.nickname]);
    });
}

// A02-E-082 [지금 동작]: 역할 확인 중 3초에 새로고침 → 창이 다시 안 뜸, 10초(±1.5)에 낮 (손잡이 안 씀)
test('A02-E-082 [지금 동작] 6명, 역할 확인 중 3초에 새로고침 → 역할 창 다시 안 뜸, 10초에 낮 @game @realtime', async ({ user, table }) => {
    const page = user.page;
    const t = await openTable(table, user, { n: 6, role: 'CITIZEN' });
    const startedAt = startedAtOf(t);
    await expect(revealDialog(page)).toBeVisible({ timeout: 20_000 });
    const wait = startedAt + 3_000 - Date.now();
    if (wait > 0) await sleep(wait);
    await page.reload();
    // 낮 안내가 뜰 때까지 0.1초마다 보며 역할 창이 한 번이라도 떴는지 적음
    let sawReveal = false;
    let dayAt = null;
    await expect.poll(async () => {
        if (await revealDialog(page).isVisible()) sawReveal = true;
        if (await dayNotice(page).isVisible()) { dayAt = Date.now(); return true; }
        return false;
    }, { timeout: 20_000, intervals: [100] }).toBe(true);
    expect(sawReveal, '새로고침 뒤 역할 창이 다시 뜸').toBe(false);
    const elapsed = dayAt - startedAt;
    expect(elapsed).toBeGreaterThanOrEqual(10_000 - SLACK_MS);
    expect(elapsed).toBeLessThanOrEqual(10_000 + SLACK_MS);
    const s = await t.state();
    expect(s.phase).toBe('DAY');
    expect(s.dayIndex).toBe(1);
});
