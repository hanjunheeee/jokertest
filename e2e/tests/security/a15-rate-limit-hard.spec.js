'use strict';

// 로그인 ip 제한 창이 끝나면 다시 되는지 브라우저 시험 (PC, 진짜 시간) — 한도 5번·창 20초로 따로 띄운 서버, 6번째 막힘 글 → 20초 진짜로 기다림 → 로그인 됨
// 목록 A15-보안.md 번호 A15-H-010 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-rate-limit-hard.spec.js)
const { test, expect } = require('../../helpers/fixtures');
const { api, startSec, rand } = require('./_sec');
const K = require('../auth/_a11a-kit');
const k = require('./_a15-kit');

const LOGIN_LIMITED = '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.';
// 이 파일의 따로 띄운 서버 (보안 전용 포트 4번)
const SEC_SLOT = 4;
const WINDOW_MS = 20_000;
// 허용 폭 ±1.5초 (더 늘려 덮지 않음)
const SLACK_MS = 1_500;

test('A15-H-010 로그인 제한(한도 5·창 20초) 6번째 막힘 글 → 진짜로 20초 기다림(±1.5초) → 로그인 됨 @hard @realtime @smoke', async ({ page, accounts }) => {
    test.setTimeout(300_000);
    const server = await startSec(SEC_SLOT, { defaultIpLimits: true, overrides: { LOGIN_IP_MAX: '5', LOGIN_IP_WINDOW_MS: String(WINDOW_MS) } });
    try {
        const ip = k.uniqueIp();
        const acc = await accounts.create();
        // 창은 첫 요청 때 열림 → 그 직전 시각부터 셈
        const windowStart = Date.now();
        for (let i = 0; i < 5; i += 1) {
            const r = await api('POST', '/auth/login', {
                base: server.url, headers: { 'x-forwarded-for': ip }, body: { email: `a15-nobody-${rand()}-${i}@example.test`, password: 'testpass-wrong-1' },
            });
            expect(r.status, `${i + 1}번째는 안 막힘`).toBe(401);
        }
        await k.pointApiAt(page, server.url, { ip });
        expect(await K.loginAlert(page, acc.email, acc.password), '6번째 (맞는 비번)').toBe(LOGIN_LIMITED);
        // 창 끝 1.5초 전: 아직 막힘
        await page.waitForTimeout(Math.max(0, windowStart + WINDOW_MS - SLACK_MS - Date.now()));
        expect(await K.loginAlert(page, acc.email, acc.password), '창 끝 1.5초 전').toBe(LOGIN_LIMITED);
        // 창 끝 1.5초 뒤: 됨 (한 번 더 막힌 요청은 지난 창에 셈)
        await page.waitForTimeout(Math.max(0, windowStart + WINDOW_MS + SLACK_MS - Date.now()));
        await K.loginToLobby(page, acc);
        await expect(page).toHaveURL(/\/lobby$/);
    } finally {
        await server.stop();
    }
});
