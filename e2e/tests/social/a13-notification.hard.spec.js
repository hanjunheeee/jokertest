'use strict';

// 알림 읽음 동시에 둘 어려움 브라우저 시험 (PC, 같은 계정 탭 2) — 안 읽음 3개를 두 탭에서 같은 순간 열어도 두 탭 배지 0, 오류 글 없음, DB 3줄 읽음
// 목록 A13-친구-알림-초대.md 번호 A13-H-006 (계획 2-5 "알림 읽음 동시에 둘"), 쓰는 동안 안 돌림 — npx playwright test --list tests/social/a13-notification.hard.spec.js
const { test, expect } = require('../../helpers/fixtures');
const ui = require('../../helpers/ui');
const K = require('./_a13-kit');

test('A13-H-006 같은 계정 두 탭에서 안 읽음 3개 알림 창을 동시에 열기 → 두 탭 배지 0, 오류 글 없음, DB read_at 3줄 @hard @smoke', async ({ accounts, players }) => {
    test.setTimeout(120_000);
    const account = await K.quietAccount(accounts);
    const ids = [];
    for (let i = 0; i < 3; i += 1) ids.push(await K.insertNotice(account.uuid));
    const first = await players.add({ account });
    // 같은 쿠키로 둘째 탭 (첫 탭 소켓은 밀리지만 알림 목록·읽음은 HTTP라 그대로 됨)
    const second = await first.context.newPage();
    await ui.gotoLobby(second);
    const tabs = [first.page, second];
    for (const page of tabs) await expect(K.noticeEntry(page)).toHaveAttribute('data-notification-unread-count', '3');

    await Promise.all(tabs.map((page) => K.noticeEntry(page).click()));
    for (const page of tabs) {
        await expect(K.noticeDialog(page)).toBeVisible();
        await expect(K.noticeRows(page)).toHaveCount(3);
        await expect(K.noticeEntry(page)).toHaveAttribute('data-notification-unread-count', '0');
        await expect(K.noticeDialog(page).getByRole('alert')).toHaveCount(0);
    }
    await expect.poll(async () => (await K.readTimes(ids)).filter(Boolean).length, { message: 'DB 읽은 줄 수' }).toBe(3);
});
