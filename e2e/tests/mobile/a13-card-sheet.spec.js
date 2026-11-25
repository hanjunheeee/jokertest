'use strict';

// 모바일 판 화면 플레이어 목록 시트 브라우저 시험 — 내 줄엔 행동 단추가 없음, 낮 투표 중 목록은 바깥을 탭하면 닫힘 (세로 카톡형엔 카드 시트 대신 목록 시트)
// 목록 A13-친구-알림-초대.md 번호 A13-E-097·098 (09글 카드 시트, F34 §2-1), 쓰는 동안 안 돌림 — npx playwright test --list tests/mobile/a13-card-sheet.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { talk, toVote, openRoster, openPlayer } = require('./_talk');
const K = require('../social/_a13-kit');

const GAME_MS = 180_000;

// 세로 카톡형엔 카드 판·카드 시트가 없음 → 채팅 틀 오른쪽 위 "플레이어 목록" 시트의 줄로 봄 (frontend-mobile roster/PlayerRosterSheet.jsx)
test('A13-E-097 모바일 5명 판 낮 토론 중 플레이어 목록의 내 줄("(나)")엔 행동 단추 없음 @game @smoke', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    await K.seatGame(table, user, 5);

    const sheet = await openRoster(page);
    const mine = sheet.locator('li[data-roster-player]').filter({ hasText: ' (나)' });
    await expect(mine).toHaveCount(1);
    await expect(mine.getByRole('menuitem')).toHaveCount(0);
});

test('A13-E-098 모바일 6명 판 낮 투표 중 플레이어 목록 → 봇 줄 "투표하기" 보임 → 바깥 탭 → 목록 없음 @game', async ({ user, table }) => {
    test.setTimeout(GAME_MS);
    const page = user.page;
    const t = await K.seatGame(table, user, 6);
    await toVote(t, page);

    const row = await openPlayer(page, t.bots[0].nickname);
    await expect(row.getByRole('menuitem', { name: '투표하기' })).toBeEnabled();
    // 시트는 아래에서 올라옴 → 화면 위쪽은 뒤판(바깥)
    const size = page.viewportSize();
    await page.touchscreen.tap(Math.round(size.width / 2), 40);
    await expect(talk.roster(page)).toHaveCount(0);
});
