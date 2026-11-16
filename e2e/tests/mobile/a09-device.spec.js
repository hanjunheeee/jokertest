'use strict';

// 모바일 같은 계정 다른 기기 브라우저 시험 — 다른 폰으로 로그인하면 새 화면에서 판이 이어지고 옛 화면은 로그인 화면, 옛 화면 안내 글이 읽힘
// 목록 A09-끊김-나가기-탈주.md 번호 A09-E-078·120 (모바일 줄)
const { test, expect } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { talk, clearOverlays } = require('./_talk');
const K = require('../ingame/_a09-simple-kit');

// 밀려난 화면에 뜨는 안내 글 (다른 곳 로그인 알림 또는 세션 끝 알림)
const REPLACED_TEXT = /다른 기기 또는 브라우저에서 로그인|세션이 만료|다시 로그인/;

// 판 앉히고 첫 낮까지
async function seatAtDay(table, user, n) {
    const t = await K.seat(table, user, { n });
    await K.toDay(t);
    await expect(talk.phaseLine(user.page)).toContainText('낮 토론', { timeout: 15_000 });
    await clearOverlays(user.page);
    return t;
}

// 다른 폰(쿠키 따로)으로 같은 계정 로그인 → 판 화면 열기
async function openOtherPhone(players, user, n) {
    const other = await players.add({ mobile: true, account: user.account, lobby: false });
    await other.page.goto('/ingame');
    await expect(other.page).toHaveURL(/\/ingame/, { timeout: 20_000 });
    await expect(talk.layout(other.page)).toBeVisible({ timeout: 20_000 });
    await expect(talk.strip(other.page).locator('[data-strip-slot]')).toHaveCount(n, { timeout: 30_000 });
    return other;
}

test('A09-E-078 모바일 7명 판, 다른 폰으로 로그인 → 새 화면에서 판 그대로, 옛 화면은 로그인 화면 @game @smoke', async ({ user, players, table }) => {
    const page = user.page;
    const me = K.U(user);
    const t = await seatAtDay(table, user, 7);
    const other = await openOtherPhone(players, user, 7);
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    // 새 화면: 같은 날·같은 단계, 내 칸이 산 채
    await clearOverlays(other.page);
    await expect(talk.phaseLine(other.page)).toContainText('제 1일');
    await expect(talk.phaseLine(other.page)).toContainText('낮 토론');
    await expect(talk.mySlot(other.page)).toHaveAccessibleName(`${user.account.nickname}, 나`);
    const row = await t.player(me);
    expect(row.alive).toBe(true);
    expect(row.isParticipating).toBe(true);
});

test('A09-E-120 모바일 6명 판, 다른 기기 로그인 → 옛 모바일 화면의 밀려난 안내 글이 읽힘 @game', async ({ user, players, table }) => {
    const page = user.page;
    await seatAtDay(table, user, 6);
    await openOtherPhone(players, user, 6);
    // 옛 화면: 안내 창 글 (로그인 화면으로 옮겨진 뒤에도 못 닫은 안내는 다시 뜸)
    const notice = K.noticeText(page);
    await expect(notice).toHaveText(REPLACED_TEXT, { timeout: 20_000 });
    await expectReadable(notice);
    await K.closeNotice(page);
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
});
