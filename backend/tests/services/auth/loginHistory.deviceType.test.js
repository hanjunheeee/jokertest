'use strict';

// 로그인 기록 기기 칸(device_type) 시험, 이메일 로그인·소셜 연결 로그인·소셜 가입 셋 다 기기 값을 담는지
// DB 안 씀 (audit 가짜 저장소), 컨트롤러 → 서비스 경로는 이메일 로그인 하나로 HTTP까지 확인
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'login-history-device-type-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');

const authService = require('../../../services/auth/account');
const social = require('../../../services/auth/social');
const economyService = require('../../../services/economy');
const { hashPassword } = require('../../../utils/auth/credentials');
const { notFoundHandler, globalErrorHandler } = require('../../../middlewares/errorHandler.middleware');
const { listenOnFetchableUrl } = require('../../helpers/fetchablePort');
const { useAuthStore, swap } = require('../../audit-2026-11-09/authFakes');
// 약관 동의·만 14세 검사는 통과로 (그 검사는 member-약관 시험 몫)
require('../../helpers/termsStub').passSignupTermsForFile();

const PASSWORD = 'device-type-pass';
const REQ_INFO = { ip: '10.2.2.2', userAgent: 'device-type-agent', deviceType: 'MOBILE' };
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const sha256 = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// 가입된 이메일 계정 하나 넣기
const seedUser = async (store) => {
    const user = {
        uuid: 'u-device', email: 'device@example.com', nickname: '기기', role: 'USER', status: 'ACTIVE',
        password_hash: await hashPassword(PASSWORD), failed_login_count: 0, locked_until: null,
    };
    store.data.users.push(user);
    return user;
};

test('이메일 로그인: 성공 기록에 기기 종류가 담긴다', async (t) => {
    const store = useAuthStore(t);
    await seedUser(store);
    await authService.login({ email: 'device@example.com', password: PASSWORD }, REQ_INFO);
    assert.equal(store.data.history.length, 1);
    assert.equal(store.data.history[0].success, true);
    assert.equal(store.data.history[0].device_type, 'MOBILE');
});

test('이메일 로그인: 비번 틀린 실패 기록에도 기기 종류가 담긴다', async (t) => {
    const store = useAuthStore(t);
    await seedUser(store);
    await assert.rejects(authService.login({ email: 'device@example.com', password: 'wrong-pass' }, REQ_INFO), (e) => e.status === 401);
    assert.equal(store.data.history[0].success, false);
    assert.equal(store.data.history[0].device_type, 'MOBILE');
});

test('소셜 연결 로그인: 로그인 기록에 기기 종류가 담긴다', async (t) => {
    const store = useAuthStore(t);
    const user = await seedUser(store);
    store.data.identities.push({ id: 'ident-1', provider: 'google', subject: 'g-device', user_id: user.uuid });
    const result = await social.resolveOAuthAccount({
        provider: 'google', subject: 'g-device', email: null, cancelled: false, reqInfo: { ...REQ_INFO, deviceType: 'TABLET' },
    });
    assert.equal(result.status, 'LOGIN');
    assert.equal(store.data.history.length, 1);
    assert.equal(store.data.history[0].device_type, 'TABLET');
});

test('소셜 가입 마무리: 첫 로그인 기록에 기기 종류가 담긴다', async (t) => {
    const store = useAuthStore(t);
    swap(t, economyService, 'ensureDefaultEntitlements', async () => ({}));
    const raw = 'intent-device-type';
    store.data.intents.push({
        id: 'intent-row-1', intent_token_hash: sha256(raw), provider: 'google', subject: 'g-new',
        email: 'social-device@example.com', expires_at: new Date(Date.now() + 30 * 60 * 1000), consumed_at: null,
    });
    await social.completeSocialSignup({
        intentToken: raw, nickname: '가면기기', birthDate: '2000-01-02', reqInfo: { ...REQ_INFO, deviceType: 'PC' },
    });
    assert.equal(store.data.history.length, 1);
    assert.equal(store.data.history[0].device_type, 'PC');
});

test('로그인 주소: 아이폰 브라우저 정보로 로그인하면 기록 기기 칸이 MOBILE (컨트롤러가 만든 값이 끝까지 감)', async (t) => {
    const store = useAuthStore(t);
    await seedUser(store);
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/auth', require('../../../routes/auth.routes'));
    app.use(notFoundHandler);
    app.use(globalErrorHandler);
    const httpServer = require('node:http').createServer(app);
    const base = await listenOnFetchableUrl(httpServer);
    t.after(() => new Promise((resolve) => httpServer.close(resolve)));

    const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': IPHONE_UA },
        body: JSON.stringify({ email: 'device@example.com', password: PASSWORD }),
    });
    assert.equal(res.status, 200);
    assert.equal(store.data.history.length, 1);
    assert.equal(store.data.history[0].device_type, 'MOBILE');
    assert.equal(store.data.history[0].user_agent, IPHONE_UA);
});
