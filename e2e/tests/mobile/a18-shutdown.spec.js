'use strict';

// 서버 끄기 안내 브라우저 시험 (모바일) — 로비에 있던 사람에게 양피지 안내 창 "서버 점검·업데이트로 …"(읽힘), 다시 켜진 뒤 로그인 그대로·방 만들기 됨
// 목록 A18-설정-배포-광고.md 번호 A18-E-015 — 시험 서버를 끄고 다시 켜서 @shutdown(serial 프로젝트는 PC 창이라 휴대폰 사람을 따로 엶), 돌리지 않고 모임만: npx playwright test --list --no-deps tests/mobile/a18-shutdown.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const { triggerShutdown, waitBackendUp } = require('../../helpers/servers');
const K = require('../maintenance/_a18-kit');

test('A18-E-015 모바일 로비에 있는 사람, 서버 끄기 → 양피지 안내 창 글 읽힘 → 다시 켜진 뒤 로그인 그대로, 방 만들기 됨 @shutdown @smoke', async ({ players }) => {
    test.setTimeout(180_000);
    const phone = await K.openPhone(players);
    const page = phone.page;
    let text;
    try {
        // 휴대폰은 window.alert 대신 양피지 안내 창 → 글을 읽은 뒤 닫음
        text = await ui.captureAlert(page, () => triggerShutdown(), { timeoutMs: 20_000, close: false });
        await expectReadable(K.parchmentText(page));
        await K.parchment(page).getByRole('button', { name: '확인' }).click();
    } finally {
        await waitBackendUp();
    }
    expect(text).toBe(K.TEXT.SHUTDOWN);

    await ui.gotoLobby(page);
    await expect(page).not.toHaveURL(/\/login/);
    const room = await K.createRoomOk(phone);
    expect(room.hostUuid).toBe(K.U(phone));
});
