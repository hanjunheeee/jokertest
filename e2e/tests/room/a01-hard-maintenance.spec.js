'use strict';

// 점검 시작 시각에 대기방이 닫히는 브라우저 시험 — 사람 2 + 봇 3 대기방, 점검을 30초 뒤로 켜면 그 시각에 두 화면 다 "점검으로 대기방이 닫혔어요"
// 목록 A01a-방만들기-설정-시작.md 번호 A01-H-010 (@hard @serial @realtime — 서버 전체에 걸려 serial 프로젝트에서 하나씩), 돌리지 않고 모임만: npx playwright test --list tests/room/a01-hard-maintenance.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { e2e } = require('../../helpers/internal');
const { botsJoinAndReady } = require('./roomHelpers');
const A9 = require('../ingame/_a09-simple-kit');
const K = require('./_a01a-kit');

// 점검까지 30초, 진짜 시간 허용 폭 ±1.5초 (DB 시각은 초 단위라 1초 더 일찍 될 수 있음)
const LEAD_MS = 30_000;
const SLACK_MS = 1500;
const forcedNotice = (page) => page.locator('[data-maintenance-notice="forced"]');

test('A01-H-010 대기방에서 점검 시작 시각 30초 뒤로 켬 → 그 시각에 두 화면 대기방 닫히고 점검 안내 @hard @serial @realtime @smoke', async ({ user, players, bots }) => {
    test.setTimeout(180_000);
    const A = user;
    const B = await players.add();
    try {
        const room = await K.createRoomOn(A, { maxPlayers: 10, jokers: 1 });
        await ui.joinRoomByCodeUi(B.page, room.roomCode);
        await botsJoinAndReady(await bots.spawn(3), K.U(A), room.roomCode);

        const startsAt = Date.now() + LEAD_MS;
        await K.setMaint({ enabled: true, startsInMs: LEAD_MS });
        // 시각 전: 대기방 그대로, 닫힘 안내 없음
        await A9.sleepUntil(startsAt - 1000 - SLACK_MS);
        expect(await e2e.roomOf(K.U(A)), '점검 시각 전에 대기방이 닫힘').not.toBeNull();
        for (const p of [A, B]) await expect(forcedNotice(p.page)).toHaveCount(0);
        // 시각 뒤 (허용 폭 안): 두 화면 다 닫힘 안내, 서버 대기방 없음
        for (const p of [A, B]) {
            await expect(forcedNotice(p.page)).toBeVisible({ timeout: Math.max(1000, startsAt + SLACK_MS + 2000 - Date.now()) });
            await expect(forcedNotice(p.page)).toContainText('점검으로 대기방이 닫혔어요');
        }
        expect(await e2e.roomOf(K.U(A))).toBeNull();
        expect(await e2e.roomOf(K.U(B))).toBeNull();
    } finally {
        await K.clearMaint();
    }
});
