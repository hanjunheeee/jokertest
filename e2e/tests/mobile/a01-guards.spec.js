'use strict';

// 모바일 방 만들기 거절 브라우저 시험 — 5명 판 산 채로 나간 뒤 방 만들기 → 안내 창 "탈주로 …" 글, 점검 중 방 만들기 → 점검 글
// 목록 A01a-방만들기-설정-시작.md 번호 A01-E-131·132 (132는 서버 전체에 걸려 @serial → serial 프로젝트에서 휴대폰 창으로 돎), 돌리지 않고 모임만: npx playwright test --list tests/mobile/a01-guards.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { e2e } = require('../../helpers/internal');
const A9 = require('../ingame/_a09-simple-kit');
const K = require('../room/_a01a-kit');

test('A01-E-131 모바일 5명 판 산 채로 나감 → 방 만들기 → 안내 창 "탈주로 4분 5x초 뒤에…" 읽힘 @game @smoke', async ({ user, table }) => {
    const page = user.page;
    const t = await A9.seat(table, user, { n: 5 });
    await A9.toDay(t);
    await A9.leaveAlive(page);
    const text = await A9.createRoomAlert(page, { close: false });
    // 나간 직후 1초 안이면 "5분 0초" (서버가 초를 올림)
    expect(text).toMatch(/^탈주로 (?:5분 0초|4분 5\d초) 뒤에 참여할 수 있습니다\.$/);
    await expectReadable(A9.noticeText(page));
    await A9.closeNotice(page);
    expect(await e2e.roomOf(K.U(user))).toBeNull();
});

test('A01-E-132 모바일 점검 중 방 만들기 → 점검 글 @serial', async ({ players }) => {
    // serial 프로젝트는 PC 창이라 휴대폰 사람을 따로 엶
    const phone = await players.add({ mobile: true });
    try {
        await K.setMaint({ enabled: true, startsInMs: -1000 });
        await K.openSetupPage(phone.page);
        await K.dismissMaintNotice(phone.page);
        const text = await ui.captureAlert(phone.page, () => phone.page.getByRole('button', { name: '게임 만들기' }).click());
        expect(text).toBe(K.MSG.MAINTENANCE_DEFAULT);
        expect(await e2e.roomOf(K.U(phone))).toBeNull();
    } finally {
        await K.clearMaint();
    }
});
