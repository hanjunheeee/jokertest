'use strict';

// 서버 끄기 안내 브라우저 시험 (PC) — 로비에 있던 사람에게 "서버 점검·업데이트로 …" 안내, 다시 켜진 뒤 로그인 그대로·방 만들기 됨
// 목록 A18-설정-배포-광고.md 번호 A18-E-014 — 시험 서버를 끄고 다시 켜서 @shutdown(serial 프로젝트, 하나씩), 돌리지 않고 모임만: npx playwright test --list --no-deps tests/maintenance/a18-shutdown.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { triggerShutdown, waitBackendUp } = require('../../helpers/servers');
const K = require('./_a18-kit');

test('A18-E-014 PC 로비에 있는 사람, 서버 끄기 → 안내 글 → 다시 켜진 뒤 로그인 그대로, 방 만들기 됨 @shutdown @smoke', async ({ user }) => {
    test.setTimeout(180_000);
    const page = user.page;
    let text;
    try {
        // 서버가 끊기 전에 보내는 안내 (PC는 브라우저 알림 창)
        text = await ui.captureAlert(page, () => triggerShutdown(), { timeoutMs: 20_000 });
    } finally {
        // 꼭 다시 켜진 걸 확인 (뒤 시험이 서버 없이 돌지 않게)
        await waitBackendUp();
    }
    expect(text).toBe(K.TEXT.SHUTDOWN);

    // 로그아웃 안 됨: 로비가 그대로 열림 (로그인 화면으로 안 감)
    await ui.gotoLobby(page);
    await expect(page).not.toHaveURL(/\/login/);
    const room = await K.createRoomOk(user);
    expect(room.hostUuid).toBe(K.U(user));
});
