'use strict';

// 같은 계정 다른 기기·다른 탭 브라우저 시험 (PC) — 다른 브라우저로 로그인하면 새 화면에서 판이 이어지고 옛 화면은 로그인 화면, 같은 브라우저 새 탭이면 옛 탭은 알림만, 새 기기에서도 산 사람 나가기 확인 창
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-077·079·119 (PC 줄)
const { test, expect } = require('../../helpers/fixtures');
const K = require('./_a09-simple-kit');

const SAME_TAB_TEXT = '같은 브라우저의 다른 창에서 접속해 현재 창의 연결이 종료되었습니다.';
const cards = (page) => page.locator('[data-ingame-player-nickname]');

// 그 화면에 뜨는 브라우저 알림 창 글을 모으며 닫음
function collectAlerts(page) {
    const alerts = [];
    page.on('dialog', (dialog) => { alerts.push(dialog.message()); dialog.accept().catch(() => {}); });
    return alerts;
}

// 판 앉히고 첫 낮까지
async function seatAtDay(table, user, n) {
    const t = await K.seat(table, user, { n });
    await K.toDay(t);
    await K.clear(user.page);
    return t;
}

// 다른 브라우저(쿠키 따로)로 같은 계정 로그인 → 판 화면 열기
async function openOtherDevice(players, user, n) {
    const other = await players.add({ account: user.account, lobby: false });
    await other.page.goto('/ingame');
    await expect(other.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expect(cards(other.page)).toHaveCount(n, { timeout: 30_000 });
    return other;
}

test('A09-E-077 PC 6명 판, 다른 브라우저로 로그인 → 새 화면에서 판 그대로, 옛 화면은 로그인 화면 @game @smoke', async ({ user, players, table }) => {
    const page = user.page;
    const me = K.U(user);
    collectAlerts(page);
    const t = await seatAtDay(table, user, 6);
    const other = await openOtherDevice(players, user, 6);
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    // 새 화면: 내 카드가 산 채로 보이고 판에도 그대로
    await K.clear(other.page);
    await expect(K.cardOf(other.page, user.account.nickname)).toHaveAttribute('data-ingame-player-status', 'alive');
    await expect(K.exitButton(other.page)).toBeVisible();
    const row = await t.player(me);
    expect(row.alive).toBe(true);
    expect(row.isParticipating).toBe(true);
    expect((await t.state()).phase).toBe('DAY');
});

test('A09-E-079 PC 5명 판, 같은 브라우저 새 탭에서 판 화면 → 옛 탭은 알림만 (로그인 화면 아님) @game', async ({ user, table }) => {
    const page = user.page;
    const alerts = collectAlerts(page);
    const t = await seatAtDay(table, user, 5);
    const tab = await user.context.newPage();
    collectAlerts(tab);
    await tab.goto('/ingame');
    await expect(tab).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expect(cards(tab)).toHaveCount(5, { timeout: 30_000 });
    // 옛 탭: "다른 창에서 접속" 알림을 받고도 판 화면 주소 그대로
    await expect.poll(() => alerts.includes(SAME_TAB_TEXT), { timeout: 15_000, message: `옛 탭 알림: ${JSON.stringify(alerts)}` }).toBe(true);
    await expect(page).toHaveURL(/\/ingame/);
    await expect(page).not.toHaveURL(/\/login/);
    // 새 탭에서 판이 이어짐
    await K.clear(tab);
    await expect(K.cardOf(tab, user.account.nickname)).toHaveAttribute('data-ingame-player-status', 'alive');
    expect((await t.player(K.U(user))).isParticipating).toBe(true);
});

test('A09-E-119 PC 6명 판, 다른 기기로 이어받은 뒤 "게임 나가기" → 산 사람 확인 창 글 @game', async ({ user, players, table }) => {
    collectAlerts(user.page);
    const t = await seatAtDay(table, user, 6);
    const other = await openOtherDevice(players, user, 6);
    const message = await K.pressExit(other.page, { accept: false });
    for (const line of K.EXIT_ALIVE_LINES) expect(message).toContain(line);
    // 취소했으니 판에 그대로
    await expect(other.page).toHaveURL(/\/ingame/);
    expect((await t.player(K.U(user))).isParticipating).toBe(true);
});
