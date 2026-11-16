'use strict';

// 탈주 5분 진짜로 기다리는 브라우저 시험 — 5명 판 산 채로 나감 → 4분 50초엔 방 만들기 거절, 5분 1초엔 됨 (이 시험만 쓰는 새 계정)
// 목록 A01a-방만들기-설정-시작.md 번호 A01-H-006 (@hard @realtime, 한 판 + 5분 넘게 걸림), 돌리지 않고 모임만: npx playwright test --list tests/room/a01-hard-desertion.spec.js
const { test, expect } = require('../../helpers/fixtures');
const { e2e } = require('../../helpers/internal');
const A9 = require('../ingame/_a09-simple-kit');
const K = require('./_a01a-kit');

// 첫 탈주 대기 5분 (결정 "탈주 벌" 1번째)
const FIRST_WAIT_MS = 5 * 60_000;

test('A01-H-006 5명 판 산 채로 나감 → 4분 50초엔 방 만들기 거절, 5분 1초엔 방 만들어짐 @game @hard @realtime @smoke', async ({ user, table }) => {
    test.setTimeout(480_000);
    const t = await A9.seat(table, user, { n: 5 });
    await A9.toDay(t);
    // 나가기 확인을 누르기 바로 전 시각 → 서버 탈주 시각은 이보다 늦거나 같음
    const before = Date.now();
    await A9.leaveAlive(user.page);

    await A9.sleepUntil(before + FIRST_WAIT_MS - 10_000);
    const text = await A9.createRoomAlert(user.page);
    const left = K.waitSecondsOf(text);
    expect(left, `4분 50초 때 거절 글: ${text}`).not.toBeNull();
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(12);
    expect(await e2e.roomOf(K.U(user))).toBeNull();

    // 서버 탈주 시각이 몇 초 늦을 수 있어 그만큼 더 지난 뒤 (5분 1초 + 나가기 처리 시간)
    await A9.sleepUntil(Date.now() + (left * 1000) + 1000);
    await A9.createRoomOk(user.page);
    await K.waitRoom(K.U(user));
});
