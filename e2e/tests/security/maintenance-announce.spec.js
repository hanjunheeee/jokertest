// 보안(서버 전체에 걸리는 것 — @serial, 감독이 마지막에 돌림): 점검 모드 때 방 만들기·입장 막힘, 접속자 전체 공지가 글자로만 보임
// 서버 하나(4100) 상태를 통째로 바꾸므로 다른 시험과 같이 돌리면 안 됨 → @serial 로 표시, 이 파트에서는 안 돌림
// 근거: docs/보안_점검_2026-11-09.md '설정'·'입력 XSS'(공지)
const { test, expect } = require('../../helpers/fixtures');
const sec = require('../../helpers/security');
const { api, login, db } = require('./_sec');

// 점검 켜고 끄기 (반드시 finally에서 꺼서 다른 시험을 안 막음)
async function setMaintenance(internal, enabled, message = '서버 점검 중입니다.') {
    await db.query('UPDATE maintenance_state SET is_enabled = ?, message = ?, starts_at = NULL, ends_at = NULL, updated_at = NOW() WHERE id = 1', [enabled ? 1 : 0, enabled ? message : null]);
    await internal.reloadMaintenance();
}

test.describe('점검 모드 @serial', () => {
    test('점검을 켜면 → 소켓으로 방을 만들려 해도 거절(MAINTENANCE) @serial', async ({ accounts, bots, internal }) => {
        try {
            await setMaintenance(internal, true);
            const [bot] = await bots.spawn(1);
            const reply = await bot.request('create_room', {});
            expect(reply?.ok).not.toBe(true);
            expect(String(reply?.code ?? '')).toMatch(/MAINTENANCE/i);
        } finally {
            await setMaintenance(internal, false);
        }
    });

    test('점검을 켜면 → 코드로 방에 들어가려 해도 들어가지지 않음 @serial', async ({ bots, internal }) => {
        try {
            await setMaintenance(internal, true);
            const [bot] = await bots.spawn(1);
            const since = Date.now();
            bot.emit('join_room_by_code', { roomCode: 'ABCDEF' });
            const result = await Promise.race([
                bot.waitForEvent('room_join_failed', { since }).then(() => 'failed'),
                bot.waitForEvent('room_joined', { since }).then(() => 'joined'),
                new Promise((r) => setTimeout(() => r('none'), 5000)),
            ]);
            expect(result).not.toBe('joined');
        } finally {
            await setMaintenance(internal, false);
        }
    });

    test('점검을 끄고 다시 읽으면 → 방 만들기가 다시 됨 @serial', async ({ bots, internal }) => {
        await setMaintenance(internal, true);
        await setMaintenance(internal, false);
        const [bot] = await bots.spawn(1);
        const reply = await bot.request('create_room', {});
        expect(reply?.ok).toBe(true);
    });
});

test.describe('접속자 전체 공지 @serial', () => {
    test('전체 공지 본문에 스크립트를 넣어도 → 받는 화면에 글자로만 보임 @serial', async ({ page, context, accounts, internal, ui }) => {
        const trap = await sec.trapXss(page);
        const account = await accounts.create();
        await ui.loginViaApi(context, account);
        await ui.gotoLobby(page);
        const [payload] = sec.xssPayloads('online-announce');
        await internal.announce({ announcementId: `e2e-online-${Date.now()}`, title: '전체 공지', body: payload, target: 'online' });
        await page.waitForTimeout(1500);
        await page.getByRole('button', { name: /^알림/ }).click().catch(() => {});
        await page.waitForTimeout(500);
        sec.assertNoXss(trap);
    });
});
