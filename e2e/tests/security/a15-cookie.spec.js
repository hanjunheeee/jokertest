'use strict';

// 로그인 쿠키·브라우저 저장소 브라우저 시험 (PC·모바일 창) — 화면 스크립트가 로그인 쿠키를 못 읽음, 가입·로그인 뒤 저장소에 토큰·비번 글자 없음
// 목록 A15-보안.md 번호 A15-E-027~030 (쓰는 동안 안 돌림: npx playwright test --list tests/security/a15-cookie.spec.js)
const { test, expect, E2E, ui } = require('../../helpers/fixtures');
const K = require('../auth/_a11a-kit');
const k = require('./_a15-kit');

// 가입 끝 알림 글
const SIGNUP_DONE = '회원가입이 완료되었습니다! 로그인해주세요.';

// 화면으로 로그인 → 로비 → 스크립트가 보는 쿠키 글(document.cookie)
async function cookieSeenByScript(page, account) {
    await ui.loginViaUi(page, account);
    await expect(page).toHaveURL(/\/lobby$/);
    return page.evaluate(() => document.cookie);
}

for (const [id, label, mobile] of [['A15-E-027', 'PC', false], ['A15-E-028', '모바일', true]]) {
    const smoke = id === 'A15-E-027' ? ' @smoke' : '';
    test(`${id} ${label} 로그인 뒤 document.cookie에 accessToken·refreshToken 없음${smoke}`, async ({ players, accounts }) => {
        const account = await accounts.create();
        const person = await players.add({ mobile, account, login: false, lobby: false });
        const seen = await cookieSeenByScript(person.page, account);
        // 브라우저엔 로그인 쿠키가 실제로 있음 (스크립트만 못 봄)
        const names = (await person.context.cookies(E2E.apiUrl)).map((c) => c.name);
        expect(names, '브라우저에 로그인 쿠키가 있음').toContain('accessToken');
        expect(seen).not.toContain('accessToken');
        expect(seen).not.toContain('refreshToken');
    });
}

for (const [id, label, mobile] of [['A15-E-029', 'PC', false], ['A15-E-030', '모바일', true]]) {
    test(`${id} ${label} 화면으로 가입 → 로그인 뒤 localStorage·sessionStorage에 토큰·비번 글자 없음`, async ({ players }) => {
        test.setTimeout(150_000);
        const person = await players.add({ mobile, login: false, lobby: false });
        const page = person.page;
        const v = await K.prepareSignup(page);
        expect(await K.submitSignupByButton(page)).toBe(SIGNUP_DONE);
        // 가입 칸에 친 비번이 저장소에 남는지 가입 직후에도 봄
        await k.expectStorageClean(page, { secrets: [v.password] });
        await K.loginToLobby(page, { email: v.email, password: v.password });
        const tokens = (await person.context.cookies(E2E.apiUrl))
            .filter((c) => c.name === 'accessToken' || c.name === 'refreshToken').map((c) => c.value);
        expect(tokens.length, '로그인 쿠키가 있음').toBeGreaterThan(0);
        await k.expectStorageClean(page, { secrets: [...tokens, v.password] });
    });
}
