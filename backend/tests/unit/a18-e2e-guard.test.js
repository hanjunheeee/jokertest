'use strict';

// 시험 손잡이 막기 시험 — E2E_HOOKS는 정확히 1 + 운영 아닐 때만, 운영에 시험 전용 값 있으면 거부(이름만), 메일 파일·가짜 소셜 주소는 운영에서 늘 꺼짐
// 목록 A18-B-030~041 (docs/게임_의도_2026-11-15/시험목록/A18-설정-배포-광고.md), 돌리기: node --env-file=.env.test --test tests/unit/a18-e2e-guard.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { isE2eHooksEnabled, assertNoE2eInProduction, getMailTestOutboxDir, getOAuthTestBaseUrl } = require('../../config/e2eHooks');

// 오류 받기 (안 던지면 null)
const errorOf = (fn) => {
    try { fn(); return null; } catch (error) { return error; }
};

// 시험 전용 값마다 넣어 볼 가짜 글자 (값이 오류 글에 새는지 보려고 다 다르게)
const FAKE_VALUES = {
    E2E_HOOKS: '1',
    MAIL_TEST_OUTBOX_DIR: 'fake-a18-outbox-dir-7q2',
    GOOGLE_OAUTH_BASE_URL: 'http://fake-google-a18.example.test',
    DISCORD_OAUTH_BASE_URL: 'http://fake-discord-a18.example.test',
    TOSS_API_BASE_URL: 'http://fake-toss-a18.example.test',
};

// ── 030~032: 손잡이가 켜지는 때 ──
[
    ['030', '1', 'development', true],
    ['031', '1', 'production', false],
    ['032', 'true', 'development', false],
].forEach(([no, hooks, nodeEnv, enabled]) => {
    test(`A18-B-${no} E2E_HOOKS=${hooks} + ${nodeEnv} → ${enabled ? '켜짐' : '꺼짐'}`, () => {
        assert.equal(isE2eHooksEnabled({ E2E_HOOKS: hooks, NODE_ENV: nodeEnv }), enabled);
    });
});

// ── 033~038: 운영에 시험 전용 값 하나씩 → 거부, 다섯 다 없으면 통과 ──
Object.keys(FAKE_VALUES).forEach((key, i) => {
    const no = String(33 + i).padStart(3, '0');
    test(`A18-B-${no} 운영 + ${key} → E2E_IN_PRODUCTION, 글에 이름만`, () => {
        const error = errorOf(() => assertNoE2eInProduction({ NODE_ENV: 'production', [key]: FAKE_VALUES[key] }));
        assert.ok(error, '거부가 안 됨');
        assert.equal(error.code, 'E2E_IN_PRODUCTION');
        assert.match(error.message, new RegExp(key));
        // E2E_HOOKS의 1은 글 어디에나 있을 수 있는 글자라 값 검사는 나머지 넷만
        if (key !== 'E2E_HOOKS') assert.equal(error.message.includes(FAKE_VALUES[key]), false, '넣은 값 글자가 샘');
    });
});

test('A18-B-038 운영 + 시험 전용 값 다섯 다 없음 → 통과', () => {
    assert.equal(errorOf(() => assertNoE2eInProduction({ NODE_ENV: 'production', JWT_SECRET: 'fake-not-checked-here' })), null);
});

// ── 039~040: 메일 파일 받기 ──
test('A18-B-039 MAIL_TEST_OUTBOX_DIR 있음 + 운영 → 없음(null)', () => {
    assert.equal(getMailTestOutboxDir({ NODE_ENV: 'production', MAIL_TEST_OUTBOX_DIR: FAKE_VALUES.MAIL_TEST_OUTBOX_DIR }), null);
});

test('A18-B-040 MAIL_TEST_OUTBOX_DIR 있음 + 개발 → 그 폴더', () => {
    assert.equal(getMailTestOutboxDir({ NODE_ENV: 'development', MAIL_TEST_OUTBOX_DIR: FAKE_VALUES.MAIL_TEST_OUTBOX_DIR }), FAKE_VALUES.MAIL_TEST_OUTBOX_DIR);
});

// ── 041: 가짜 소셜 로그인 주소 ──
test('A18-B-041 운영 + E2E_HOOKS=1 + GOOGLE_OAUTH_BASE_URL 있음 → 없음(null, 진짜 주소 그대로)', () => {
    const env = { NODE_ENV: 'production', E2E_HOOKS: '1', GOOGLE_OAUTH_BASE_URL: FAKE_VALUES.GOOGLE_OAUTH_BASE_URL };
    assert.equal(getOAuthTestBaseUrl('GOOGLE_OAUTH_BASE_URL', env), null);
});
