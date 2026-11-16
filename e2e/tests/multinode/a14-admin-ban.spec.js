'use strict';

// 서버 두 대 관리자 정지 어려운 브라우저 시험 (E2E_NODES=2) — 관리자 정지 요청은 ㄱ서버, 플레이어는 ㄴ서버 로비 → 플레이어 첫 안내가 "정지된 계정"(세션 만료 글 아님)
// 목록 시험목록/A14-관리자.md 번호 A14-H-006 — 서버 2대에서만 돎 / 모임만: E2E_NODES=2 npx playwright test --list --no-deps tests/multinode/a14-admin-ban.spec.js
const mn = require('./_mn');
const ui = require('../../helpers/ui');
const k = require('../admin/_a14-kit');

const { test, expect, NODE_IDS } = mn;
const { H, TEXT } = k;
const SESSION_EXPIRED = '로그인 유지 시간이 지났습니다.';

/** 관리자 창의 쓰기 요청(GET 빼고)을 앞단이 그 서버로 보내게 ?node= 붙임 */
async function pinAdminWrites(page, node) {
    await page.route('**/admin-api/**', (route) => {
        const req = route.request();
        if (req.method() === 'GET') return route.continue();
        const url = new URL(req.url());
        url.searchParams.set('node', node);
        return route.continue({ url: url.toString() });
    });
}

test(`${H(6)} 서버 2대: 관리자 정지는 ㄱ서버, 플레이어는 ㄴ서버 → 플레이어 첫 안내 "정지된 계정"(세션 만료 글 아님) @hard @smoke`, async ({ browser, onNode }) => {
    test.setTimeout(180_000);
    const [near, far] = NODE_IDS;
    const player = await onNode.person(far, { mobile: false });
    const w = await k.openAdmin(browser);
    try {
        await pinAdminWrites(w.page, near);
        const box = await k.banUi(w.page, player, { days: 1, reason: '서버 둘 정지' });
        // 플레이어 창에 처음 뜬 알림 하나만 봄
        const first = await ui.captureAlert(player.page, () => k.confirmBan(w.page, box));
        expect(first).toContain(TEXT.bannedPush);
        expect(first).not.toContain(SESSION_EXPIRED);
        await expect(player.page).toHaveURL(/\/login/);
        expect(await k.loginAlert(player.page, player.account)).toBe(TEXT.bannedLogin('서버 둘 정지'));
    } finally {
        await w.close();
    }
});
