// 가짜 소셜 제공자 주소 시험, 시험 손잡이 켜졌을 때만 바뀌고 운영이면 늘 진짜 주소 + 운영에 값 있으면 시작 거부
// 빈칸 채우기(소셜) — config/e2eHooks.js getOAuthTestBaseUrl, oauth/google·discord constants.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getOAuthTestBaseUrl, assertNoE2eInProduction, E2E_ONLY_KEYS } = require('../../config/e2eHooks');
const { isStartupFatal } = require('../../config/requiredEnv');

const BACKEND_DIR = path.join(__dirname, '..', '..');

// 새 node에서 constants.js를 불러 주소만 받음 (불러올 때 환경값을 읽어서 따로 띄움)
const loadEndpoints = (provider, env) => {
    const file = `./services/auth/oauth/${provider}/constants`;
    const r = spawnSync(process.execPath, ['-e', `process.stdout.write(JSON.stringify(require(${JSON.stringify(file)})))`], {
        cwd: BACKEND_DIR,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
        encoding: 'utf8',
    });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
};

test('손잡이 켜짐 + 값 있음이면 → 끝 빗금 뗀 주소, 손잡이 꺼짐·운영·값 없음이면 → null', () => {
    assert.equal(getOAuthTestBaseUrl('GOOGLE_OAUTH_BASE_URL', { E2E_HOOKS: '1', GOOGLE_OAUTH_BASE_URL: ' http://127.0.0.1:4180/ ' }), 'http://127.0.0.1:4180');
    assert.equal(getOAuthTestBaseUrl('GOOGLE_OAUTH_BASE_URL', { GOOGLE_OAUTH_BASE_URL: 'http://127.0.0.1:4180' }), null);
    assert.equal(getOAuthTestBaseUrl('GOOGLE_OAUTH_BASE_URL', { E2E_HOOKS: '1', NODE_ENV: 'production', GOOGLE_OAUTH_BASE_URL: 'http://x' }), null);
    assert.equal(getOAuthTestBaseUrl('DISCORD_OAUTH_BASE_URL', { E2E_HOOKS: '1', DISCORD_OAUTH_BASE_URL: '   ' }), null);
});

test('운영에 가짜 제공자 주소가 있으면 → 시작 거부 오류(운영이라 치명), 개발이면 지나감', () => {
    assert.ok(E2E_ONLY_KEYS.includes('GOOGLE_OAUTH_BASE_URL'));
    assert.ok(E2E_ONLY_KEYS.includes('DISCORD_OAUTH_BASE_URL'));
    for (const key of ['GOOGLE_OAUTH_BASE_URL', 'DISCORD_OAUTH_BASE_URL']) {
        const env = { NODE_ENV: 'production', [key]: 'http://127.0.0.1:4180' };
        let caught = null;
        try { assertNoE2eInProduction(env); } catch (error) { caught = error; }
        assert.equal(caught?.code, 'E2E_IN_PRODUCTION');
        assert.match(caught.message, new RegExp(key));
        assert.equal(isStartupFatal(caught, env), true);
        assert.doesNotThrow(() => assertNoE2eInProduction({ NODE_ENV: 'development', E2E_HOOKS: '1', [key]: 'http://x' }));
    }
});

test('값이 없으면 → Google·Discord 주소가 진짜 제공자 주소 그대로', () => {
    assert.deepEqual(loadEndpoints('google', {}), {
        GOOGLE_TOKEN_ENDPOINT: 'https://oauth2.googleapis.com/token',
        GOOGLE_USERINFO_ENDPOINT: 'https://openidconnect.googleapis.com/v1/userinfo',
        GOOGLE_AUTH_ENDPOINT: 'https://accounts.google.com/o/oauth2/v2/auth',
    });
    assert.deepEqual(loadEndpoints('discord', {}), {
        DISCORD_TOKEN_ENDPOINT: 'https://discord.com/api/oauth2/token',
        DISCORD_USERINFO_ENDPOINT: 'https://discord.com/api/users/@me',
        DISCORD_AUTH_ENDPOINT: 'https://discord.com/api/oauth2/authorize',
    });
});

test('손잡이 켜짐 + 값 있음이면 → 세 주소가 가짜 제공자 아래로, 운영이면 값이 있어도 진짜 주소', () => {
    assert.deepEqual(loadEndpoints('google', { E2E_HOOKS: '1', GOOGLE_OAUTH_BASE_URL: 'http://127.0.0.1:4180' }), {
        GOOGLE_TOKEN_ENDPOINT: 'http://127.0.0.1:4180/token',
        GOOGLE_USERINFO_ENDPOINT: 'http://127.0.0.1:4180/v1/userinfo',
        GOOGLE_AUTH_ENDPOINT: 'http://127.0.0.1:4180/o/oauth2/v2/auth',
    });
    assert.deepEqual(loadEndpoints('discord', { E2E_HOOKS: '1', DISCORD_OAUTH_BASE_URL: 'http://127.0.0.1:4181' }), {
        DISCORD_TOKEN_ENDPOINT: 'http://127.0.0.1:4181/api/oauth2/token',
        DISCORD_USERINFO_ENDPOINT: 'http://127.0.0.1:4181/api/users/@me',
        DISCORD_AUTH_ENDPOINT: 'http://127.0.0.1:4181/api/oauth2/authorize',
    });
    const prod = loadEndpoints('google', { NODE_ENV: 'production', E2E_HOOKS: '1', GOOGLE_OAUTH_BASE_URL: 'http://127.0.0.1:4180' });
    assert.equal(prod.GOOGLE_TOKEN_ENDPOINT, 'https://oauth2.googleapis.com/token');
});
