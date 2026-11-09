// 점검 큰 안내 (데스크톱, 서버 전체에 걸려 @serial): AD-156 판 중 예약 → 큰 안내·띠, AD-157 시작 시각 강제 종료·대기방 닫힘 → 로비, AD-158 시작 전 끄기 → 사라짐·판 계속
// 점검 줄은 DB를 고친 뒤 Node마다 다시 읽게 함 (관리자 화면 대신), finally에서 꼭 끔
const { test, expect, ui } = require('../../helpers/fixtures');
const { setMaintenance, clearMaintenance, notice, band, noticeButton } = require('./_maint');

const MIN = 60 * 1000;

test.describe('점검 큰 안내 @serial', () => {
    test('AD-156 판 진행 중 점검 예약 → 판 화면 가운데 큰 안내·남은 시간 → 닫으면 위쪽 띠 @serial @game', async ({ user, table, internal }) => {
        await table.setup({ humans: [user], bots: 1 })
        try {
            await setMaintenance(internal, { enabled: true, startsInMs: 15 * MIN })
            const box = notice(user.page)
            await expect(box).toBeVisible({ timeout: 15000 })
            await expect(box).toContainText('점검 예정이에요')
            await expect(box).toContainText('시각이 되면 진행 중 판이 강제로 끝나요')
            await expect(box.locator('[data-maintenance-remaining]')).toHaveText(/1[45]분 \d\d초/)
            // 1초마다 줄어듦
            const first = await box.locator('[data-maintenance-remaining]').innerText()
            await expect(box.locator('[data-maintenance-remaining]')).not.toHaveText(first, { timeout: 3000 })
            await noticeButton(user.page, '확인했어요').click()
            await expect(box).toBeHidden()
            await expect(band(user.page)).toContainText(/점검까지 1[45]분/)
            await expect(user.page).toHaveURL(/\/ingame/)
        } finally {
            await clearMaintenance(internal)
        }
    })

    test('AD-157 시작 시각 → 진행 판 끝남·무효 안내·로비, 대기방 사람도 로비 @serial @game', async ({ user, table, players, bots, internal }) => {
        const t = await table.setup({ humans: [user], bots: 1 })
        // 대기방에만 있는 사람 (봇 방장 방)
        const [host] = await bots.spawn(1)
        const room = await host.createRoom({})
        const waiting = await players.add()
        await ui.joinRoomByCodeUi(waiting.page, room.roomCode)
        try {
            await setMaintenance(internal, { enabled: true, startsInMs: 8000 })
            await expect(notice(user.page)).toContainText('점검 예정이에요', { timeout: 15000 })

            await expect(notice(user.page)).toContainText('점검으로 판이 끝났어요', { timeout: 30000 })
            await expect(notice(user.page)).toContainText('승패 없이 끝났어요')
            await noticeButton(user.page, '로비로 가기').click()
            await expect(user.page).toHaveURL(/\/lobby/)
            await expect.poll(async () => (await t.state())?.phase ?? 'GONE', { timeout: 10000 }).toMatch(/ENDED|GONE/)

            await expect(notice(waiting.page)).toContainText('점검으로 대기방이 닫혔어요', { timeout: 30000 })
            await noticeButton(waiting.page, '로비로 가기').click()
            await expect(waiting.page).toHaveURL(/\/lobby/)
        } finally {
            await clearMaintenance(internal)
        }
    })

    test('AD-158 예약 뒤 시작 전 끄기 → 안내 사라짐, 판 계속 @serial @game', async ({ user, table, internal }) => {
        const t = await table.setup({ humans: [user], bots: 1 })
        try {
            await setMaintenance(internal, { enabled: true, startsInMs: 15 * MIN })
            await expect(notice(user.page)).toBeVisible({ timeout: 15000 })
            await clearMaintenance(internal)
            await expect(notice(user.page)).toBeHidden({ timeout: 15000 })
            await expect(band(user.page)).toHaveCount(0)
            await expect(user.page).toHaveURL(/\/ingame/)
            expect((await t.state())?.phase).not.toBe('ENDED')
        } finally {
            await clearMaintenance(internal)
        }
    })
})
