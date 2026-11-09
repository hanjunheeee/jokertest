// 본보기(서버 꺼짐, serial 프로젝트): 시험 백엔드에 종료 신호 → 화면에 점검 안내(alert) → 다시 켜질 때까지 기다림
const { test, expect } = require('../../helpers/fixtures');
const servers = require('../../helpers/servers');

test('서버가 꺼지면 → 로비 화면에 점검 안내 알림이 뜸 @shutdown', async ({ user }) => {
    const { page } = user;
    try {
        const dialog = page.waitForEvent('dialog', { timeout: 20000 });
        await servers.triggerShutdown();
        const notice = await dialog;
        expect(notice.message()).toMatch(/점검|업데이트|연결/);
        await notice.accept();
    } finally {
        // 다음 시험 전에 꼭 다시 켜진 걸 확인
        await servers.waitBackendUp();
    }
});
