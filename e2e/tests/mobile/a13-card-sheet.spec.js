'use strict';

// 모바일 판 화면 카드 시트 브라우저 시험 — 항목 없는 내 칸은 시트가 안 뜸, 낮 투표 중 봇 칸 시트는 바깥을 탭하면 닫힘
// 목록 A13-친구-알림-초대.md 번호 A13-E-097·098 (09글 카드 시트, F34 §2-1), 쓰는 동안 안 돌림 — npx playwright test --list tests/mobile/a13-card-sheet.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { talk, toVote } = require('./_talk');
const K = require('../social/_a13-kit');

const GAME_MS = 180_000;

test('A13-E-097 모바일 5명 판 낮 토론 중 내 초상 칸 탭 → 카드 시트 없음 @game @smoke', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    await K.seatGame(table, user, 5);

    await talk.mySlot(page).click();
    await expect(talk.cardSheet(page)).toHaveCount(0);
});

test('A13-E-098 모바일 6명 판 낮 투표 중 봇 칸 → 시트 → 바깥 탭 → 시트 없음 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 6);
    await toVote(t, page);

    await talk.slot(page, t.bots[0].nickname).click();
    const sheet = talk.cardSheet(page);
    await expect(sheet).toBeVisible();
    // 시트는 아래에서 올라옴 → 화면 위쪽은 뒤판(바깥)
    const size = page.viewportSize();
    await page.touchscreen.tap(Math.round(size.width / 2), 40);
    await expect(sheet).toHaveCount(0);
});
