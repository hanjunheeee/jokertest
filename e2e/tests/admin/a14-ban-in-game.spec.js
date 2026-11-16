'use strict';

// 관리자 판 중 정지 어려운 브라우저 시험 (관리자 PC 창 + 사람 2 + 봇 4 = 6명 판) — 관리자 화면에서 ㄴ 정지 → ㄴ 창 정지 안내 → 진짜 60초 → ㄱ 창 ㄴ 탈락, 판 계속
// 목록 시험목록/A14-관리자.md 번호 A14-H-001 (@realtime, A09-H-029와 같은 길을 관리자 화면에서 누름) — 모임만: npx playwright test --list tests/admin/a14-ban-in-game.spec.js
const { test, expect, ui } = require('../../helpers/fixtures');
const { expectReadable } = require('../../helpers/visible');
const A = require('../ingame/_a04-multi');
const N = require('../ingame/b-night/_night');
const k = require('./_a14-kit');

const { H, U, NICK, TEXT } = k;
const GRACE_MS = 60_000;
const card = (page, nickname) => page.locator(`[data-ingame-player-nickname="${nickname}"]`).first();

// 판 카드 상태가 그 값이 된 시각(ms) — 화면 안에서 프레임마다 봐서 늦지 않음
async function statusAt(page, nickname, status, { timeout }) {
    await page.waitForFunction(([name, want]) => {
        const el = [...document.querySelectorAll('[data-ingame-player-nickname]')].find((e) => e.getAttribute('data-ingame-player-nickname') === name);
        return el?.getAttribute('data-ingame-player-status') === want;
    }, [nickname, status], { timeout, polling: 'raf' });
    return Date.now();
}

test(`${H(1)} 6명 판(사람 2 + 봇 4) 판 중 관리자 화면에서 ㄴ 정지 → ㄴ 창 정지 안내 → 진짜 60초 → ㄱ 창 ㄴ 탈락, 판 계속 @game @hard @realtime @smoke`, async ({ browser, players, table }) => {
    test.setTimeout(300_000);
    const a = await k.openPlayer(players);
    const b = await k.openPlayer(players);
    const t = await A.openTable(table, { humans: [a, b], bots: 4, roles: A.plainRoles() });
    await N.toDay(t);
    await A.calm(a.page);
    const w = await k.openAdmin(browser);
    try {
        const box = await k.banUi(w.page, b, { days: 1, reason: '판 중 정지' });
        const pushed = await ui.captureAlert(b.page, () => k.confirmBan(w.page, box));
        expect(pushed).toContain(TEXT.bannedPush);
        const dropAt = await statusAt(a.page, NICK(b), 'disconnected', { timeout: 15_000 });
        // 손잡이 없이 진짜 60초 (결정 "판 도중 끊김": 60초)
        const deadAt = await statusAt(a.page, NICK(b), 'dead', { timeout: GRACE_MS + 15_000 });
        A.expectNear(deadAt - dropAt, GRACE_MS, '끊긴 지 60초에 ㄱ 창 ㄴ 탈락');
        await expectReadable(card(a.page, NICK(b)).getByText(NICK(b), { exact: true }));
        // 판은 5명으로 계속
        const s = await t.state();
        expect(s?.phase).not.toBe('ENDED');
        expect(s.players.find((p) => p.uuid === U(b))?.isParticipating).toBe(false);
        expect(s.players.filter((p) => p.alive && p.isParticipating !== false)).toHaveLength(5);
        await expect(a.page).toHaveURL(/\/ingame/);
    } finally {
        await w.close();
    }
});
