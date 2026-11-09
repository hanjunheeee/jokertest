// 점검 큰 안내 (휴대폰 크기, 서버 전체에 걸려 @serial → serial 프로젝트에서 휴대폰 context로 돎): AD-159
// 판 중 예약 → 큰 안내·강제 종료 문구 → 시작 시각 강제 종료 안내 → 로비
const { test, expect } = require('../../helpers/fixtures');
const { setMaintenance, clearMaintenance, notice, noticeButton } = require('../maintenance/_maint');

test('AD-159 휴대폰 크기 판 중 큰 안내·강제 종료 안내 @serial @game', async ({ players, table, internal }) => {
    const phone = await players.add({ mobile: true })
    await table.setup({ humans: [phone], bots: 1 })
    try {
        await setMaintenance(internal, { enabled: true, startsInMs: 10000 })
        const box = notice(phone.page)
        await expect(box).toContainText('점검 예정이에요', { timeout: 15000 })
        await expect(box).toContainText('시각이 되면 진행 중 판이 강제로 끝나요')
        // 큰 안내가 화면 폭 안에 들어옴 (375px)
        const rect = await box.boundingBox()
        expect(rect.x).toBeGreaterThanOrEqual(0)
        expect(rect.x + rect.width).toBeLessThanOrEqual(375)

        await expect(box).toContainText('점검으로 판이 끝났어요', { timeout: 30000 })
        await noticeButton(phone.page, '로비로 가기').click()
        await expect(phone.page).toHaveURL(/\/lobby/)
    } finally {
        await clearMaintenance(internal)
    }
})
