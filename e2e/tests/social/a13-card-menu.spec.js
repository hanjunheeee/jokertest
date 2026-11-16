'use strict';

// 판 화면 사람 카드 메뉴 브라우저 시험 (PC) — 누르면 열리고 빈 곳·Esc·단계 바뀜에 닫힘, 키보드 Tab·Enter로 열림, 우클릭은 안 엶, 오른쪽 아래 끝 카드 메뉴도 안 가려짐
// 목록 A13-친구-알림-초대.md 번호 A13-E-061~066 (메뉴 항목 자체는 A03·A04·A05a, 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-card-menu.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { expectAllReadable } = require('../../helpers/visible');
const ui = require('../../helpers/ui');
const a = require('../ingame/a-day/_lib');
const K = require('./_a13-kit');

const { U } = K;

const GAME_MS = 180_000;
const menuOf = (page) => page.getByRole('menu', { name: '플레이어 행동' });

/** n명 판(사람 시민·맨 뒤 봇 광대) 첫 낮 투표까지 → 판 */
async function toVote(table, user, n) {
    const t = await K.seatGame(table, user, n);
    await a.toVote(t);
    return t;
}

test('A13-E-061 6명 판 낮 투표 중 봇 카드 누름 → 메뉴, 빈 곳 누름 → 메뉴 없음 @game @smoke', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await toVote(table, user, 6);

    await a.card(page, t.bots[0].nickname).click();
    await expect(menuOf(page)).toBeVisible();
    const spot = await K.emptySpot(page);
    await page.mouse.click(spot.x, spot.y);
    await expect(menuOf(page)).toHaveCount(0);
});

test('A13-E-062 7명 판 메뉴 연 채 Esc → 메뉴 없음 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await toVote(table, user, 7);

    await a.card(page, t.bots[1].nickname).click();
    await expect(menuOf(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menuOf(page)).toHaveCount(0);
});

test('A13-E-063 7명 판 메뉴 연 채 낮 투표 끝(봇들 표 → 마감) → 다음 단계에 메뉴 없음 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await toVote(table, user, 7);
    const defendant = t.bots[0];

    await a.card(page, t.bots[1].nickname).click();
    await expect(menuOf(page)).toBeVisible();
    // 피고 말고 봇이 모두 피고를 찍고(피고는 기권) 투표 마감 → 재판
    await a.botsVote(t, t.bots.map((bot) => [bot, bot === defendant ? null : U(defendant)]));
    const after = await a.resolveVote(t);
    expect(after.phase, '다음 단계').not.toBe('DAY');
    await expect(menuOf(page)).toHaveCount(0);
});

test('A13-E-064 8명 판 Tab으로 봇 카드에 포커스 → Enter → 메뉴 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await toVote(table, user, 8);
    const card = a.card(page, t.bots[2].nickname);

    await K.tabTo(page, card);
    await page.keyboard.press('Enter');
    await expect(menuOf(page)).toBeVisible();
});

test('A13-E-065 5명 판 봇 카드 우클릭 → 카드 메뉴 없음 (그 카드 좌클릭은 메뉴가 열림) @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await toVote(table, user, 5);
    const card = a.card(page, t.bots[0].nickname);

    await card.click({ button: 'right' });
    await expect(menuOf(page)).toHaveCount(0);

    // 우클릭이 연 다른 것(이모티콘 팔레트 등)은 닫고, 같은 카드 좌클릭은 메뉴가 열림
    await page.keyboard.press('Escape');
    await ui.closeOverlays(page);
    await card.click();
    await expect(menuOf(page)).toBeVisible();
});

test('A13-E-066 10명 판 오른쪽 아래 끝 봇 카드 메뉴 항목이 화면 안·안 가려짐·읽힘 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await toVote(table, user, 10);

    // 봇 카드 중 오른쪽 아래 끝 (오른쪽 끝 + 아래 끝 합이 가장 큰 것)
    let corner = null;
    let best = -Infinity;
    for (const bot of t.bots) {
        const box = await a.card(page, bot.nickname).boundingBox();
        if (box && box.x + box.width + box.y + box.height > best) {
            best = box.x + box.width + box.y + box.height;
            corner = bot;
        }
    }
    expect(corner, '오른쪽 아래 끝 카드').not.toBeNull();

    await a.card(page, corner.nickname).click();
    const menu = menuOf(page);
    await expect(menu).toBeVisible();
    await expectAllReadable(menu.getByRole('menuitem'));
});
