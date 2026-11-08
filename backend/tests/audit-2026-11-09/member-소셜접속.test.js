'use strict';

// 회원 기능 시험: 소셜 로그인(구글·디스코드 공통 계정 찾기)도 users.last_login_at을 남김
// DB 안 씀 (가짜 저장소), 세션 발급은 가짜
process.env.DATABASE_URL = 'mysql://blocked:blocked@127.0.0.1:9/blocked_no_db';
process.env.JWT_SECRET = 'audit-member-social-secret';

const test = require('node:test');
const assert = require('node:assert/strict');

const social = require('../../services/auth/social');
const authService = require('../../services/auth/account');
const { useAuthStore, swap } = require('./authFakes');

const NOW = new Date('2026-11-09T05:00:00.000Z');

const setUp = (t, user = {}) => {
    t.mock.timers.enable({ apis: ['Date'], now: NOW });
    const store = useAuthStore(t);
    swap(t, authService, 'issueSessionForUser', async () => ({ token: 'access', refreshToken: null, refreshTokenExpiresAt: null }));
    const row = { uuid: 'social-user', email: 's@example.com', nickname: '소셜', status: 'ACTIVE', last_login_at: null, ...user };
    store.data.users.push(row);
    store.data.identities.push({ id: 'i-1', provider: 'discord', subject: 'd-1', user_id: row.uuid });
    return { store, row };
};

for (const provider of ['google', 'discord']) {
    test(`소셜 로그인(${provider}): 연결된 계정이면 로그인 기록과 함께 last_login_at을 지금 시각으로`, async (t) => {
        const { store, row } = setUp(t);
        store.data.identities[0].provider = provider;
        const result = await social.resolveOAuthAccount({ provider, subject: 'd-1', email: null, reqInfo: { ip: '1.1.1.1' } });
        assert.equal(result.status, 'LOGIN');
        assert.equal(row.last_login_at.getTime(), NOW.getTime());
        assert.equal(store.data.history.length, 1);
    });
}

test('소셜 로그인: 쓸 수 없는 계정·정지 계정은 last_login_at 안 바뀜', async (t) => {
    const { row, store } = setUp(t, { status: 'WITHDRAWN' });
    await assert.rejects(social.resolveOAuthAccount({ provider: 'discord', subject: 'd-1' }), (e) => e.code === 'ACCOUNT_INACTIVE');
    assert.equal(row.last_login_at, null);

    row.status = 'ACTIVE';
    store.data.bans.push({ user_id: row.uuid, reason: 'x' });
    await assert.rejects(social.resolveOAuthAccount({ provider: 'discord', subject: 'd-1' }), (e) => e.code === 'ACCOUNT_BANNED');
    assert.equal(row.last_login_at, null);
});
