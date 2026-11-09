// 보안(로그인 필요): 로그인 쿠키 없이 보호 경로를 부르면 전부 401, 서명 틀린 쿠키도 401이고 그 쿠키를 지움
// 경로마다 따로 확인 (한 곳이라도 로그인 검사를 빠뜨리면 남의 데이터가 샘)
// 근거: docs/보안_점검_2026-11-09.md '권한'·'인증'(로그인 필요한 경로)
const { test, expect } = require('../../helpers/fixtures');
const { api } = require('./_sec');

// [메서드, 경로] — 로그인 없이 부르면 401이어야 하는 경로들
const PROTECTED = [
    ['GET', '/user/me/profile'],
    ['PATCH', '/user/me/nickname'],
    ['PATCH', '/user/me/password'],
    ['GET', '/user/me/account'],
    ['POST', '/user/me/withdraw'],
    ['POST', '/user/me/email/code'],
    ['POST', '/user/me/email/verify'],
    ['GET', '/user/me/terms'],
    ['POST', '/user/me/terms/agree'],
    ['GET', '/user/me/role-statistics'],
    ['GET', '/user/role-statistics/ranking'],
    ['GET', '/user/me/achievements'],
    ['GET', '/user/me/emoji-palette'],
    ['PUT', '/user/me/emoji-palette'],
    ['GET', '/friends'],
    ['GET', '/friends/search?q=a'],
    ['GET', '/friends/requests/incoming'],
    ['POST', '/friends/requests'],
    ['GET', '/friends/invites'],
    ['POST', '/friends/blocks'],
    ['GET', '/notifications'],
    ['DELETE', '/notifications/read'],
    ['PATCH', '/notifications/1/read'],
    ['GET', '/economy/accounts/x/wallet'],
    ['GET', '/economy/accounts/x/transactions'],
    ['POST', '/economy/purchase'],
    ['POST', '/economy/purchases/bulk'],
    ['POST', '/economy/gold-purchases'],
    ['POST', '/economy/equip'],
    ['POST', '/economy/coupons/redeem'],
    ['POST', '/economy/topup/orders'],
    ['GET', '/economy/currency-products'],
    ['POST', '/economy/admin/grant'],
    ['POST', '/reports'],
    ['GET', '/game/x'],
];

const bodyless = (m) => m === 'GET' || m === 'DELETE';

test.describe('로그인 쿠키 없음 → 401', () => {
    for (const [method, path] of PROTECTED) {
        test(`${method} ${path} 를 로그인 없이 부르면 → 401`, async () => {
            const r = await api(method, path, bodyless(method) ? {} : { body: {} });
            expect(r.status).toBe(401);
        });
    }
});

test.describe('서명 틀린 쿠키 → 401이고 쿠키 지움', () => {
    for (const [method, path] of PROTECTED.filter(([m]) => m === 'GET').slice(0, 10)) {
        test(`${method} ${path} 에 깨진 토큰 쿠키 → 401, accessToken 쿠키를 지움`, async () => {
            const r = await api(method, path, { cookie: 'accessToken=broken.token.value' });
            expect(r.status).toBe(401);
            // 깨진 토큰은 다시 안 보내게 쿠키를 지우는 Set-Cookie가 옴
            expect(r.setCookies.some((l) => /^accessToken=;|^accessToken=\s*;/.test(l))).toBe(true);
        });
    }
});
